/**
 * Job de auto-arquivamento COMERCIAL por inatividade (#174, débito D4).
 *
 * UMA varredura e SAI. O laço é responsabilidade do agendador
 * (`infra/arquivamento/agendador.sh`) — mesmo desenho do motor de
 * escalonamento e do backup: o script faz a unidade de trabalho, o agendador
 * decide quando. Assim a mesma unidade roda à mão no console durante um
 * incidente, sem herdar o laço.
 *
 * O QUE ELE FAZ: chama `app_auto_arquivar_pacientes()` (migração 0080), que
 * numa única chamada emite o aviso prévio aos 83 dias sem atividade e arquiva
 * aos 90, já gravando a trilha imutável em `audit_log`. Este processo não
 * decide NADA: a regra vive no banco. O motivo é o mesmo do escalonamento — a
 * varredura cruza clínicas, então o predicado não pode depender de um contexto
 * de tenant montado em JS, onde erraria em silêncio para o lado errado.
 *
 * O QUE ELE NÃO FAZ — E NÃO PODE PASSAR A FAZER: nenhuma saída de rede além do
 * Postgres. O aviso prévio é IN-APP (uma linha em `audit_log` que a faixa da
 * clínica lê), não e-mail nem SMS. Arquivamento é ato administrativo sobre
 * cobrança, não evento clínico, e o Iris não fala com o mundo externo sobre
 * paciente. Se um dia parecer natural adicionar um `fetch()` aqui, a resposta
 * é não — e por isso esta imagem sequer instala um cliente HTTP.
 *
 * `.mjs` de node puro, sem TS e sem build (mesmo motivo do
 * `scripts/escalonamento-risco.mjs`): `postgres` é dependência de produção,
 * então isto roda num contexto de deploy enxuto, sem devDependencies e sem tsx.
 *
 *   node scripts/auto-arquivamento.mjs             # uma varredura (default)
 *   node scripts/auto-arquivamento.mjs --once      # idem, explícito
 *   node scripts/auto-arquivamento.mjs --dry-run   # roda de verdade e faz ROLLBACK
 *
 * Env:
 *   ARQUIVAMENTO_DATABASE_URL   role de login que herda `iris_arquivamento`.
 *                               Obrigatória. Essa role tem EXECUTE só na função
 *                               de varredura e SELECT em NENHUMA tabela —
 *                               credencial vazada não lê paciente nem diário.
 *   ARQUIVAMENTO_HEARTBEAT_DIR  default /heartbeat.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { log, logarErro } from "./lib/log-estruturado.mjs";
import postgres from "postgres";
import {
  detalheDoErro,
  detalheSemPii,
  gravarHeartbeat as gravarHeartbeatNoBanco,
} from "./lib/heartbeat.mjs";

// Nome deste job em `job_heartbeat` (0146) — casa com `LIMITES_HEARTBEAT` em
// scripts/alarme-jobs.mjs. Mudar um sem o outro cega o detector.
const JOB = "arquivamento";

/**
 * ESPELHO da régua canônica `REGUA_ARQUIVAMENTO` em
 * `src/lib/jobs/auto-arquivamento.ts`. Este arquivo é `.mjs` de node puro e
 * NÃO importa `.ts` — não há build aqui.
 *
 * Quem impede a divergência não é a boa intenção de quem editar: é o teste de
 * paridade em `scripts/auto-arquivamento.test.mjs`, que importa as DUAS
 * constantes e falha se um número mudar de um lado só. Mexeu em 83 ou 90 aqui,
 * mexa lá — e vice-versa. Os mesmos valores também são os defaults de
 * `app_auto_arquivar_pacientes()` (migração 0080).
 */
export const REGUA = { diasAvisoPrevio: 83, diasArquivamento: 90 };

const HEARTBEAT_ARQUIVO = ".ultima-varredura";

function heartbeatDir() {
  return process.env.ARQUIVAMENTO_HEARTBEAT_DIR ?? "/heartbeat";
}

// A hora deixou de ser interpolada: todo registro do emissor já sai com o
// campo `hora` em ISO, e duas horas na mesma linha divergiriam na primeira vez
// que alguém movesse a chamada.

/**
 * HEARTBEAT — o sinal de vida do job.
 *
 * Escrito SÓ depois de uma varredura bem-sucedida. Um job de arquivamento
 * parado é indistinguível, de dentro do produto, de "nenhum paciente passou
 * dos 90 dias": a fatura simplesmente continua cobrando pacientes inativos e
 * ninguém percebe. Por isso a saúde do job precisa de um sinal externo
 * positivo, e não da ausência de erro.
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
 * A varredura em si. Recebe `sql` (ou uma transação) para o dry-run poder
 * reusar exatamente este caminho.
 */
export async function varrer(sql) {
  const linhas = await sql`SELECT * FROM app_auto_arquivar_pacientes()`;
  const { avisados = 0, arquivados = 0 } = linhas[0] ?? {};

  // Só contagens no log — nunca id de paciente, nome ou clínica. Log de
  // infraestrutura vai para o painel do host e para qualquer coletor futuro,
  // fora do controle de acesso clínico do produto (mesma decisão do motor de
  // escalonamento). A leitura nominal acontece na trilha em `audit_log`, sob
  // RLS, que é onde ela pode ser autorizada.
  log.info("arquivamento.varredura-concluida", {
    avisados: Number(avisados),
    arquivados: Number(arquivados),
  });
  return { avisados: Number(avisados), arquivados: Number(arquivados) };
}

// Sentinela do rollback: `sql.begin()` só desfaz a transação se o callback
// LANÇAR. Uma classe própria (e não uma string) para distinguir, no catch, o
// rollback intencional de um erro real vindo do banco — engolir o segundo
// transformaria falha em "dry-run ok".
class RollbackDryRun extends Error {}

/**
 * Dry-run: roda a função de VERDADE dentro de uma transação e faz ROLLBACK.
 *
 * Deliberadamente NÃO reimplementa o predicado em JS. Um dry-run que reescreve
 * a regra só testa a cópia — e a cópia é justamente o que diverge sem avisar.
 * Aqui o número exibido vem da mesma função que rodaria em produção.
 */
export async function dryRun(sql) {
  const sentinela = new RollbackDryRun();
  let contagens = { avisados: 0, arquivados: 0 };
  try {
    await sql.begin(async (tx) => {
      contagens = await varrer(tx);
      throw sentinela;
    });
  } catch (err) {
    if (err !== sentinela) throw err;
  }
  // `dryRun: true` é campo, não adjetivo na frase: é por ele que se separa uma
  // passada de ensaio de uma passada real ao ler o histórico do container.
  log.info("arquivamento.dry-run-desfeito", {
    dryRun: true,
    avisados: contagens.avisados,
    arquivados: contagens.arquivados,
  });
  return contagens;
}

/**
 * Exportada para o teste: é aqui que mora a regra "heartbeat só em varredura
 * real bem-sucedida" — nem em dry-run, nem em falha. Testar isso via `main()`
 * exigiria um Postgres real.
 */
export async function executar(sql, { modoDryRun = false } = {}) {
  if (modoDryRun) {
    await dryRun(sql);
    // Dry-run NÃO grava heartbeat: heartbeat significa "o job arquivou o que
    // havia para arquivar". Gravá-lo aqui faria uma inspeção manual mascarar
    // um job parado.
    return;
  }
  let contagens;
  try {
    contagens = await varrer(sql);
  } catch (err) {
    // #536 — heartbeat de FALHA no banco antes de propagar: o detector
    // (alarme-jobs) distingue "parou" de "roda e falha". Só `name`+`code`.
    await gravarHeartbeatNoBanco(sql, JOB, {
      ok: false,
      detalhe: detalheDoErro(err),
    });
    throw err;
  }
  await gravarHeartbeat();
  // #536 — o mesmo sinal, agora onde o detector consegue ler. Só contagens.
  await gravarHeartbeatNoBanco(sql, JOB, {
    ok: true,
    detalhe: detalheSemPii(contagens),
  });
}

export async function main(args = process.argv.slice(2)) {
  const modoDryRun = args.includes("--dry-run");
  // `--once` é aceito para o comando ficar auto-explicativo no agendador e no
  // console; o default já é uma execução única, então não muda o comportamento.
  const desconhecidos = args.filter((a) => a !== "--once" && a !== "--dry-run");
  if (desconhecidos.length > 0) {
    throw new Error(
      `argumento não reconhecido: ${desconhecidos.join(" ")} — use --once e/ou --dry-run.`,
    );
  }

  const url = process.env.ARQUIVAMENTO_DATABASE_URL;
  if (!url) {
    throw new Error(
      "ARQUIVAMENTO_DATABASE_URL não definida — o job de auto-arquivamento precisa da role " +
        "de login que herda `iris_arquivamento`. Ver §Auto-arquivamento por inatividade em infra/README.md.",
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

// Guarda de execução: só roda `main()` quando o arquivo é invocado diretamente
// (`node scripts/auto-arquivamento.mjs`), não quando importado pelo teste.
//
// `pathToFileURL` e não `file://${process.argv[1]}`: o Node NÃO absolutiza
// argv[1], então a comparação crua falha quando o script é chamado por caminho
// relativo — e o processo sairia 0 sem varrer nada. Falha silenciosa disfarçada
// de sucesso é exatamente o que este job não pode fazer. (Também quebrava no
// Windows, em que argv[1] vem com barra invertida e a URL não.)
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((err) => {
    // Erro COMPLETO em stderr, incluindo stack e `cause`. Não engolir stderr é
    // regra deste repo: mensagem que afirma UMA causa provável produz
    // diagnóstico falso justamente no incidente em que ele custa mais caro.
    // ANTES: o erro INTEIRO, com `stack` e `cause`. A nota de então — "não
    // engolir stderr, mensagem que afirma UMA causa provável produz
    // diagnóstico falso" — continua valendo, e é por isso que aqui NÃO entrou
    // uma frase adivinhando a causa. O que sai é o conjunto fechado: classe,
    // SQLSTATE, constraint, hash da mensagem. A `message` do driver é a query
    // com os params, e num job de arquivamento esses params são do prontuário.
    logarErro("arquivamento.varredura-falhou", err, {
      heartbeatAtualizado: false,
    });
    process.exit(1);
  });
}
