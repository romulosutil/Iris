/**
 * Detector de alarme automático de parada de job de infra (#294).
 *
 * UMA varredura e SAI — o laço é responsabilidade de infra/alarme/agendador.sh
 * (mesmo desenho de escalonamento/arquivamento/retencao).
 *
 * Dedup: cada checagem que falha só dispara e-mail UMA VEZ POR DIA UTC —
 * marcador `.alertado-<motivo>-YYYY-MM-DD` em ALARME_HEARTBEAT_DIR, mesmo
 * padrão do `.ultimo-backup-YYYY-MM-DD` do serviço de backup. Sem isso, um
 * problema persistente vira um e-mail por hora para sempre.
 *
 * LIMITE CONHECIDO E ACEITO: a janela é o dia UTC, não 24h corridas. Um
 * problema que alerta às 23h50 alerta de novo às 00h10. Preferido a uma
 * janela deslizante porque o marcador é legível a olho no Console do
 * Easypanel e some sozinho com o dia — e um e-mail a mais na virada é falha
 * na direção certa para um alarme.
 *
 * O marcador só é gravado depois de um envio BEM-SUCEDIDO: falha de envio
 * tem que reentrar no tick seguinte, senão o dedup silencia o alarme que
 * nunca chegou.
 */
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { hashCurto, log, logarErro } from "./lib/log-estruturado.mjs";
import { promisify } from "node:util";
import postgres from "postgres";
import { detalheDoErro } from "./lib/heartbeat.mjs";
import { enviarEmailAlarme } from "./lib/resend-alarme.mjs";

const execFileP = promisify(execFile);
// Margem sobre a cadência configurada do backup off-site (OFFSITE_INTERVAL_DAYS,
// a mesma variável que já governa o serviço iris-backup — 1 = diário, 7 =
// semanal). Sem isso o limite ficava fixo em 36h presumindo cadência diária,
// e uma réplica semanal legítima (até 168h) disparava alarme todo dia.
const MARGEM_BACKUP_H = 12;

// Checagens que rodam contra o banco (billing, escalonamento) — de fora dessa
// lista ficam `backup-offsite`, cujo `indeterminado` é rotineiro (env ausente
// em dev/CI) e não deve escalar (ver Fix 2 do review final de #294), e os
// heartbeats de #536: eles leem o MESMO banco, então um detector cego já é
// acusado por billing/escalonamento — repetir o alarme sete vezes não ajuda.
const CHECAGENS_COM_ESCALONAMENTO_DE_CEGUEIRA = ["billing", "escalonamento"];
const LIMITE_INDETERMINADO_CONSECUTIVO = 6; // ~6h no intervalo padrão de 1h (INTERVALO_S=3600).
const MOTIVO_DETECTOR_CEGO = (motivo) => `detector-cego-${motivo}`;

/**
 * Contador de `indeterminado` consecutivo por checagem, persistido como
 * arquivo `.indeterminado-consecutivo-<motivo>` no mesmo heartbeatDir dos
 * marcadores de dedup. `ok`/`problema` zera (a checagem voltou a enxergar);
 * `indeterminado` incrementa. Puro em relação ao resto do módulo — só toca
 * disco, sem rede.
 */
export async function lerContadorIndeterminado(heartbeatDir, motivo) {
  const conteudo = await readFile(
    `${heartbeatDir}/.indeterminado-consecutivo-${motivo}`,
    "utf8",
  ).catch(() => "0");
  const n = Number.parseInt(conteudo, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function gravarContadorIndeterminado(heartbeatDir, motivo, n) {
  await mkdir(heartbeatDir, { recursive: true });
  await writeFile(
    `${heartbeatDir}/.indeterminado-consecutivo-${motivo}`,
    String(n),
  );
}

/**
 * Atualiza o contador de `indeterminado` consecutivo para uma checagem e
 * devolve o resultado — o novo valor do contador e se ele já atingiu o
 * limite de escalonamento (`cegou`). `cegou` fica `true` em todo tick a
 * partir do limite, não só no primeiro — quem impede o reenvio diário é o
 * MESMO dedup `deveAlertar`/`marcarAlertado` usado pelas outras checagens,
 * não este contador.
 */
export async function atualizarContadorIndeterminado(heartbeatDir, resultado) {
  const { motivo, estado } = resultado;
  if (!CHECAGENS_COM_ESCALONAMENTO_DE_CEGUEIRA.includes(motivo)) {
    return { contador: 0, cegou: false };
  }
  if (estado !== "indeterminado") {
    await gravarContadorIndeterminado(heartbeatDir, motivo, 0);
    return { contador: 0, cegou: false };
  }
  const anterior = await lerContadorIndeterminado(heartbeatDir, motivo);
  const novo = anterior + 1;
  await gravarContadorIndeterminado(heartbeatDir, motivo, novo);
  return {
    contador: novo,
    cegou: novo >= LIMITE_INDETERMINADO_CONSECUTIVO,
  };
}

export function hojeUTC() {
  return new Date().toISOString().slice(0, 10);
}

export async function deveAlertar(heartbeatDir, motivo, hoje) {
  const arquivos = await readdir(heartbeatDir).catch(() => []);
  return !arquivos.includes(`.alertado-${motivo}-${hoje}`);
}

export async function marcarAlertado(heartbeatDir, motivo, hoje) {
  await mkdir(heartbeatDir, { recursive: true });
  await writeFile(
    `${heartbeatDir}/.alertado-${motivo}-${hoje}`,
    new Date().toISOString(),
  );
}

const LIMITE_BILLING = "2 hours";
const LIMITE_ESCALONAMENTO = "10 minutes";

/**
 * Ciclo de faturamento vencido e ainda `aberto` = iris-billing parado.
 * A folga de 2h é a mesma da consulta manual documentada em infra/README.md
 * (#288) — tempo de sobra para um restart normal do serviço.
 *
 * ATENÇÃO ao ler o resultado: `fecharCiclosVencendo` abre o ciclo N+1 na mesma
 * passada em que fecha o N, então um `billing_cycle` com status `aberto` e
 * `fim` NO FUTURO é o estado normal. Só o `fim` VENCIDO acusa parada — é por
 * isso que o predicado vive na função da 0129 e não é reinventado aqui.
 */
export async function verificarBilling(sql) {
  try {
    const [linha] =
      await sql`SELECT * FROM app_alarme_billing_atrasado(${LIMITE_BILLING}::interval)`;
    if (!linha || linha.total === 0) {
      return { estado: "ok", motivo: "billing", detalhe: "" };
    }
    return {
      estado: "problema",
      motivo: "billing",
      detalhe: `${linha.total} ciclo(s) de faturamento vencido(s) há mais de ${LIMITE_BILLING} sem fechar. Mais antigo: clínica ${linha.primeira_clinic_id}, venceu em ${new Date(linha.primeiro_vencimento).toISOString()}.`,
    };
  } catch (err) {
    return {
      estado: "indeterminado",
      motivo: "billing",
      detalhe: `não foi possível checar: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Alerta de risco com prazo de reconhecimento vencido e ainda `aberto` =
 * iris-escalonamento parado. 10min = 10x o tick de 60s do motor: folga para
 * restart normal, curto o bastante para o prazo clínico não passar batido.
 *
 * O `detalhe` NUNCA carrega paciente, categoria ou trecho — a função da 0129
 * não devolve isso, por desenho.
 */
export async function verificarEscalonamento(sql) {
  try {
    const [linha] =
      await sql`SELECT * FROM app_alarme_escalonamento_atrasado(${LIMITE_ESCALONAMENTO}::interval)`;
    if (!linha || linha.total === 0) {
      return { estado: "ok", motivo: "escalonamento", detalhe: "" };
    }
    return {
      estado: "problema",
      motivo: "escalonamento",
      detalhe: `${linha.total} alerta(s) de risco com prazo de reconhecimento vencido há mais de ${LIMITE_ESCALONAMENTO} sem escalar. Mais antigo: clínica ${linha.primeira_clinic_id}, venceu em ${new Date(linha.primeiro_vencimento).toISOString()}.`,
    };
  } catch (err) {
    return {
      estado: "indeterminado",
      motivo: "escalonamento",
      detalhe: `não foi possível checar: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── #560 F5 (DA-04): contadores da extração ────────────────────────────────
//
// Os três números que a issue pede — extrações/min, latência do provider,
// falhas por provider — saem de UMA chamada a `app_alarme_extracao` (0153) e
// vão para DOIS lugares com propósitos diferentes:
//
//   1. `log.info("alarme-jobs.metricas-extracao")` a CADA tick, sempre. É o
//      contador propriamente dito: um número que muda quando o sistema é
//      exercitado, legível no Console do Easypanel sem abrir o banco.
//   2. e-mail, SÓ quando cruza limiar. "Métrica que ninguém lê é log com outro
//      nome" — e um resumo diário que chega mesmo quando está tudo bem vira
//      filtro de caixa de entrada em duas semanas.
//
// A leitura por CLÍNICA continua sendo a view da 0148 no /supervisao; aqui é a
// leitura do OPERADOR, cross-tenant e de janela curta.

/** Janela de apuração. Curta de propósito: o alarme é sobre AGORA. */
const JANELA_EXTRACAO = "1 hour";
/**
 * Piso de amostra para o limiar de falha morder. Sem ele, a primeira e única
 * extração da manhã falhando é "100% de falha" e manda e-mail — a clínica solo
 * é o caso-base deste produto, não a exceção.
 */
const MIN_CHAMADAS_EXTRACAO = 5;
/**
 * 30% das chamadas da janela sem resolver. Não é 1 falha (transitória é
 * rotina, e o retry do terapeuta resolve) nem 100% (esperar a parada total
 * torna o alarme inútil).
 */
const TETO_TAXA_FALHA_EXTRACAO = 0.3;
/**
 * p95 de 30s contra o timeout de 45s de `resiliencia.ts`
 * (`EXTRACAO_TIMEOUT_MS`): acusa a degradação ANTES de ela virar timeout, que
 * é quando ainda existe decisão a tomar. Acima do timeout o número já não
 * cresce — toda chamada ruim vira falha e sai pelo outro limiar.
 */
const TETO_P95_LATENCIA_MS = 30_000;
const MINUTOS_JANELA_EXTRACAO = 60;
/**
 * ESPELHO de `EXTRACAO_TIMEOUT_MS` (`src/lib/extraction/resiliencia.ts`), que
 * não é importável daqui — o job roda em imagem sem `src/`. Entra só para o
 * e-mail poder dizer contra o que os 30s se comparam; nenhuma decisão depende
 * dele. Se o timeout mudar lá e não aqui, o texto envelhece — o limiar, não.
 */
const TIMEOUT_EXTRACAO_MS_REF = 45_000;

/** Modelo é NULL em provider sem modelo (NullProvider) e em linha pré-0147. */
function rotuloModelo(modelo) {
  return modelo ?? "(sem modelo)";
}

/**
 * Decide o desfecho a partir das linhas já lidas. Pura, para o limiar ser
 * testável sem banco (mesmo motivo de `decidirEnvios` e do `decidirDesfecho`
 * da conciliação, #375).
 *
 * `chamadas === 0` é **ok**, e não `indeterminado`: janela sem extração
 * nenhuma é o estado normal de uma clínica pequena à noite ou num fim de
 * semana. Marcar `indeterminado` aqui acumularia o contador de detector cego e
 * mandaria "o detector pode estar cego" toda madrugada — alarme que grita no
 * silêncio ensina a ignorar a caixa de entrada.
 */
export function avaliarExtracao(linhas) {
  const ok = { estado: "ok", motivo: "extracao", detalhe: "" };
  const chamadas = linhas.reduce((s, l) => s + Number(l.chamadas ?? 0), 0);
  if (chamadas < MIN_CHAMADAS_EXTRACAO) return ok;

  const falhas = linhas.reduce((s, l) => s + Number(l.falhas ?? 0), 0);
  const taxaFalha = falhas / chamadas;

  // p95 por modelo, e não global: um modelo lento diluído num modelo rápido
  // some da média. Só entra no limiar o modelo com amostra suficiente.
  const lento = linhas
    .filter(
      (l) =>
        Number(l.chamadas ?? 0) >= MIN_CHAMADAS_EXTRACAO &&
        l.p95_latencia_ms != null,
    )
    .reduce(
      (pior, l) =>
        pior === null ||
        Number(l.p95_latencia_ms) > Number(pior.p95_latencia_ms)
          ? l
          : pior,
      null,
    );

  const achados = [];
  if (taxaFalha > TETO_TAXA_FALHA_EXTRACAO) {
    const porModelo = linhas
      .filter((l) => Number(l.falhas ?? 0) > 0)
      .map((l) => `${rotuloModelo(l.modelo)}: ${l.falhas}/${l.chamadas}`)
      .join("; ");
    achados.push(
      `${falhas} de ${chamadas} extração(ões) da última ${JANELA_EXTRACAO} está(ão) pendente(s) de reprocessamento (${Math.round(taxaFalha * 100)}%, acima do teto de ${Math.round(TETO_TAXA_FALHA_EXTRACAO * 100)}%). Por modelo — ${porModelo}.`,
    );
  }
  if (lento && Number(lento.p95_latencia_ms) > TETO_P95_LATENCIA_MS) {
    achados.push(
      `p95 de latência do modelo ${rotuloModelo(lento.modelo)} em ${lento.p95_latencia_ms} ms na última ${JANELA_EXTRACAO} (teto: ${TETO_P95_LATENCIA_MS} ms; o timeout da chamada é ${TIMEOUT_EXTRACAO_MS_REF} ms), sobre ${lento.chamadas} chamada(s).`,
    );
  }
  if (achados.length === 0) return ok;
  return { estado: "problema", motivo: "extracao", detalhe: achados.join(" ") };
}

/**
 * Lê os contadores, EMITE o registro de métrica (sempre) e devolve o desfecho.
 *
 * O log sai antes de qualquer decisão de limiar de propósito: o valor da série
 * temporal está em existir todo tick, inclusive — principalmente — nos ticks
 * saudáveis, que é o que dá régua para saber o que "degradado" significa neste
 * produto.
 */
export async function verificarExtracao(sql) {
  let linhas;
  try {
    linhas =
      await sql`SELECT * FROM app_alarme_extracao(${JANELA_EXTRACAO}::interval)`;
  } catch (err) {
    return {
      estado: "indeterminado",
      motivo: "extracao",
      // `detalheDoErro`, e NUNCA `err.message`: este `detalhe` vai no CORPO DO
      // E-MAIL de alarme, e a `message` do driver de Postgres é a query com os
      // params. O helper reduz ao conjunto fechado `erro=<name> code=<code>` —
      // mesmo caminho que `verificarHeartbeats` já usa. As duas checagens da
      // #294 (billing/escalonamento) ainda interpolam a message: são anteriores
      // a esta regra e são dívida à parte, não precedente a copiar.
      detalhe: `não foi possível checar: ${detalheDoErro(err)}`,
    };
  }

  const chamadas = linhas.reduce((s, l) => s + Number(l.chamadas ?? 0), 0);
  const falhas = linhas.reduce((s, l) => s + Number(l.falhas ?? 0), 0);
  // Campos, nunca frase interpolada: o operador filtra `chamadasPorMin` sem
  // escrever um regex por sítio (mesma regra que a F4 aplicou aos `logic.ts`).
  log.info("alarme-jobs.metricas-extracao", {
    janela: JANELA_EXTRACAO,
    chamadas,
    falhas,
    chamadasPorMin: Number((chamadas / MINUTOS_JANELA_EXTRACAO).toFixed(3)),
    porModelo: linhas.map((l) => ({
      modelo: rotuloModelo(l.modelo),
      chamadas: Number(l.chamadas ?? 0),
      falhas: Number(l.falhas ?? 0),
      p95LatenciaMs:
        l.p95_latencia_ms == null ? null : Number(l.p95_latencia_ms),
    })),
  });

  return avaliarExtracao(linhas);
}

export function abrirConexao(databaseUrl) {
  return postgres(databaseUrl, { max: 1 });
}

// ─── #536 (DA-03): heartbeat no banco — os jobs sem efeito colateral visível ─
//
// billing, escalonamento e backup-offsite continuam medidos pelo EFEITO (ciclo
// vencido, alerta vencido, dump no bucket): é a prova mais forte, e não muda
// aqui. Os demais jobs não deixam rastro que se possa medir de fora — um job
// de retenção parado é igual a "nenhum prontuário está a vencer" — então cada
// um grava um sinal de vida em `job_heartbeat` (0146, via
// `scripts/lib/heartbeat.mjs` ou `src/lib/jobs/heartbeat.ts`) e este detector
// lê a tabela inteira numa chamada.
//
// `limiteH` = cadência do agendador + margem (documentado em infra/README.md,
// §Alarme automático). `sobDemanda`: job sem cadência (rodado à mão pelo
// operador) — só a última passada ter FALHADO é problema; linha ausente ou
// antiga é o estado normal.
export const LIMITES_HEARTBEAT = Object.freeze({
  retencao: { limiteH: 36 }, // 1x/dia (86400s) + 12h
  arquivamento: { limiteH: 36 }, // 1x/dia (86400s) + 12h
  exportacao: { limiteH: 1 }, // 5min (300s): 1h = 12 ticks perdidos
  asr: { limiteH: 0.5 }, // 20s: 30min = ~90 ticks perdidos
  "asr-sweeper": { limiteH: 3 }, // 1h (3600s) + 2h
  "expurgo-audit-log": { limiteH: 36 }, // 1x/dia (documentado) + 12h
  conciliacao: { limiteH: null, sobDemanda: true }, // runbook manual (#375)
});

/**
 * Pura: avalia UMA linha de `job_heartbeat` (ou a ausência dela) contra o
 * limite do job. Devolve o mesmo shape das outras checagens.
 *
 * Linha AUSENTE é `problema`, não `indeterminado`: o detector conseguiu ler a
 * tabela e o job simplesmente nunca gravou — ou nunca rodou desde a 0146, ou
 * não está provisionado (é exatamente assim que se mede se
 * `iris-expurgo-audit-log` existe em produção). `indeterminado` fica reservado
 * para "não consegui ler".
 */
function instante(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const t = new Date(valor).getTime();
  return Number.isFinite(t) ? t : null;
}

export function avaliarHeartbeat(job, linha, agora = Date.now()) {
  const regra = LIMITES_HEARTBEAT[job];
  const ok = { estado: "ok", motivo: job, detalhe: "" };
  // `new Date(x).getTime()`, não `Date.parse(x)`: o postgres.js devolve
  // `timestamptz` como objeto `Date`, e `Date.parse` só o aceita por coerção
  // para string (revisão pós-PR #551). Aceita `Date` e ISO igualmente.
  const okEm = instante(linha?.ultimo_ok);
  const erroEm = instante(linha?.ultimo_erro);

  // Última passada falhou depois do último sucesso (ou nunca houve sucesso):
  // vale para todo job, inclusive os sob demanda.
  if (erroEm !== null && (okEm === null || erroEm > okEm)) {
    return {
      estado: "problema",
      motivo: job,
      detalhe: `última passada de "${job}" falhou em ${new Date(erroEm).toISOString()} (${linha.detalhe || "sem detalhe"})${okEm === null ? " — nunca houve passada bem-sucedida" : `; último sucesso em ${new Date(okEm).toISOString()}`}.`,
    };
  }

  if (regra?.sobDemanda) return ok;

  if (!linha || okEm === null) {
    return {
      estado: "problema",
      motivo: job,
      detalhe: `nenhum heartbeat registrado para "${job}" — o job nunca rodou desde a migração 0146 ou o serviço não está provisionado (ver infra/README.md, §Alarme automático).`,
    };
  }

  const idadeH = (agora - okEm) / 3_600_000;
  if (idadeH <= regra.limiteH) return ok;
  return {
    estado: "problema",
    motivo: job,
    detalhe: `último sucesso de "${job}" há ${idadeH.toFixed(1)}h — acima do limite de ${regra.limiteH}h (${linha.detalhe || "sem detalhe"}).`,
  };
}

/**
 * Lê `app_alarme_job_heartbeats()` UMA vez e avalia cada job da tabela de
 * limites. Falha de leitura vira `indeterminado` em TODOS — nunca `ok`.
 */
export async function verificarHeartbeats(sql, agora = Date.now()) {
  const jobs = Object.keys(LIMITES_HEARTBEAT);
  let linhas;
  try {
    linhas = await sql`SELECT * FROM app_alarme_job_heartbeats()`;
  } catch (err) {
    // `name`+`code`, nunca `message` (revisão pós-PR #551): o `detalhe` vai
    // para log e pode ir para e-mail, e a message de erro de driver carrega a
    // query. billing/escalonamento ainda carregam a message — são função sem
    // parâmetro clínico e ficam como estão (fora do escopo desta PR).
    const detalhe = `não foi possível checar: ${detalheDoErro(err)}`;
    return jobs.map((job) => ({
      estado: "indeterminado",
      motivo: job,
      detalhe,
    }));
  }
  const porJob = new Map(linhas.map((l) => [l.job, l]));
  return jobs.map((job) => avaliarHeartbeat(job, porJob.get(job), agora));
}

/**
 * Idade, em horas, do objeto mais recente da listagem.
 *
 * POR QUE `lastModified` E NÃO O CARIMBO DO NOME: um dump legítimo re-subido
 * hoje tem nome antigo, e um dump velho renomeado tem nome novo — nenhum dos
 * dois é o que queremos medir. Pior: um filtro por regex de nome vira "bucket
 * vazio" permanente no dia em que o backup.sh mudar o padrão, e "vazio" aqui
 * dispara alarme. `mc ls --json` dá `lastModified` em ISO e não muda de
 * formato entre versões, ao contrário da saída humana do `mc ls` (o próprio
 * infra/backup/verify-offsite.sh comenta essa armadilha).
 *
 * `saidaJson` é NDJSON: uma linha JSON por objeto.
 */
export function idadeMaisRecenteH(saidaJson, agora) {
  const objetos = saidaJson
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((o) => o.type !== "folder" && o.lastModified);
  if (objetos.length === 0) return null;
  const maisRecente = objetos
    .map((o) => Date.parse(o.lastModified))
    .reduce((a, b) => (b > a ? b : a));
  return (agora - maisRecente) / 3_600_000;
}

export async function verificarBackupOffsite(
  env,
  agora = Date.now(),
  execFn = execFileP,
) {
  const obrigatorias = [
    "OFFSITE_S3_ENDPOINT",
    "OFFSITE_S3_ACCESS_KEY",
    "OFFSITE_S3_SECRET_KEY",
  ];
  const faltando = obrigatorias.filter((v) => !env[v]);
  if (faltando.length > 0) {
    // NÃO é "backup parado" e NÃO manda e-mail: é o detector que não pode
    // checar. Em dev e em CI isso é o normal; um `problema` aqui viraria um
    // e-mail por dia para sempre e ensinaria a ignorar a caixa de entrada.
    return {
      estado: "indeterminado",
      motivo: "backup-offsite",
      detalhe: `não foi possível checar: variável(is) ausente(s) ${faltando.join(", ")}.`,
    };
  }

  const bucket = env.OFFSITE_S3_BUCKET || "iris-backups-offsite";
  const alias = "alarme-offsite";
  try {
    await execFn("mc", [
      "alias",
      "set",
      alias,
      env.OFFSITE_S3_ENDPOINT,
      env.OFFSITE_S3_ACCESS_KEY,
      env.OFFSITE_S3_SECRET_KEY,
      "--api",
      "S3v4",
    ]);
    // MC_REGION obrigatório: sem ele o mc assina como us-east-1 e o destino
    // recusa (memória: teste-com-duble-nao-cobre-dialeto-do-destino).
    const { stdout } = await execFn(
      "mc",
      ["ls", "--json", `${alias}/${bucket}/`],
      { env: { ...process.env, MC_REGION: env.OFFSITE_S3_REGION || "" } },
    );

    const idadeH = idadeMaisRecenteH(stdout, agora);
    if (idadeH === null) {
      // Bucket respondeu e está vazio: isso É problema, não indeterminado.
      return {
        estado: "problema",
        motivo: "backup-offsite",
        detalhe: `Bucket ${bucket} responde, mas está vazio — nenhuma réplica off-site encontrada.`,
      };
    }
    const intervaloDias = Number(env.OFFSITE_INTERVAL_DAYS) || 1;
    const limiteH = intervaloDias * 24 + MARGEM_BACKUP_H;
    if (idadeH <= limiteH) {
      return { estado: "ok", motivo: "backup-offsite", detalhe: "" };
    }
    return {
      estado: "problema",
      motivo: "backup-offsite",
      detalhe: `Réplica off-site mais recente tem ${idadeH.toFixed(1)}h — acima do limite de ${limiteH}h (o backup roda a cada ${intervaloDias} dia(s), OFFSITE_INTERVAL_DAYS).`,
    };
  } catch (err) {
    // Nunca vaza a secret na mensagem — o mc ecoa a chave inválida no erro,
    // como infra/backup/verify-offsite.sh já trata.
    const msg = err instanceof Error ? err.message : String(err);
    return {
      estado: "indeterminado",
      motivo: "backup-offsite",
      detalhe: `não foi possível checar: ${msg.split(env.OFFSITE_S3_SECRET_KEY).join("***")}`,
    };
  }
}

/**
 * Separa o que MERECE e-mail do que só merece log. Pura, para o desfecho ser
 * testável sem tocar em rede nem em disco (mesmo motivo do `decidirDesfecho`
 * do trigger de conciliação, #375).
 */
export function decidirEnvios(resultados) {
  return {
    aEnviar: resultados.filter((r) => r.estado === "problema"),
    aLogar: resultados.filter((r) => r.estado === "indeterminado"),
  };
}

/**
 * Monta o resultado sintético de "detector cego" quando uma checagem de
 * banco (billing/escalonamento) fica `indeterminado` por N scans seguidos —
 * DB fora do ar ou credencial revogada de forma permanente é justamente o
 * cenário em que o detector nunca mais volta a `problema`/`ok` sozinho, e um
 * `console.warn` que só o container vê não avisa ninguém (premissa da #294).
 * `motivo` é o MOTIVO_DETECTOR_CEGO — dedicado, distinto de "billing"/
 * "escalonamento" — para passar pelo MESMO dedup diário de `deveAlertar`.
 */
export function montarAlertaDetectorCego(motivo, contador) {
  return {
    estado: "problema",
    motivo: MOTIVO_DETECTOR_CEGO(motivo),
    detalhe: `checagem "${motivo}" está indeterminada há ${contador} varreduras seguidas (limite: ${LIMITE_INDETERMINADO_CONSECUTIVO}) — o detector pode estar cego (banco fora do ar ou credencial revogada), não só o job checado.`,
  };
}

export async function main() {
  const heartbeatDir = process.env.ALARME_HEARTBEAT_DIR || "/heartbeat";
  await mkdir(heartbeatDir, { recursive: true });

  const databaseUrl = process.env.ALARME_DATABASE_URL;
  if (!databaseUrl) {
    log.error("alarme-jobs.env-ausente", { env: "ALARME_DATABASE_URL" });
    return 1;
  }

  const sql = abrirConexao(databaseUrl);
  const hoje = hojeUTC();
  const resultados = [];

  try {
    resultados.push(await verificarBilling(sql));
    resultados.push(await verificarEscalonamento(sql));
    resultados.push(await verificarExtracao(sql));
    resultados.push(...(await verificarHeartbeats(sql)));
  } finally {
    await sql.end({ timeout: 5 });
  }
  resultados.push(await verificarBackupOffsite(process.env));

  const alertasDeCegueira = [];
  for (const r of resultados) {
    const { contador, cegou } = await atualizarContadorIndeterminado(
      heartbeatDir,
      r,
    );
    if (cegou) {
      alertasDeCegueira.push(montarAlertaDetectorCego(r.motivo, contador));
    }
  }

  const { aEnviar, aLogar } = decidirEnvios([
    ...resultados,
    ...alertasDeCegueira,
  ]);

  for (const r of aLogar) {
    // `alarme`, e não `motivo`: `motivo` está na lista de chaves redigidas (é
    // texto livre clínico no domínio), e o valor aqui — que é conjunto fechado
    // do detector — sairia como `[redigido]`, apagando justamente o dado que
    // faz a linha existir.
    log.warn("alarme-jobs.indeterminado", {
      alarme: r.motivo,
      detalhe: r.detalhe,
    });
  }

  let algumEnvioFalhou = false;
  for (const r of aEnviar) {
    log.warn("alarme-jobs.alarme-detectado", {
      alarme: r.motivo,
      detalhe: r.detalhe,
    });

    if (!(await deveAlertar(heartbeatDir, r.motivo, hoje))) {
      log.info("alarme-jobs.reenvio-suprimido-por-dedup", { alarme: r.motivo });
      continue;
    }

    const envio = await enviarEmailAlarme({
      apiKey: process.env.EMAIL_PROVIDER_API_KEY,
      fromEmail:
        process.env.RESEND_FROM_EMAIL || "notificacoes@irisclinica.ia.br",
      destino: process.env.ALARME_EMAIL_DESTINO,
      motivo: r.motivo,
      detalhe: r.detalhe,
    });
    if (envio.ok) {
      // Só marca depois de enviado: um envio que falhou tem que reentrar no
      // tick seguinte, senão o dedup silencia um alarme que nunca chegou.
      await marcarAlertado(heartbeatDir, r.motivo, hoje);
      log.info("alarme-jobs.email-enviado", { alarme: r.motivo });
    } else {
      algumEnvioFalhou = true;
      // `envio.erro` é texto do PROVEDOR e não entra: uma mensagem de bounce
      // embute o destinatário (memória `campo-livre-de-terceiro-carrega-pii`).
      // O hash basta para ver que é a mesma falha de sempre.
      log.error("alarme-jobs.email-falhou", {
        alarme: r.motivo,
        hashErro: hashCurto(String(envio.erro ?? "")),
      });
    }
  }

  // Carimbo de "eu rodei", gravado SEMPRE — inclusive quando achou problema.
  // É o que prova que o próprio detector está vivo; sem ele, um detector
  // morto e um mundo saudável têm a mesma aparência.
  await writeFile(
    `${heartbeatDir}/.ultima-verificacao`,
    new Date().toISOString(),
  );
  return algumEnvioFalhou ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((codigo) => process.exit(codigo))
    .catch((err) => {
      logarErro("alarme-jobs.erro-fatal", err);
      process.exit(1);
    });
}
