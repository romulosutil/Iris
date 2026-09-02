/**
 * Job do AVISO PRÉVIO de expurgo de prontuário expirado (#352).
 *
 * UMA varredura e SAI. O laço é responsabilidade do agendador
 * (`infra/retencao/agendador.sh`) — mesmo desenho do auto-arquivamento, do
 * escalonamento e do backup: o script faz a unidade de trabalho, o agendador
 * decide quando. Assim a mesma unidade roda à mão no console durante um
 * incidente, sem herdar o laço.
 *
 * O QUE ELE FAZ: chama `app_retencao_avisar(now(), 90, 200)` (migração 0128) em
 * até 10 lotes, e essa função — numa única instrução — grava em `audit_log` o
 * aviso prévio de 90 dias para todo paciente cuja guarda legal está a vencer.
 * Este processo não decide NADA: a régua vive no banco. O motivo é o mesmo do
 * escalonamento — a varredura cruza clínicas, então o predicado não pode
 * depender de um contexto de tenant montado em JS, onde erraria em silêncio
 * para o lado errado.
 *
 * O QUE ELE NÃO FAZ — E NÃO PODE PASSAR A FAZER: nenhuma saída de rede além do
 * Postgres. O aviso prévio é IN-APP (uma linha em `audit_log` que a tela de
 * retenção lê), não e-mail nem SMS. O Iris nunca fala com o mundo externo sobre
 * paciente — e aqui o assunto é a eliminação definitiva de um prontuário, o
 * dado mais sensível que o produto guarda. Se um dia parecer natural adicionar
 * um `fetch()` aqui, a resposta é não — e por isso esta imagem sequer instala
 * um cliente HTTP (`infra/retencao/Dockerfile`).
 *
 * O QUE ELE TAMBÉM NÃO FAZ: purgar. A role `iris_retencao` NÃO tem EXECUTE em
 * `app_purgar_paciente` — a política proíbe eliminação automática silenciosa, e
 * a função exigiria `app.user_role`/`app.user_id`, que o job só satisfaria
 * FORJANDO GUC e gravando um ator falso numa operação irreversível. Quem purga
 * é o coordenador, na tela, com confirmação por nome.
 *
 * `.mjs` de node puro, sem TS e sem build (mesmo motivo do
 * `scripts/auto-arquivamento.mjs`): `postgres` é dependência de produção, então
 * isto roda num contexto de deploy enxuto, sem devDependencies e sem tsx.
 *
 *   node scripts/retencao-aviso-previo.mjs             # uma varredura (default)
 *   node scripts/retencao-aviso-previo.mjs --once      # idem, explícito
 *   node scripts/retencao-aviso-previo.mjs --dry-run   # roda de verdade e faz ROLLBACK
 *
 * Env:
 *   RETENCAO_DATABASE_URL   role de login que herda `iris_retencao`.
 *                           Obrigatória. Essa role tem EXECUTE só em
 *                           `app_retencao_avisar` e SELECT em NENHUMA tabela —
 *                           credencial vazada não lê paciente nem trilha.
 *   RETENCAO_HEARTBEAT_DIR  default /heartbeat.
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

// Nome deste job em `job_heartbeat` (0146) — casa com `LIMITES_HEARTBEAT` em
// scripts/alarme-jobs.mjs. Mudar um sem o outro cega o detector.
const JOB = "retencao";

/**
 * ESPELHO da régua canônica `REGUA_RETENCAO` em `src/lib/jobs/retencao.ts`.
 * Este arquivo é `.mjs` de node puro e NÃO importa `.ts` — não há build aqui.
 *
 * Quem impede a divergência não é a boa intenção de quem editar: é o teste de
 * paridade em `scripts/retencao-aviso-previo.test.mjs`, que importa as DUAS
 * constantes e falha se o número mudar de um lado só. Mexeu em 90 aqui, mexa lá
 * — e vice-versa. Uma divergência aqui faria a tela prometer uma data de aviso
 * e o job emitir outra, sem erro em lugar nenhum.
 *
 * 90 é teto de POLÍTICA, não parâmetro de deploy: por isso está numa constante
 * do arquivo e NÃO numa variável de ambiente. A função SQL aceita
 * `p_aviso_dias` só para o teste de integração comprimir a janela.
 */
export const REGUA = { diasAvisoPrevio: 90 };

/**
 * Lote e teto.
 *
 * 200 por lote, no máximo 10 lotes (2.000 avisos) por execução. O resto vai
 * para o tick seguinte SEM PERDA: a elegibilidade é derivada de estado no banco
 * (o próprio `audit_log` é o dedup), não de cursor. Cursor persistido
 * reintroduziria o modo de falha em que uma linha inelegível que não muda de
 * estado trava a fila para sempre.
 */
export const LOTE = 200;
export const TETO_LOTES = 10;

const HEARTBEAT_ARQUIVO = ".ultima-retencao";

function heartbeatDir() {
  return process.env.RETENCAO_HEARTBEAT_DIR ?? "/heartbeat";
}

function log(msg) {
  console.log(`[retencao] ${new Date().toISOString()} ${msg}`);
}

/**
 * HEARTBEAT — o sinal de vida do job.
 *
 * Escrito SÓ depois de uma varredura completa e sem erro. Um job de aviso
 * parado é indistinguível, de dentro do produto, de "nenhum prontuário está a
 * vencer": a fila de expurgo simplesmente não recebe aviso e a clínica descobre
 * o vencimento quando ele já passou — descumprindo o prazo do Art. 16 sem
 * nenhum erro aparecer em lugar nenhum. Por isso a saúde do job precisa de um
 * sinal externo positivo, e não da ausência de erro.
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
 * Um lote. `exec` é `sql` ou uma transação — é o mesmo caminho nos dois modos,
 * de propósito: um dry-run que reescreve a chamada só testa a cópia.
 *
 * `now()` resolvido no Postgres, não um `Date` de JS: a janela do aviso é
 * comparada com `(p_referencia AT TIME ZONE c.timezone)::date` lá dentro, e o
 * relógio que vale é o do banco, não o do container.
 */
async function executarLote(exec) {
  const linhas = await exec`
    SELECT app_retencao_avisar(now(), ${REGUA.diasAvisoPrevio}, ${LOTE}) AS avisados
  `;
  return Number(linhas[0]?.avisados ?? 0);
}

/**
 * A varredura: até `TETO_LOTES` lotes, parando no primeiro lote vazio.
 *
 * `porLote` decide a granularidade transacional:
 *   - `true` (varredura real): CADA lote é uma transação própria. Uma falha no
 *     lote 7 aborta só o lote 7 — os 6 anteriores continuam gravados. Uma
 *     transação única para a varredura inteira desfaria milhares de avisos
 *     válidos por causa de uma linha.
 *   - `false` (dry-run): quem abre a transação é o chamador, e ela envolve o
 *     laço inteiro. É o que faz o dedup funcionar dentro do dry-run — os
 *     `INSERT`s de um lote são visíveis para o `NOT EXISTS` do lote seguinte,
 *     então o laço converge em vez de reavisar os mesmos 200 dez vezes.
 */
export async function varrer(sql, { porLote = true } = {}) {
  let avisados = 0;
  let lotes = 0;

  for (let i = 1; i <= TETO_LOTES; i += 1) {
    let noLote;
    try {
      noLote = porLote
        ? await sql.begin((tx) => executarLote(tx))
        : await executarLote(sql);
    } catch (err) {
      // O ÍNDICE do lote entra na mensagem, e a do Postgres vem junto por
      // `cause` (o handler de topo imprime o erro inteiro). Sem o índice não dá
      // para saber, olhando o log, quantos avisos ficaram gravados antes da
      // falha — e essa é a primeira pergunta de quem investiga.
      throw new Error(
        `falha no lote ${i} de no máximo ${TETO_LOTES} — ${avisados} aviso(s) ` +
          `de ${lotes} lote(s) anterior(es) permanecem gravados: ${err.message}`,
        { cause: err },
      );
    }

    lotes += 1;
    avisados += noLote;

    // Lote vazio = acabou o conjunto elegível. Continuar até o teto só produz
    // 9 chamadas que não mudam linha nenhuma.
    if (noLote === 0) break;
  }

  // Só contagens no log — nunca id de paciente, nome ou clínica. Log de
  // infraestrutura vai para o painel do host e para qualquer coletor futuro,
  // fora do controle de acesso clínico do produto (mesma decisão do motor de
  // escalonamento e do auto-arquivamento). A leitura nominal acontece na trilha
  // em `audit_log`, sob RLS, que é onde ela pode ser autorizada.
  log(
    `varredura concluída: ${avisados} aviso(s) prévio(s) emitido(s) em ` +
      `${lotes} lote(s) (lote=${LOTE}, teto=${TETO_LOTES}, janela=${REGUA.diasAvisoPrevio}d).`,
  );
  if (avisados >= LOTE * TETO_LOTES) {
    log(
      `ATENÇÃO: teto de ${LOTE * TETO_LOTES} avisos atingido — pode haver ` +
        `elegível remanescente. Nada se perde: ele entra no tick seguinte.`,
    );
  }

  return { avisados, lotes };
}

// Sentinela do rollback: `sql.begin()` só desfaz a transação se o callback
// LANÇAR. Uma classe própria (e não uma string) para distinguir, no catch, o
// rollback intencional de um erro real vindo do banco — engolir o segundo
// transformaria falha em "dry-run ok".
class RollbackDryRun extends Error {}

/**
 * Dry-run: roda a varredura de VERDADE dentro de uma transação e faz ROLLBACK.
 *
 * Deliberadamente NÃO reimplementa o predicado em JS. Um dry-run que reescreve
 * a regra só testa a cópia — e a cópia é justamente o que diverge sem avisar.
 * Aqui o número exibido vem da mesma função que rodaria em produção.
 */
export async function dryRun(sql) {
  const sentinela = new RollbackDryRun();
  let contagens = { avisados: 0, lotes: 0 };
  try {
    await sql.begin(async (tx) => {
      contagens = await varrer(tx, { porLote: false });
      throw sentinela;
    });
  } catch (err) {
    if (err !== sentinela) throw err;
  }
  log(
    `dry-run: ROLLBACK aplicado — ${contagens.avisados} aviso(s) prévio(s) ` +
      `foram DESFEITOS. Nada foi gravado em audit_log.`,
  );
  return contagens;
}

/**
 * Exportada para o teste: é aqui que mora a regra "heartbeat só em varredura
 * completa e bem-sucedida" — nem em dry-run, nem em falha. Testar isso via
 * `main()` exigiria um Postgres real.
 */
export async function executar(sql, { modoDryRun = false } = {}) {
  if (modoDryRun) {
    await dryRun(sql);
    // Dry-run NÃO grava heartbeat: heartbeat significa "o job avisou quem havia
    // para avisar". Gravá-lo aqui faria uma inspeção manual mascarar um job
    // parado.
    return;
  }
  let contagens;
  try {
    contagens = await varrer(sql);
  } catch (err) {
    // #536 — heartbeat de FALHA no banco antes de propagar: o detector
    // (alarme-jobs) distingue "parou" de "roda e falha", e o segundo tem
    // diagnóstico no próprio e-mail. Só `name`+`code` — nunca a message.
    await gravarHeartbeatNoBanco(sql, JOB, {
      ok: false,
      detalhe: detalheDoErro(err),
    });
    throw err;
  }
  await gravarHeartbeat();
  // #536 — o mesmo sinal, agora onde o detector consegue ler (o arquivo acima
  // só o próprio container enxerga). Só contagens no detalhe.
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

  // Validada ANTES do laço e NOMEANDO a variável ausente: sem env o job falha
  // em 100% dos ticks, e "falhou" sem o nome vira caçada no painel.
  const url = process.env.RETENCAO_DATABASE_URL;
  if (!url) {
    throw new Error(
      "RETENCAO_DATABASE_URL não definida — o job de aviso prévio de expurgo precisa da role " +
        "de login que herda `iris_retencao`. Ver §Aviso prévio de expurgo em .env.example.",
    );
  }

  // max:1 — a varredura é serial (um lote por vez, de propósito: lotes
  // concorrentes disputariam as mesmas linhas). Uma conexão basta e evita
  // segurar pool ocioso num container que fica de pé o tempo todo.
  const sql = postgres(url, { max: 1 });
  try {
    await executar(sql, { modoDryRun });
  } finally {
    await sql.end();
  }
}

// Guarda de execução: só roda `main()` quando o arquivo é invocado diretamente
// (`node scripts/retencao-aviso-previo.mjs`), não quando importado pelo teste.
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
    console.error(
      "[retencao] FALHA na varredura de aviso prévio — heartbeat NÃO foi atualizado:",
    );
    console.error(err);
    process.exit(1);
  });
}
