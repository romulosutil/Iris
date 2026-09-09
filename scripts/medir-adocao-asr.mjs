import postgres from "postgres";
import { assertScriptRemotoPermitido } from "./lib/guardrail-conexao.mjs";

/**
 * #500 — Medição de ADOÇÃO do ditado de voz (§6.6 do `infra/asr/runbook.md`).
 *
 * ── QUAL PERGUNTA ESTE SCRIPT RESPONDE ────────────────────────────────────
 * Não é "o serviço está de pé?" — isso o heartbeat e o `alarme-jobs.mjs` já
 * respondem, e responderam `ok` durante os sete dias em que a produção não
 * transcreveu um único clipe (medição de 07/09/2026, #500). A pergunta que
 * nenhum alarme do repo faz é o degrau seguinte:
 *
 *     serviço no ar ≠ feature usada.
 *
 * Todo alarme existente mede saúde de JOB (heartbeat avançando, fila drenando,
 * `ultimo_erro` nulo). Uma feature ligada e ignorada é indistinguível de uma
 * feature ligada e funcionando enquanto ninguém contar as linhas que ela
 * deveria ter produzido. Este script conta.
 *
 * ── POR QUE É SÓ LEITURA, E COMO ISSO É IMPOSTO ───────────────────────────
 * O script existe para rodar contra PRODUÇÃO (é lá que a pergunta faz
 * sentido). Por isso a transação roda sob `SET TRANSACTION READ ONLY`: o
 * próprio Postgres recusa qualquer escrita que passe por aqui, hoje ou depois
 * de alguém editar uma consulta. É trava medida, não promessa de docblock.
 *
 * ── POR QUE PRECISA DA ROLE DONA ──────────────────────────────────────────
 * `audio_capture`, `session` e `session_note` são `FORCE ROW LEVEL SECURITY`
 * com policies tenant-scoped. `DATABASE_URL` (role da aplicação) sem
 * `app.clinic_id` no contexto devolveria ZERO linhas — e zero por RLS é
 * indistinguível de zero por falta de uso, que é exatamente o número em
 * disputa. Por isso o script exige a role dona
 * (`SMOKE_DATABASE_URL`/`MIGRATION_DATABASE_URL`), que enxerga todos os
 * tenants, e nunca `DATABASE_URL`.
 *
 * ── O QUE ELE NÃO VÊ ──────────────────────────────────────────────────────
 * `FEATURE_FLAG_ASR_ENABLED` e `ASR_PROVIDER` são env do serviço `App`, não
 * linha de banco: nenhuma consulta aqui prova que a flag está ligada. Esse
 * item continua sendo o passo 1 do §6.1 (conferir no painel). O script mede o
 * LADO DO BANCO da mesma pergunta.
 *
 * Uso:
 *   SMOKE_DATABASE_URL=postgres://iris:...@host/iris \
 *   ALLOW_SEED_REMOTE=true \
 *   node scripts/medir-adocao-asr.mjs [--dias=7]
 */

/** Cadência do cron de rede de segurança (`CRON_TICK_ASR`), em minutos. */
export const CRON_TICK_ASR_MINUTOS = 1;

/** Janela padrão da medição, em dias. */
export const DIAS_PADRAO = 7;

/**
 * Resolve configuração a partir de env + argv, com as mesmas recusas do
 * `smoke-alerta-risco.mjs`. Puro: os testes o chamam sem tocar em banco.
 *
 * @param {Record<string, string | undefined>} env
 * @param {string[]} argv
 * @returns {{ dbUrl: string, dias: number }}
 * @throws {Error} URL ausente ou `--dias` inválido
 */
export function resolverConfig(env, argv) {
  const dbUrl = env.SMOKE_DATABASE_URL || env.MIGRATION_DATABASE_URL;
  if (!dbUrl) {
    throw new Error(
      "Defina SMOKE_DATABASE_URL (ou MIGRATION_DATABASE_URL) com a role DONA do banco.\n" +
        "DATABASE_URL não serve: é a role da aplicação e a RLS a faria contar ZERO clipe " +
        "em qualquer cenário — indistinguível do zero por falta de uso, que é o número em disputa.",
    );
  }

  const flagDias = argv.find((a) => a.startsWith("--dias="));
  if (!flagDias) return { dbUrl, dias: DIAS_PADRAO };

  const bruto = flagDias.slice("--dias=".length);
  const dias = Number(bruto);
  if (!Number.isInteger(dias) || dias < 1 || dias > 365) {
    throw new Error(
      `--dias precisa ser inteiro entre 1 e 365; recebido "${bruto}".`,
    );
  }
  return { dbUrl, dias };
}

/**
 * Piso de ticks que fecharam sem trabalho, derivado — não medido.
 *
 * O `processados: N` do §6.2 sai no LOG da rota, não em tabela nenhuma, então
 * não há consulta que o conte. O que dá para afirmar sem log: o cron gira
 * `dias * 24 * 60 / cadência` vezes, e um tick só tem trabalho se havia clipe.
 * Como um mesmo tick pode levar VÁRIOS clipes, `clipes` é teto do número de
 * ticks úteis — logo o resultado é PISO de ticks vazios, nunca o valor exato.
 *
 * @param {{ clipes: number, dias: number, cadenciaMinutos?: number }} params
 * @returns {{ ticksTotais: number, ticksVaziosPiso: number }}
 */
export function derivarTicksVazios({
  clipes,
  dias,
  cadenciaMinutos = CRON_TICK_ASR_MINUTOS,
}) {
  const ticksTotais = Math.round((dias * 24 * 60) / cadenciaMinutos);
  return {
    ticksTotais,
    ticksVaziosPiso: Math.max(0, ticksTotais - clipes),
  };
}

/**
 * Traduz os contadores em veredito. A ordem das perguntas importa: sem sessão
 * documentada no período não há nada a concluir sobre o ditado — dizer "gap de
 * adoção" nesse caso seria afirmar causa que a medição não sustenta.
 *
 * @param {{ sessoesComCaptura: number, clipes: number, transcritos: number }} m
 * @returns {{ codigo: string, titulo: string, explicacao: string }}
 */
export function classificarAdocao({ sessoesComCaptura, clipes, transcritos }) {
  if (sessoesComCaptura === 0) {
    return {
      codigo: "sem-uso-do-produto",
      titulo: "Nada a concluir sobre o ditado",
      explicacao:
        "Nenhuma sessão foi documentada na janela. Sem oportunidade de gravar, zero clipe não " +
        "diz nada sobre a feature — amplie a janela com --dias antes de interpretar.",
    };
  }
  if (clipes === 0) {
    return {
      codigo: "gap-de-adocao",
      titulo: "Feature oferecida e não usada",
      explicacao:
        "Houve sessão documentada e nenhum clipe gravado. O gap é de descoberta/UI, não de " +
        "infraestrutura: nenhum alarme do repo cobre isso, porque todos medem saúde de job.",
    };
  }
  if (transcritos === 0) {
    return {
      codigo: "pipeline-travado",
      titulo: "Clipe gravado, nenhum transcrito",
      explicacao:
        "O terapeuta gravou e o pipeline não fechou. Aqui o problema é de infraestrutura — " +
        "triagem por sintoma no §6.4 do infra/asr/runbook.md.",
    };
  }
  return {
    codigo: "em-uso",
    titulo: "Pipeline exercitado por uso real",
    explicacao:
      "Há clipe transcrito na janela. Os números de latência e cadência abaixo respondem a " +
      "pergunta do §6.6 que substituiu o INTERVALO_S.",
  };
}

/**
 * Primeira linha de uma consulta agregada. Toda consulta com `count(*)` sem
 * `GROUP BY` devolve exatamente uma linha; se não devolveu, o problema é a
 * conexão, não o dado — falhar alto aqui evita `undefined` viajando até o
 * relatório e virando "0" silencioso.
 *
 * @template T
 * @param {readonly T[]} linhas
 * @param {string} nome
 * @returns {T}
 */
function primeira(linhas, nome) {
  const linha = linhas[0];
  if (!linha) {
    throw new Error(
      `Consulta "${nome}" não devolveu linha. Agregado sem GROUP BY sempre devolve uma — investigue a conexão, não o dado.`,
    );
  }
  return linha;
}

/**
 * Coleta as medidas. Recebe a tag `sql` já dentro da transação READ ONLY —
 * daí o tipo aceitar tanto `Sql` quanto a `TransactionSql` que `sql.begin`
 * entrega.
 *
 * @param {import("postgres").Sql | import("postgres").TransactionSql} sql
 * @param {number} dias
 */
export async function coletar(sql, dias) {
  const janela = `${dias} days`;

  const clinicasLinhas = await sql`
    SELECT count(*) FILTER (WHERE NOT is_demo)::int AS reais,
           count(*) FILTER (WHERE is_demo)::int     AS demo
      FROM clinic`;

  const usoLinhas = await sql`
    SELECT count(DISTINCT s.id)::int           AS sessoes,
           count(DISTINCT s.clinic_id)::int    AS clinicas_ativas,
           count(DISTINCT s.terapeuta_id)::int AS terapeutas
      FROM session s
      JOIN clinic c ON c.id = s.clinic_id
     WHERE NOT c.is_demo
       AND s.criado_em > now() - ${janela}::interval`;

  const capturaLinhas = await sql`
    SELECT count(DISTINCT n.session_id)::int AS sessoes_com_captura
      FROM session_note n
      JOIN clinic c ON c.id = n.clinic_id
     WHERE NOT c.is_demo
       AND n.tipo = 'captura_rapida'
       AND n.criado_em > now() - ${janela}::interval`;

  // `is_demo` NÃO é filtrado fora aqui: a clínica de teste do smoke do §6.2
  // pode ser demo, e escondê-la faria o próprio smoke sumir da medição.
  // Separar em duas colunas mostra as duas coisas sem misturá-las.
  const porStatus = await sql`
    SELECT a.asr_status::text                         AS status,
           count(*) FILTER (WHERE NOT c.is_demo)::int AS reais,
           count(*) FILTER (WHERE c.is_demo)::int     AS demo
      FROM audio_capture a
      JOIN clinic c ON c.id = a.clinic_id
     WHERE a.criado_em > now() - ${janela}::interval
     GROUP BY 1
     ORDER BY 1`;

  const latenciaLinhas = await sql`
    SELECT count(*)::int AS transcritos,
           round(percentile_cont(0.5) WITHIN GROUP (
             ORDER BY extract(epoch FROM a.transcrito_em - a.criado_em)))::int AS p50_s,
           round(max(extract(epoch FROM a.transcrito_em - a.criado_em)))::int  AS max_s
      FROM audio_capture a
     WHERE a.asr_status = 'transcrito'
       AND a.transcrito_em IS NOT NULL
       AND a.criado_em > now() - ${janela}::interval`;

  // Sem recorte de janela de propósito: resgate pendente é dívida acumulada
  // (§1.4), não fato do período — limitá-lo aos últimos N dias esconderia
  // áudio clínico preso desde antes.
  const resgateLinhas = await sql`
    SELECT count(*)::int AS pendentes
      FROM audio_capture
     WHERE asr_status = 'falhou' AND objeto_ref IS NOT NULL`;

  const heartbeats = await sql`
    SELECT job,
           round(extract(epoch FROM now() - ultimo_ok))::int AS idade_s,
           ultimo_erro IS NOT NULL AS tem_erro
      FROM job_heartbeat
     WHERE job IN ('asr', 'asr-sweeper')
     ORDER BY job`;

  const clinicas = primeira(clinicasLinhas, "clinicas");
  const uso = primeira(usoLinhas, "uso");
  const captura = primeira(capturaLinhas, "captura");
  const latencia = primeira(latenciaLinhas, "latencia");
  const resgate = primeira(resgateLinhas, "resgate");
  const clipes = porStatus.reduce((t, l) => t + l.reais + l.demo, 0);

  return {
    dias,
    clinicas,
    uso,
    sessoesComCaptura: captura.sessoes_com_captura,
    porStatus: [...porStatus],
    clipes,
    latencia,
    resgatePendentes: resgate.pendentes,
    heartbeats: [...heartbeats],
  };
}

/**
 * Relatório em texto. Puro (recebe as medidas já coletadas) para que o teste
 * afirme o CONTEÚDO sem precisar de banco.
 *
 * @param {Awaited<ReturnType<typeof coletar>>} m
 * @returns {string}
 */
export function formatarRelatorio(m) {
  const transcritos = m.latencia?.transcritos ?? 0;
  const veredito = classificarAdocao({
    sessoesComCaptura: m.sessoesComCaptura,
    clipes: m.clipes,
    transcritos,
  });
  const ticks = derivarTicksVazios({ clipes: m.clipes, dias: m.dias });

  const linhas = [
    `═══ Adoção do ditado de voz — últimos ${m.dias} dia(s) (#500 · §6.6) ═══`,
    "",
    `Clínicas ............... ${m.clinicas.reais} reais + ${m.clinicas.demo} demo`,
    `Sessões criadas ........ ${m.uso.sessoes} (${m.uso.clinicas_ativas} clínica(s), ${m.uso.terapeutas} terapeuta(s))`,
    `Sessões documentadas ... ${m.sessoesComCaptura}  <- oportunidades de ditado`,
    `Clipes gravados ........ ${m.clipes}`,
    "",
  ];

  if (m.porStatus.length === 0) {
    linhas.push("  (nenhuma linha em audio_capture na janela)");
  } else {
    for (const l of m.porStatus) {
      linhas.push(
        `  ${l.status.padEnd(14)} ${String(l.reais).padStart(4)} real(is)  ${String(l.demo).padStart(4)} demo`,
      );
    }
  }

  linhas.push(
    "",
    `Transcritos ............ ${transcritos}`,
    transcritos > 0
      ? `Latência criado->transcrito: p50 ${m.latencia.p50_s}s · máx ${m.latencia.max_s}s`
      : "Latência criado->transcrito: sem amostra",
    `Resgate pendente ....... ${m.resgatePendentes} clipe(s) 'falhou' com objeto ainda no bucket`,
    "",
    `Cadência (CRON_TICK_ASR = ${CRON_TICK_ASR_MINUTOS} min): ${ticks.ticksTotais} ticks na janela,`,
    `  no MÍNIMO ${ticks.ticksVaziosPiso} vazios (piso derivado — o "processados: N" só existe no log).`,
    "",
  );

  if (m.heartbeats.length === 0) {
    linhas.push(
      "Heartbeat .............. nenhuma linha para 'asr'/'asr-sweeper'",
    );
  } else {
    for (const h of m.heartbeats) {
      const idade = h.idade_s === null ? "nunca" : `${h.idade_s}s atrás`;
      linhas.push(
        `Heartbeat ${h.job.padEnd(12)} ${idade}${h.tem_erro ? "  ATENÇÃO: ultimo_erro preenchido" : ""}`,
      );
    }
  }

  linhas.push(
    "",
    `VEREDITO [${veredito.codigo}] ${veredito.titulo}`,
    `  ${veredito.explicacao}`,
    "",
    "Este script não lê FEATURE_FLAG_ASR_ENABLED nem ASR_PROVIDER — são env do serviço App.",
    "Confira as duas no painel (§6.1, passo 1) antes de interpretar qualquer número acima.",
  );

  return linhas.join("\n");
}

/**
 * `criarSql` é injeção só de TESTE e não tem default no parâmetro de
 * propósito: com `criarSql = postgres` na assinatura, a capacidade de conectar
 * aparece no texto ANTES da chamada do guard, e o teste de fiação
 * (`scripts/lib/guardrail-conexao-wiring.test.ts`) exige a ordem inversa.
 * Chamar `postgres(` aqui embaixo mantém o script sob a régua por capacidade.
 *
 * @param {Record<string, string | undefined>} env
 * @param {string[]} argv
 * @param {(url: string, opts: object) => import("postgres").Sql} [criarSql]
 */
export async function main(
  env = process.env,
  argv = process.argv.slice(2),
  criarSql,
) {
  const { dbUrl, dias } = resolverConfig(env, argv);
  assertScriptRemotoPermitido(dbUrl, { rotulo: "medir-adocao-asr" });

  const sql = criarSql
    ? criarSql(dbUrl, { max: 1 })
    : postgres(dbUrl, { max: 1 });
  try {
    // READ ONLY é a trava: qualquer escrita futura nesta transação vira erro
    // do Postgres, não revisão de código esquecida.
    const medidas = await sql.begin(async (tx) => {
      await tx`SET TRANSACTION READ ONLY`;
      return coletar(tx, dias);
    });
    console.log(formatarRelatorio(medidas));
    return medidas;
  } finally {
    await sql.end();
  }
}

// `import.meta.url === argv[1]` não casa no Windows; a comparação por sufixo é
// o mesmo critério usado nos outros scripts `.mjs` do repo.
if (process.argv[1]?.endsWith("medir-adocao-asr.mjs")) {
  main().catch((erro) => {
    console.error(`ERRO: ${erro.message}`);
    process.exit(1);
  });
}
