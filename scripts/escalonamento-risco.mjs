/**
 * Motor de escalonamento de alerta de risco clínico (#122, hardening H1).
 *
 * UMA varredura e SAI. O laço é responsabilidade do agendador
 * (`infra/escalonamento/agendador.sh`) — mesmo desenho do backup: o script faz
 * a unidade de trabalho, o agendador decide quando. Assim a mesma unidade roda
 * à mão no console durante um incidente, sem herdar o laço.
 *
 * O QUE ELE FAZ: chama `app_escalonar_risco_vencidos()` (migração 0049), que
 * faz as DUAS transições (aberto → escalado_estagio_1 e escalado_estagio_1 →
 * escalado_estagio_2) numa única chamada e já grava a trilha imutável em
 * `audit_log`. Este processo não decide nada: a regra vive no banco, onde não
 * pode ser forjada por um cliente.
 *
 * O QUE ELE NÃO FAZ — E NÃO PODE PASSAR A FAZER (§4.2.1 / parecer #110):
 * nenhuma saída de rede além do Postgres. Sem webhook, sem SMTP, sem HTTP.
 * O escalonamento é INTERNO À CLÍNICA: muda status no banco e loga. Família,
 * contato de emergência, SAMU, polícia e Conselho Tutelar NÃO são destinatários
 * do Iris em estágio nenhum. Se um dia parecer natural adicionar um `fetch()`
 * aqui, a resposta é não — a decisão de avisar alguém fora da clínica é do
 * profissional, nunca do software.
 *
 * `.mjs` de node puro, sem TS e sem build (mesmo motivo do
 * `scripts/migrate.mjs`): `postgres` é dependência de produção, então isto roda
 * num contexto de deploy enxuto, sem devDependencies e sem tsx.
 *
 *   node scripts/escalonamento-risco.mjs             # uma varredura (default)
 *   node scripts/escalonamento-risco.mjs --once      # idem, explícito
 *   node scripts/escalonamento-risco.mjs --dry-run   # só conta, não muta
 *
 * Env:
 *   ESCALONAMENTO_DATABASE_URL   role de login que herda `iris_escalonamento`.
 *                                Obrigatória. Essa role tem EXECUTE só na
 *                                função de varredura e SELECT em NENHUMA
 *                                tabela — credencial vazada não lê diário,
 *                                paciente nem trecho de risco.
 *   ESCALONAMENTO_HEARTBEAT_DIR  default /heartbeat.
 *   EMAIL_PROVIDER_API_KEY       #126 — sem ela o canal de e-mail ao RT fica
 *                                indisponível (registrado na trilha, não
 *                                silencioso). Neutra de provedor de propósito.
 *   RESEND_FROM_EMAIL            default notificacoes@irisclinica.ia.br.
 *   NEXT_PUBLIC_APP_URL          #126 — URL do painel, único conteúdo acionável
 *                                do e-mail ao RT. Sem ela o envio é recusado
 *                                com falha explícita (ver processarEmailRt).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import {
  detalheDoErro,
  detalheSemPii,
  gravarHeartbeat as gravarHeartbeatNoBanco,
} from "./lib/heartbeat.mjs";
import { enviarEmailRt } from "./lib/resend-rt.mjs";

// Nome deste job em `job_heartbeat` (0143). O detector de alarme continua
// medindo o escalonamento pelo EFEITO (alerta vencido sem escalar, 0129) — o
// heartbeat aqui é sinal complementar, legível no banco, não a checagem.
const JOB = "escalonamento";

// Lido NA CHAMADA, não no import (mesmo desenho de retencao/arquivamento):
// lido no import, o teste que aponta ESCALONAMENTO_HEARTBEAT_DIR para um
// diretório temporário não tem efeito e `gravarHeartbeat()` tenta criar
// `/heartbeat` na raiz do runner do CI (EACCES) — passou local no Windows,
// onde `/heartbeat` vira `C:\heartbeat` gravável, e caiu no CI (PR #551).
const HEARTBEAT_ARQUIVO = ".ultima-varredura";

function heartbeatDir() {
  return process.env.ESCALONAMENTO_HEARTBEAT_DIR ?? "/heartbeat";
}

function log(msg) {
  console.log(`[escalonamento] ${new Date().toISOString()} ${msg}`);
}

/**
 * HEARTBEAT — "o alerta sobre o alerta" (H1).
 *
 * Escrito SÓ depois de uma varredura bem-sucedida. A ausência de heartbeat por
 * ~5 minutos é ela própria condição de alerta operacional: significa que o
 * motor parou, e um motor parado é indistinguível, de dentro do produto, de
 * "nenhum alerta venceu". Esse é exatamente o modo de falha silenciosa que o
 * escalonamento existe para impedir — então ele precisa de um sinal de vida
 * externo, não de uma ausência de erro.
 */
async function gravarHeartbeat() {
  const dir = heartbeatDir();
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, HEARTBEAT_ARQUIVO),
    `${new Date().toISOString()}\n`,
    "utf8",
  );
}

/**
 * Dry-run: conta quantos alertas ESTARIAM vencidos, sem escalar nada.
 *
 * Não chama `app_escalonar_risco_vencidos()` de propósito — aquela função MUTA
 * (é uma CTE data-modifying; não existe "chamar sem efeito"). Aqui o predicado
 * é reescrito em leitura pura, espelhando os dois WHERE da 0049.
 *
 * CUSTO: isto exige SELECT em `alerta_risco_clinico`, que a role do job NÃO
 * tem (e não deve ganhar — é o ponto do desenho). Portanto `--dry-run` só
 * funciona com uma URL de role dona/superuser, à mão, para inspeção. Em
 * produção o job nunca roda com `--dry-run`.
 */
async function dryRun(sql) {
  const linhas = await sql`
    SELECT
      count(*) FILTER (
        WHERE status = 'aberto' AND now() >= prazo_reconhecimento
      )::int AS estagio_1,
      count(*) FILTER (
        WHERE status = 'escalado_estagio_1'
          AND now() >= prazo_reconhecimento + make_interval(mins => prazo_minutos)
      )::int AS estagio_2
    FROM alerta_risco_clinico
    WHERE deletado_em IS NULL
  `;
  const { estagio_1: e1, estagio_2: e2 } = linhas[0];
  log(
    `dry-run: ${e1} alerta(s) escalariam p/ estágio 1, ${e2} p/ estágio 2. Nada foi alterado.`,
  );
}

/**
 * #126 — dispara/registra o e-mail ao RT para UM alerta em estágio 2.
 *
 * Sempre chama `app_registrar_email_rt` no fim (sucesso ou falha) — nunca
 * deixa o alerta sem registro na trilha. Sem RT resolvido (clínica sem RT
 * configurado, ou RT sem papel mais vigente), registra falha explícita sem
 * tentar enviar (§4.2.1: a função de banco já filtra isso, então "sem linha"
 * é o próprio motivo).
 *
 * #154 — o 3º argumento (`p_transitorio`) diz à função de banco se vale
 * retentar. Falha transitória (429/5xx, timeout) grava `_adiado` e o alerta
 * continua elegível em `app_alertas_estagio2_sem_email()`, então a próxima
 * varredura o retenta sozinha — até o teto de 3 tentativas, quando vira
 * `_falhou`. Falha permanente (endereço inválido, canal não configurado)
 * grava `_falhou` de primeira: retentar não mudaria o resultado.
 */
export async function processarEmailRt(sql, alertaId) {
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY;
  const fromEmail =
    process.env.RESEND_FROM_EMAIL ?? "notificacoes@irisclinica.ia.br";
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

  const rts = await sql`SELECT * FROM app_rt_do_alerta(${alertaId})`;
  if (rts.length === 0) {
    // Permanente: clínica sem RT configurado (ou RT sem papel vigente) não se
    // resolve em 3 varreduras de 5 minutos — depende de alguém arrumar o
    // cadastro. Adiar aqui só atrasaria o registro do problema na trilha.
    await sql`SELECT app_registrar_email_rt(${alertaId}, false, false, ${"RT nao encontrado ou sem papel vigente na clinica"})`;
    log(
      `e-mail RT: alerta_id=${alertaId} sem RT resolvido — falha registrada.`,
    );
    return;
  }

  // #329 — bloqueio de tenant. `app_rt_do_alerta` (migração 0105) devolve o RT
  // resolvido MAS com `motivo_bloqueio` preenchido e `rt_email` NULL quando o
  // responsável técnico da clínica não tem papel naquela clínica. Antes da 0105
  // esse caso era filtrado dentro do WHERE da função e saía como zero linhas —
  // gravava "RT nao encontrado", indistinguível de clínica sem RT cadastrado.
  //
  // Aqui NÃO se envia nada e se registra falha PERMANENTE (p_transitorio=false):
  // um RT fora do tenant não se conserta em 3 varreduras de 5 minutos, depende
  // de alguém arrumar o cadastro. E registrar é obrigatório — sem marcador o
  // alerta continua elegível em `app_alertas_estagio2_sem_email()` e a varredura
  // volta nele para sempre.
  const { rt_email: rtEmail, motivo_bloqueio: motivoBloqueio } = rts[0];
  if (motivoBloqueio) {
    await sql`SELECT app_registrar_email_rt(${alertaId}, false, false, ${motivoBloqueio})`;
    log(
      `e-mail RT NÃO enviado por bloqueio de tenant (§4.2.1): alerta_id=${alertaId} ` +
        `motivo=${motivoBloqueio} — falha permanente registrada.`,
    );
    return;
  }

  const resultado = await enviarEmailRt({ apiKey, fromEmail, appUrl, rtEmail });

  if (resultado.ok) {
    await sql`SELECT app_registrar_email_rt(${alertaId}, true, false, ${resultado.providerMessageId})`;
    log(
      `e-mail RT enviado: alerta_id=${alertaId} providerMessageId=${resultado.providerMessageId}`,
    );
  } else {
    await sql`SELECT app_registrar_email_rt(${alertaId}, false, ${resultado.transitorio === true}, ${resultado.erro})`;
    log(
      `e-mail RT FALHOU (transitorio=${resultado.transitorio === true}): ` +
        `alerta_id=${alertaId} erro=${resultado.erro}`,
    );
  }
}

// Exportada só para o teste: o isolamento por alerta (#154) é comportamento de
// `varrer`, não de `processarEmailRt` — testar via `main()` exigiria um banco
// real. Não é ponto de entrada; `main()` continua sendo o único.
export async function varrer(sql) {
  const linhas = await sql`SELECT * FROM app_escalonar_risco_vencidos()`;

  // Uma linha de log por escalonamento. Os campos são EXATAMENTE os que a
  // função devolve — ela não retorna trecho_fonte, nome de paciente nem
  // categoria, e isso é decisão de desenho (H3), não limitação: log de
  // infraestrutura vai para o painel do host e para qualquer coletor futuro,
  // fora do controle de acesso clínico do produto. `alerta_id` é suficiente
  // para correlacionar com a trilha em `audit_log`, que é onde a leitura
  // acontece sob RLS.
  for (const l of linhas) {
    log(
      `escalado alerta_id=${l.out_alerta_id} clinic_id=${l.out_clinic_id} ` +
        `estagio=${l.out_estagio} severidade=${l.out_severidade} ` +
        `prazo_minutos=${l.out_prazo_minutos}`,
    );
  }

  // #126 — recém-escalados pro estágio 2, nesta mesma varredura.
  //
  // #154 — cada alerta é isolado num try/catch próprio. `processarEmailRt` já
  // captura falha do provedor, mas o que escapa dele (queda de conexão com o
  // Postgres no meio de um `app_registrar_email_rt`, por exemplo) derrubava a
  // varredura inteira e silenciava TODOS os alertas seguintes da fila. Um
  // alerta com problema não pode custar o e-mail dos outros.
  const recemEstagio2 = linhas.filter((l) => Number(l.out_estagio) === 2);
  for (const l of recemEstagio2) {
    try {
      await processarEmailRt(sql, l.out_alerta_id);
    } catch (err) {
      log(
        `e-mail RT: erro não tratado no alerta_id=${l.out_alerta_id} — ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
      // Erro COMPLETO (stack + `cause`) em stderr. `log()` escreve em stdout e
      // só a mensagem — engolir o resto produziria diagnóstico falso justamente
      // no incidente em que ele custa mais caro (regra do repo).
      console.error(err);
    }
  }

  // #126 — reconciliação: cobre alertas que já viraram estágio 2 numa
  // varredura anterior e ficaram sem e-mail registrado (crash entre a
  // transição e o envio). Roda toda varredura, não só quando algo escalou
  // agora — é exatamente o caso que o gap cobre.
  // A partir da #154 essa mesma consulta é também a fila de retentativa: um
  // alerta com `_adiado` não tem `_enviado` nem `_falhou`, então continua
  // aparecendo aqui até o teto de 3 tentativas — sem tabela de fila nova.
  const pendentes = await sql`SELECT * FROM app_alertas_estagio2_sem_email()`;
  for (const p of pendentes) {
    try {
      await processarEmailRt(sql, p.alerta_id);
    } catch (err) {
      log(
        `e-mail RT: erro não tratado no alerta_id=${p.alerta_id} (reconciliação) — ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
      console.error(err);
    }
  }

  log(`varredura concluída: ${linhas.length} alerta(s) escalado(s).`);
  return linhas.length;
}

/**
 * Exportada para o teste (#536): é aqui que mora a regra "heartbeat só em
 * varredura real bem-sucedida" — nem em dry-run, nem em falha — nas duas
 * formas (arquivo do container e linha em `job_heartbeat`).
 */
export async function executar(sql, { modoDryRun = false } = {}) {
  if (modoDryRun) {
    await dryRun(sql);
    // Dry-run NÃO grava heartbeat: heartbeat significa "o motor escalonou o
    // que havia para escalonar". Gravá-lo aqui faria uma inspeção manual
    // mascarar um motor parado.
    return;
  }
  let escalados;
  try {
    escalados = await varrer(sql);
  } catch (err) {
    await gravarHeartbeatNoBanco(sql, JOB, {
      ok: false,
      detalhe: detalheDoErro(err),
    });
    throw err;
  }
  await gravarHeartbeat();
  await gravarHeartbeatNoBanco(sql, JOB, {
    ok: true,
    detalhe: detalheSemPii({ escalados }),
  });
}

async function main() {
  const args = process.argv.slice(2);
  const modoDryRun = args.includes("--dry-run");
  // `--once` é aceito para o comando ficar auto-explicativo no agendador e no
  // console; o default já é uma execução única, então não muda o comportamento.
  const desconhecidos = args.filter((a) => a !== "--once" && a !== "--dry-run");
  if (desconhecidos.length > 0) {
    throw new Error(
      `argumento não reconhecido: ${desconhecidos.join(" ")} — use --once e/ou --dry-run.`,
    );
  }

  const url = process.env.ESCALONAMENTO_DATABASE_URL;
  if (!url) {
    throw new Error(
      "ESCALONAMENTO_DATABASE_URL não definida — o motor de escalonamento precisa da role " +
        "de login que herda `iris_escalonamento`. Ver §Motor de escalonamento em infra/README.md.",
    );
  }

  // max:1 — a varredura é uma única chamada serial; uma conexão basta e evita
  // segurar pool ocioso num container que fica de pé o tempo todo.
  const sql = postgres(url, { max: 1 });
  try {
    await executar(sql, { modoDryRun });
  } finally {
    await sql.end();
  }
}

// #126 — guarda de execução: só roda `main()` quando o arquivo é invocado
// diretamente (`node scripts/escalonamento-risco.mjs`), não quando importado
// (ex.: `escalonamento-risco.test.mjs` importando `processarEmailRt`). Sem
// isto, importar o módulo em teste dispararia uma varredura real contra
// ESCALONAMENTO_DATABASE_URL.
//
// `pathToFileURL` e não `file://${process.argv[1]}`: o Node NÃO absolutiza
// argv[1], então a comparação crua falha quando o script é chamado por caminho
// relativo — como no dry-run documentado em infra/docker-compose.yml — e o
// processo sairia 0 sem varrer nada. Falha silenciosa disfarçada de sucesso é
// exatamente o que este motor não pode fazer. (Também quebrava no Windows, em
// que argv[1] vem com barra invertida e a URL não.)
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((err) => {
    // Erro COMPLETO em stderr, incluindo stack e `cause`. Não engolir stderr é
    // regra deste repo: mensagem que afirma UMA causa provável produz
    // diagnóstico falso justamente no incidente em que ele custa mais caro.
    console.error(
      "[escalonamento] FALHA na varredura — heartbeat NÃO foi atualizado:",
    );
    console.error(err);
    process.exit(1);
  });
}
