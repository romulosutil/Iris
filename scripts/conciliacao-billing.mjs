/**
 * Conciliação manual de billing (#375).
 *
 * UMA passada e sai. NÃO é agendado — é executado sob demanda pelo operador,
 * seguindo `infra/billing/runbook.md`.
 *
 * O que ele NÃO faz: não fala com o Postgres, não fala com o Asaas, não corrige
 * nada. Faz UM POST autenticado numa rota interna do Next, e é a rota, em
 * TypeScript dentro do app, que compara os dois lados. A razão é a #156: a
 * imagem Docker de job não herda o `node_modules` do app, e um import novo que
 * não chegou lá derrubou o motor de escalonamento em produção com CI verde.
 * Zero dependência npm aqui — só o `fetch` nativo do Node 22.
 *
 * Env obrigatórias:
 *   BILLING_CONCILIACAO_URL  ex.: https://irisclinica.ia.br/api/internal/billing/conciliar
 *   BILLING_JOB_TOKEN        mesmo segredo do fechamento. NUNCA é impresso.
 *
 * Execução:
 *   node scripts/conciliacao-billing.mjs
 *
 * Exit code: 0 = passada completa, sem truncamento, sem falha de consulta ao
 * gateway, e sem divergência. 1 = qualquer outra coisa (falha no disparo,
 * etapa abortada, divergência encontrada, truncamento em qualquer um dos três
 * braços, ou falha de consulta) — todas exigem um humano.
 */

import { fileURLToPath } from "node:url";

const PREFIXO = "[conciliacao-billing]";

export function montarRequisicao(url, token) {
  return {
    url,
    init: {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    },
  };
}

export async function executarConciliacao(
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
        ? `sem resposta em ${timeoutMs}ms (timeout do cliente; a conciliação pode ter rodado do outro lado)`
        : String(err?.message ?? err),
    };
  }

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

/** Número só quando a rota de fato relatou um número; ausente é `null`. */
function num(valor) {
  return typeof valor === "number" ? valor : null;
}
function bool(valor) {
  return typeof valor === "boolean" ? valor : null;
}
function tamanho(valor) {
  return Array.isArray(valor) ? valor.length : null;
}

export function resumoDoCorpo(corpo) {
  const vazio = {
    totalDivergencias: null,
    ciclosConferidos: null,
    ciclosTruncado: null,
    vinculosConferidos: null,
    vinculosTruncado: null,
    falhasDeConsulta: null,
    cobrancasSemCiclo: null,
    cobrancasSemCicloTruncado: null,
    ciclosAbortado: null,
    vinculosAbortado: null,
    cobrancasSemCicloAbortado: null,
  };
  if (typeof corpo !== "string") return vazio;
  let d;
  try {
    d = JSON.parse(corpo);
  } catch {
    return vazio;
  }
  if (d === null || typeof d !== "object") return vazio;

  const ciclos = d.ciclos ?? {};
  const vinculos = d.vinculos ?? {};
  const falhasCiclos = tamanho(ciclos.falhas);
  const falhasVinculos = tamanho(vinculos.falhas);

  return {
    totalDivergencias: num(d.totalDivergencias),
    ciclosConferidos: num(ciclos.conferidos),
    ciclosTruncado: bool(ciclos.truncado),
    vinculosConferidos: num(vinculos.conferidos),
    vinculosTruncado: bool(vinculos.truncado),
    falhasDeConsulta:
      falhasCiclos === null && falhasVinculos === null
        ? null
        : (falhasCiclos ?? 0) + (falhasVinculos ?? 0),
    cobrancasSemCiclo: tamanho(d.cobrancasSemCiclo),
    cobrancasSemCicloTruncado: bool(d.cobrancasSemCicloTruncado),
    ciclosAbortado: d.ciclosAbortado ?? null,
    vinculosAbortado: d.vinculosAbortado ?? null,
    cobrancasSemCicloAbortado: d.cobrancasSemCicloAbortado ?? null,
  };
}

/**
 * Toda a decisão de desfecho (o `ok` que vai no log, avisos de stderr, exit
 * code), isolada de `main()` para ser testável sem `process.exit` nem
 * spawnar subprocesso.
 *
 * `ok` é o desfecho REAL da conciliação, não só "o POST voltou 2xx": um
 * aborto server-side dentro de uma resposta 200 não pode logar `ok: true`.
 */
export function decidirDesfecho(resultado, resumo) {
  const abortou =
    resumo.ciclosAbortado !== null ||
    resumo.vinculosAbortado !== null ||
    resumo.cobrancasSemCicloAbortado !== null;
  const truncou =
    resumo.ciclosTruncado === true ||
    resumo.vinculosTruncado === true ||
    resumo.cobrancasSemCicloTruncado === true;
  const falhouConsulta = (resumo.falhasDeConsulta ?? 0) > 0;
  const achou = (resumo.totalDivergencias ?? 0) > 0;

  const avisos = [];
  if (truncou) {
    // Truncamento NUNCA é silencioso: uma passada que parou no teto com fila
    // atrás lê-se como "conferi tudo" se ninguém disser o contrário.
    avisos.push(
      `${PREFIXO} ATENÇÃO: a passada parou no TETO e há fila não conferida. Rode de novo.`,
    );
  }
  if (falhouConsulta) {
    // Falha de consulta NÃO é divergência: significa que não conseguimos
    // perguntar ao Asaas sobre aquelas linhas. `totalDivergencias: 0` numa
    // passada com falhas de consulta não é "está tudo limpo" — é "não
    // sabemos", e não pode sair com exit 0.
    avisos.push(
      `${PREFIXO} ATENÇÃO: ${resumo.falhasDeConsulta} falha(s) de consulta ao gateway — não sabemos o estado dessas linhas. Rode de novo antes de tirar conclusão.`,
    );
  }

  const exigeAtencao = !resultado.ok || abortou || achou || falhouConsulta;
  if (exigeAtencao) {
    avisos.push(
      `${PREFIXO} conciliação exige atenção humana:` +
        ` disparo=${resultado.ok ? "ok" : resultado.falha}` +
        `, divergências=${resumo.totalDivergencias ?? "?"}` +
        `, falhasDeConsulta=${resumo.falhasDeConsulta ?? "?"}` +
        `, abortos=[ciclos=${resumo.ciclosAbortado ?? "não"}, vinculos=${resumo.vinculosAbortado ?? "não"}, orfaos=${resumo.cobrancasSemCicloAbortado ?? "não"}].` +
        ` Siga infra/billing/runbook.md — NADA foi corrigido automaticamente.`,
    );
  }

  return {
    okLogado: resultado.ok && !abortou,
    avisos,
    exitCode: exigeAtencao ? 1 : 0,
  };
}

async function main() {
  const url = process.env.BILLING_CONCILIACAO_URL;
  const token = process.env.BILLING_JOB_TOKEN;

  const faltando = [];
  if (!url) faltando.push("BILLING_CONCILIACAO_URL");
  if (!token) faltando.push("BILLING_JOB_TOKEN");
  if (faltando.length > 0) {
    console.error(
      `${PREFIXO} ERRO: variável(is) de ambiente ausente(s): ${faltando.join(", ")}.`,
    );
    process.exit(1);
  }

  const resultado = await executarConciliacao(globalThis.fetch, { url, token });
  const resumo = resumoDoCorpo(resultado.corpo);
  const desfecho = decidirDesfecho(resultado, resumo);

  // UMA linha JSON: o log do Easypanel é o único observador, e linha única
  // sobrevive a interleaving de stdout. O token não entra aqui, nem truncado.
  console.log(
    JSON.stringify({
      job: "conciliacao-billing",
      quando: new Date().toISOString(),
      ok: desfecho.okLogado,
      status: resultado.status,
      falha: resultado.falha ?? null,
      erro: resultado.erro ?? null,
      ...resumo,
      corpo: resultado.corpo ?? null,
    }),
  );

  for (const aviso of desfecho.avisos) console.error(aviso);

  process.exit(desfecho.exitCode);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
