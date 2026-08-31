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

const PREFIXO = "[disparo-asr-transcrever]";

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
      erro: `HTTP ${resposta.status} — corpo recebido: ${corpo}`,
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
 * `null`, e a string crua continua no campo `corpo`.
 */
export function resumoDoCorpo(corpo) {
  const vazio = {
    processados: null,
    transcritos: null,
    falhas: null,
    revertidos: null,
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
  };
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
    console.error(
      `${PREFIXO} ERRO: variável(is) de ambiente ausente(s): ${faltando.join(", ")}.`,
    );
    process.exit(1);
  }

  const resultado = await executarDisparo(globalThis.fetch, { url, token });
  const resumo = resumoDoCorpo(resultado.corpo);

  // UMA linha JSON: o log do Easypanel é o único observador deste processo, e
  // linha única sobrevive a interleaving de stdout. O token não entra aqui —
  // nem truncado: prefixo de segredo em log já basta para reduzir busca.
  console.log(
    JSON.stringify({
      job: "disparo-asr-transcrever",
      quando: new Date().toISOString(),
      ok: resultado.ok,
      status: resultado.status,
      falha: resultado.falha ?? null,
      erro: resultado.erro ?? null,
      processados: resumo.processados,
      transcritos: resumo.transcritos,
      falhas: resumo.falhas,
      revertidos: resumo.revertidos,
      corpo: resultado.corpo ?? null,
    }),
  );

  if (!resultado.ok) {
    console.error(
      `${PREFIXO} disparo FALHOU (${resultado.falha}): ${resultado.erro}`,
    );
    process.exit(1);
  }

  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
