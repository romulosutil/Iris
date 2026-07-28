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
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const HEARTBEAT_DIR = process.env.ESCALONAMENTO_HEARTBEAT_DIR ?? "/heartbeat";
const HEARTBEAT_FILE = path.join(HEARTBEAT_DIR, ".ultima-varredura");

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
  await mkdir(HEARTBEAT_DIR, { recursive: true });
  await writeFile(HEARTBEAT_FILE, `${new Date().toISOString()}\n`, "utf8");
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

async function varrer(sql) {
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

  log(`varredura concluída: ${linhas.length} alerta(s) escalado(s).`);
  return linhas.length;
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
    if (modoDryRun) {
      await dryRun(sql);
      // Dry-run NÃO grava heartbeat: heartbeat significa "o motor escalonou o
      // que havia para escalonar". Gravá-lo aqui faria uma inspeção manual
      // mascarar um motor parado.
      return;
    }
    await varrer(sql);
    await gravarHeartbeat();
  } finally {
    await sql.end();
  }
}

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
