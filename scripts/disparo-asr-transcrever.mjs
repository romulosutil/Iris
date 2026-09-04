/**
 * Job agendado do worker de transcrição de ditado de voz (#72, T08).
 *
 * UMA chamada e SAI. Agendado pelo laço em `infra/asr/agendador.sh`.
 *
 * O QUE ELE **NÃO** FAZ — e por quê: não reserva clipe, não baixa áudio do
 * bucket efêmero e não fala com o serviço `iris-asr` (faster-whisper). Ele faz
 * UM POST autenticado numa rota interna do Next (`ASR_JOB_URL`), e é essa
 * rota (`src/app/api/internal/jobs/asr-transcrever/route.ts`, T07), em
 * TypeScript dentro do app, que faz reserva + storage + provider + conclusão.
 *
 * Mesmo idioma de `scripts/fechamento-ciclo-billing.mjs` (#36) e pelo mesmo
 * motivo do #156: a imagem Docker deste job NÃO herda o `node_modules` do
 * app. Reimplementar aqui a chamada ao provider ASR ou a leitura do bucket
 * seria a mesma classe de bug do #156 — só que com áudio clínico no lugar de
 * cobrança. Então: zero lógica de transcrição aqui, zero dependência npm além
 * do que já está na imagem para o sweeper (T15) — só o `fetch` nativo do
 * Node 22 para este script.
 *
 * Env obrigatórias:
 *   ASR_JOB_URL    ex.: https://irisclinica.ia.br/api/internal/jobs/asr-transcrever
 *   ASR_JOB_TOKEN  segredo que autoriza o disparo. NUNCA é impresso.
 *
 * Execução:
 *   node scripts/disparo-asr-transcrever.mjs --once
 */

import { fileURLToPath } from "node:url";
import { log } from "./lib/log-estruturado.mjs";

/**
 * Monta a requisição do disparo. Separada de `executarDisparo` para ser
 * verificável sem rede: é aqui que mora o contrato com a rota interna.
 *
 * A rota (T07) não lê corpo — só o header `authorization` — então não há
 * `body` a montar aqui, ao contrário de `montarRequisicao` do billing (que
 * carrega `dryRun`).
 */
export function montarRequisicao(url, token) {
  return {
    url,
    init: {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  };
}

/**
 * Dispara o tick do worker e devolve o que REALMENTE aconteceu.
 *
 * Nunca lança: o chamador (laço do agendador) precisa distinguir os três
 * modos de falha (timeout / rede / status HTTP), e uma exceção solta viraria
 * "erro" genérico — mesma disciplina de `executarFechamento` do billing
 * (memória `mensagem-de-erro-que-afirma-causa`: nunca afirmar UMA causa
 * quando a evidência não distingue).
 *
 * `timeoutMs` folgado (120s, não os 30s do billing): o worker processa até 5
 * clipes por tick (`LOTE_PADRAO` em route.ts), SEQUENCIALMENTE, e cada clipe
 * no modelo `small` mede ~43s de mediana num clipe de ~2min (runbook.md §2,
 * medido em produção 30/08/2026) — um lote cheio pode legitimamente levar
 * bem mais que 30s para responder. Um timeout de cliente curto demais faria
 * este script reportar "falha" para um tick que só estava, de fato, lento.
 */
export async function executarDisparo(
  fetchImpl,
  { url, token, timeoutMs = 120000 } = {},
) {
  const { url: alvo, init } = montarRequisicao(url, token);

  let resposta;
  try {
    resposta = await fetchImpl(alvo, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timeout = err?.name === "TimeoutError" || err?.name === "AbortError";
    return {
      ok: false,
      status: null,
      corpo: null,
      falha: timeout ? "timeout" : "rede",
      erro: timeout
        ? `sem resposta em ${timeoutMs}ms (timeout do cliente; NÃO significa que o tick não rodou do outro lado)`
        : String(err?.message ?? err),
    };
  }

  // Lido SEMPRE, inclusive no caminho de sucesso: é o corpo que traz quantos
  // clipes foram processados/transcritos/falhados nesta passada.
  let corpo;
  try {
    corpo = await resposta.text();
  } catch (err) {
    corpo = `<falha ao ler o corpo da resposta: ${String(err?.message ?? err)}>`;
  }

  if (!resposta.ok) {
    return {
      ok: false,
      status: resposta.status,
      corpo,
      falha: "status",
      // O corpo NÃO entra na mensagem (#494, T16): esta string vai para o log
      // do Easypanel, e um corpo de erro vindo da rota de transcrição pode
      // carregar texto clínico. O status já distingue a reação do operador.
      erro: `HTTP ${resposta.status} — ver o log da app para o diagnóstico`,
    };
  }

  return { ok: true, status: resposta.status, corpo };
}

/**
 * Levanta do corpo os campos que mudam a REAÇÃO do operador, para que fiquem
 * no primeiro nível da linha de log em vez de enterrados na string `corpo`.
 * Espelha o formato de resposta de route.ts: `{ ok, processados, transcritos,
 * falhas, revertidos, resultados }`.
 *
 * Nunca lança: corpo não-JSON (um HTML de proxy, por exemplo) volta com tudo
 * `null` / lista vazia — e nada do corpo cru é promovido para a linha de log.
 */
export function resumoDoCorpo(corpo) {
  const vazio = {
    processados: null,
    transcritos: null,
    falhas: null,
    revertidos: null,
    categorias: [],
  };
  if (typeof corpo !== "string") return vazio;
  let dados;
  try {
    dados = JSON.parse(corpo);
  } catch {
    return vazio;
  }
  if (dados === null || typeof dados !== "object") return vazio;
  return {
    processados:
      typeof dados.processados === "number" ? dados.processados : null,
    transcritos:
      typeof dados.transcritos === "number" ? dados.transcritos : null,
    falhas: typeof dados.falhas === "number" ? dados.falhas : null,
    revertidos: typeof dados.revertidos === "number" ? dados.revertidos : null,
    categorias: categoriasDe(dados),
  };
}

// Conjunto fechado aceito de `CategoriaErro` (route.ts). O filtro é o ponto:
// mesmo que a rota volte um dia a mandar string livre neste campo, nada fora
// desta lista chega ao log — o script não confia no formato do corpo.
const CATEGORIAS_CONHECIDAS = [
  "saturacao",
  "definitiva",
  "transitoria",
  "erro_interno",
];

/**
 * Categorias distintas presentes em `resultados[]`, em ordem estável.
 *
 * Só o RÓTULO, nunca o id do clipe: o par (categoria, id) já basta para
 * correlacionar com o log da app, e o id não muda a reação do operador —
 * "houve `erro_interno` neste tick" muda.
 */
function categoriasDe(dados) {
  if (!Array.isArray(dados.resultados)) return [];
  const vistas = [];
  for (const item of dados.resultados) {
    const categoria = item?.categoria;
    if (!CATEGORIAS_CONHECIDAS.includes(categoria)) continue;
    if (!vistas.includes(categoria)) vistas.push(categoria);
  }
  return vistas;
}

async function main() {
  const url = process.env.ASR_JOB_URL;
  const token = process.env.ASR_JOB_TOKEN;

  // Falta de env é erro de operação, não de código: dizer o NOME da variável
  // ausente é a diferença entre um fix de 30 segundos e uma caçada no painel.
  const faltando = [];
  if (!url) faltando.push("ASR_JOB_URL");
  if (!token) faltando.push("ASR_JOB_TOKEN");
  if (faltando.length > 0) {
    log.error("disparo-asr.env-ausente", { faltando });
    process.exit(1);
  }

  const resultado = await executarDisparo(globalThis.fetch, { url, token });
  const resumo = resumoDoCorpo(resultado.corpo);

  // Este job já emitia UMA linha JSON à mão — a #494/T16 chegou nisso pelo
  // mesmo caminho que a #560 generaliza. O que muda: `job`/`quando` saem
  // (viraram `evento` e `hora`, com os mesmos nomes do resto do sistema), e o
  // objeto passa a atravessar a redaction por chave em vez de confiar em quem
  // monta o literal. O token continua fora — nem truncado: prefixo de segredo
  // em log já basta para reduzir busca.
  log.info("disparo-asr.tick-disparado", {
    ok: resultado.ok,
    status: resultado.status,
    falha: resultado.falha ?? null,
    erroCategoria: resultado.erro ?? null,
    processados: resumo.processados,
    transcritos: resumo.transcritos,
    falhas: resumo.falhas,
    revertidos: resumo.revertidos,
    // `corpo` cru NÃO entra na linha (#494, T16): quem responde é uma rota
    // que manipula texto clínico ditado, e um corpo inesperado (erro de proxy,
    // stack de framework) poderia trazer a nota junto. Só os campos NOMEADOS
    // acima, mais as categorias fechadas por clipe — nunca spread do corpo,
    // nunca string livre.
    categorias: resumo.categorias,
  });

  if (!resultado.ok) {
    log.error("disparo-asr.disparo-falhou", {
      falha: resultado.falha,
      // `erro` aqui é categoria fechada montada por `executarDisparo`, não
      // texto de terceiro — mas o nome muda para deixar isso explícito.
      erroCategoria: resultado.erro ?? null,
      status: resultado.status,
    });
    process.exit(1);
  }

  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
