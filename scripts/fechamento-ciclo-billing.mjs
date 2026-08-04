/**
 * Job agendado de fechamento de ciclo de faturamento (#36).
 *
 * UMA varredura e SAI. Agendado pelo laço em `infra/billing/agendador.sh`.
 *
 * O QUE ELE **NÃO** FAZ — e por quê:
 * ele não apura consumo, não calcula preço e não fala com o gateway. Ele faz UM
 * POST autenticado numa rota interna do Next (`BILLING_JOB_URL`), e é essa rota,
 * em TypeScript dentro do app, que faz apuração + preço + chamada ao gateway.
 *
 * A razão é um incidente real deste repo (#156): a imagem Docker de job NÃO
 * herda o `node_modules` do app — o Dockerfile lista os COPY e instala as
 * dependências à mão. Um import novo que não chegou na imagem derrubou o motor
 * de escalonamento em produção com test/typecheck/lint TODOS verdes. Duplicar a
 * tabela de preços aqui num `.mjs` seria a mesma classe de bug, só que gerando
 * cobrança errada em vez de processo morto. Então: zero lógica de preço aqui, e
 * zero dependência npm — só o `fetch` nativo do Node 22.
 *
 * Env obrigatórias:
 *   BILLING_JOB_URL    ex.: https://irisclinica.ia.br/api/internal/billing/fechar-ciclos
 *   BILLING_JOB_TOKEN  segredo que autoriza o disparo. NUNCA é impresso.
 *
 * Execução:
 *   node scripts/fechamento-ciclo-billing.mjs --once
 *   node scripts/fechamento-ciclo-billing.mjs --once --dry-run
 */

import { fileURLToPath } from "node:url";

const PREFIXO = "[fechamento-ciclo-billing]";

/**
 * Monta a requisição do disparo. Separada de `executarFechamento` para ser
 * verificável sem rede: é aqui que mora o contrato com a rota interna.
 */
export function montarRequisicao(url, token, { dryRun } = {}) {
  return {
    url,
    init: {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ dryRun: Boolean(dryRun) }),
    },
  };
}

/**
 * Dispara o fechamento e devolve o que REALMENTE aconteceu.
 *
 * Nunca lança: o chamador (laço do agendador) precisa distinguir os três modos
 * de falha, e uma exceção solta viraria "erro" genérico. O resumo separa
 * `timeout` de `rede` de `status` de propósito — a mensagem de erro deste job
 * não pode afirmar UMA causa quando a evidência não distingue (ex.: dizer
 * "servidor fora do ar" quando o que houve foi um 500 do próprio app).
 *
 * O corpo real da resposta é propagado como veio. Sem isso, um 500 com stack do
 * lado do Next chegaria ao operador como "falhou" e nada mais.
 */
export async function executarFechamento(
  fetchImpl,
  { url, token, dryRun = false, timeoutMs = 30000 } = {},
) {
  const { url: alvo, init } = montarRequisicao(url, token, { dryRun });

  let resposta;
  try {
    resposta = await fetchImpl(alvo, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const timeout = err?.name === "TimeoutError" || err?.name === "AbortError";
    return {
      ok: false,
      status: null,
      corpo: null,
      falha: timeout ? "timeout" : "rede",
      // `err.message` do fetch nunca contém a URL com credencial (o token vai em
      // header, não em query) — mas ainda assim só o texto do erro é propagado.
      erro: timeout
        ? `sem resposta em ${timeoutMs}ms (timeout do cliente; NÃO significa que o fechamento não rodou do outro lado)`
        : String(err?.message ?? err),
    };
  }

  // Lido SEMPRE, inclusive no caminho de sucesso: é o corpo que traz quantos
  // ciclos fecharam. E em falha, ler o corpo é a única evidência do porquê.
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

async function main() {
  const url = process.env.BILLING_JOB_URL;
  const token = process.env.BILLING_JOB_TOKEN;

  // Falta de env é erro de operação, não de código: dizer o NOME da variável
  // ausente é a diferença entre um fix de 30 segundos e uma caçada no painel.
  const faltando = [];
  if (!url) faltando.push("BILLING_JOB_URL");
  if (!token) faltando.push("BILLING_JOB_TOKEN");
  if (faltando.length > 0) {
    console.error(`${PREFIXO} ERRO: variável(is) de ambiente ausente(s): ${faltando.join(", ")}.`);
    process.exit(1);
  }

  const dryRun = process.argv.includes("--dry-run");

  const resultado = await executarFechamento(globalThis.fetch, { url, token, dryRun });

  // UMA linha JSON: o log do Easypanel é o único observador deste processo, e
  // linha única sobrevive a interleaving de stdout. O token não entra aqui —
  // nem truncado: prefixo de segredo em log já basta para reduzir busca.
  console.log(
    JSON.stringify({
      job: "fechamento-ciclo-billing",
      quando: new Date().toISOString(),
      dryRun,
      ok: resultado.ok,
      status: resultado.status,
      falha: resultado.falha ?? null,
      erro: resultado.erro ?? null,
      corpo: resultado.corpo ?? null,
    }),
  );

  if (!resultado.ok) {
    console.error(`${PREFIXO} disparo FALHOU (${resultado.falha}): ${resultado.erro}`);
    process.exit(1);
  }

  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
