/**
 * Conciliação manual de billing (#375).
 *
 * PAGINA até esgotar os três braços (ciclos, vínculos, cobranças sem ciclo) ou
 * até o teto de segurança `MAX_PAGINAS`. NÃO é agendado — é executado sob
 * demanda pelo operador, seguindo `infra/billing/runbook.md`.
 *
 * Por que pagina (achado BLOCKING da revisão do PR #468): a rota tem um teto
 * fixo por passada (`TETO_CONCILIACAO_POR_PASSADA`), e cada consulta ordena
 * pelos registros mais RECENTES. Sem cursor, "rode de novo" sempre devolvia os
 * mesmos 100 registros numa base com mais de 100 elegíveis — loop infinito.
 * Este script agora avança um `offset` por braço a cada passada em que a rota
 * relatou `truncado: true`, e passa `limite: 0` para um braço já esgotado
 * nesta corrida (a rota devolve vazio sem gastar chamada ao Asaas nele).
 *
 * O que ele NÃO faz: não fala com o Postgres, não fala com o Asaas, não corrige
 * nada. Cada passada é UM POST autenticado numa rota interna do Next, e é a
 * rota, em TypeScript dentro do app, que compara os dois lados. A razão de
 * não portar a lógica pra cá é a #156: a imagem Docker de job não herda o
 * `node_modules` do app, e um import novo que não chegou lá derrubou o motor
 * de escalonamento em produção com CI verde. Zero dependência npm aqui — só o
 * `fetch` nativo do Node 22.
 *
 * Env obrigatórias:
 *   BILLING_CONCILIACAO_URL  ex.: https://irisclinica.ia.br/api/internal/billing/conciliar
 *   BILLING_JOB_TOKEN        mesmo segredo do fechamento. NUNCA é impresso.
 *
 * Execução:
 *   node scripts/conciliacao-billing.mjs
 *
 * Exit code: 0 = todos os braços esgotados, sem falha de consulta ao gateway,
 * e sem divergência. 1 = qualquer outra coisa (falha no disparo, etapa
 * abortada, divergência encontrada, teto de PÁGINAS atingido sem esgotar um
 * braço, ou falha de consulta) — todas exigem um humano.
 */

import { fileURLToPath } from "node:url";
import { log } from "./lib/log-estruturado.mjs";

const PREFIXO = "[conciliacao-billing]";

/** Teto de passadas por corrida — backstop contra um braço que nunca esgota
 * (ex.: `truncado` preso em `true` por um bug futuro). Atingi-lo é tratado
 * como "exige atenção", nunca como loop silencioso. */
export const MAX_PAGINAS = 50;

export function montarRequisicao(url, token, corpo = {}) {
  return {
    url,
    init: {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(corpo),
    },
  };
}

export async function executarConciliacao(
  fetchImpl,
  { url, token, corpo = {}, timeoutMs = 120000 } = {},
) {
  const { url: alvo, init } = montarRequisicao(url, token, corpo);

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

  let corpoDaResposta;
  try {
    corpoDaResposta = await resposta.text();
  } catch (err) {
    corpoDaResposta = `<falha ao ler o corpo da resposta: ${String(err?.message ?? err)}>`;
  }

  if (!resposta.ok) {
    return {
      ok: false,
      status: resposta.status,
      corpo: corpoDaResposta,
      falha: "status",
      erro: `HTTP ${resposta.status} — corpo recebido: ${corpoDaResposta}`,
    };
  }

  return { ok: true, status: resposta.status, corpo: corpoDaResposta };
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

/** Estado de paginação de UM braço entre passadas. */
export function estadoInicialDoBraco() {
  return { offset: 0, esgotado: false };
}

/** `null` quando o braço já esgotou: o corpo não manda o campo, a rota usa o
 * default dela (não faz diferença — o braço nem roda porque `limite: 0`
 * some junto). Explícito só quando ainda há página a pedir. */
export function camposDoBraco(prefixo, estado) {
  if (estado.esgotado) return { [`${prefixo}Limite`]: 0 };
  if (estado.offset === 0) return {};
  return { [`${prefixo}Offset`]: estado.offset };
}

/** Avança offset pelo tanto que a passada conferiu, ou marca esgotado. */
export function avancarBraco(estado, conferidos, truncado) {
  if (estado.esgotado) return estado;
  if (truncado === true) {
    return { offset: estado.offset + (conferidos ?? 0), esgotado: false };
  }
  return { offset: estado.offset, esgotado: true };
}

function somaOuNull(a, b) {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

/** Acumula os totais de várias passadas num único resumo — mesmo shape de
 * `resumoDoCorpo`, para `decidirDesfecho` não precisar saber que houve
 * paginação. */
export function agregarResumo(acumulado, resumo) {
  return {
    totalDivergencias: somaOuNull(
      acumulado.totalDivergencias,
      resumo.totalDivergencias,
    ),
    ciclosConferidos: somaOuNull(
      acumulado.ciclosConferidos,
      resumo.ciclosConferidos,
    ),
    ciclosTruncado: resumo.ciclosTruncado ?? acumulado.ciclosTruncado,
    vinculosConferidos: somaOuNull(
      acumulado.vinculosConferidos,
      resumo.vinculosConferidos,
    ),
    vinculosTruncado: resumo.vinculosTruncado ?? acumulado.vinculosTruncado,
    falhasDeConsulta: somaOuNull(
      acumulado.falhasDeConsulta,
      resumo.falhasDeConsulta,
    ),
    cobrancasSemCiclo: somaOuNull(
      acumulado.cobrancasSemCiclo,
      resumo.cobrancasSemCiclo,
    ),
    cobrancasSemCicloTruncado:
      resumo.cobrancasSemCicloTruncado ?? acumulado.cobrancasSemCicloTruncado,
    // Abortos: o primeiro braço que abortar guarda o motivo — passadas
    // seguintes não sobrescrevem um diagnóstico já capturado.
    ciclosAbortado: acumulado.ciclosAbortado ?? resumo.ciclosAbortado,
    vinculosAbortado: acumulado.vinculosAbortado ?? resumo.vinculosAbortado,
    cobrancasSemCicloAbortado:
      acumulado.cobrancasSemCicloAbortado ?? resumo.cobrancasSemCicloAbortado,
  };
}

const RESUMO_VAZIO = {
  totalDivergencias: null,
  ciclosConferidos: null,
  ciclosTruncado: false,
  vinculosConferidos: null,
  vinculosTruncado: false,
  falhasDeConsulta: null,
  cobrancasSemCiclo: null,
  cobrancasSemCicloTruncado: false,
  ciclosAbortado: null,
  vinculosAbortado: null,
  cobrancasSemCicloAbortado: null,
};

async function main() {
  const url = process.env.BILLING_CONCILIACAO_URL;
  const token = process.env.BILLING_JOB_TOKEN;

  const faltando = [];
  if (!url) faltando.push("BILLING_CONCILIACAO_URL");
  if (!token) faltando.push("BILLING_JOB_TOKEN");
  if (faltando.length > 0) {
    log.error("conciliacao-billing.env-ausente", { faltando });
    process.exit(1);
  }

  let ciclos = estadoInicialDoBraco();
  let vinculos = estadoInicialDoBraco();
  let cobrancasSemCiclo = estadoInicialDoBraco();
  let resumo = RESUMO_VAZIO;
  let resultado;
  let paginas = 0;
  let tetoDePaginasAtingido = false;

  while (true) {
    paginas += 1;
    const corpo = {
      ...camposDoBraco("ciclos", ciclos),
      ...camposDoBraco("vinculos", vinculos),
      ...camposDoBraco("cobrancasSemCiclo", cobrancasSemCiclo),
    };

    resultado = await executarConciliacao(globalThis.fetch, {
      url,
      token,
      corpo,
    });
    if (!resultado.ok) break;

    const resumoDaPagina = resumoDoCorpo(resultado.corpo);
    resumo = agregarResumo(resumo, resumoDaPagina);

    ciclos = avancarBraco(
      ciclos,
      resumoDaPagina.ciclosConferidos,
      resumoDaPagina.ciclosTruncado,
    );
    vinculos = avancarBraco(
      vinculos,
      resumoDaPagina.vinculosConferidos,
      resumoDaPagina.vinculosTruncado,
    );
    cobrancasSemCiclo = avancarBraco(
      cobrancasSemCiclo,
      resumoDaPagina.cobrancasSemCiclo,
      resumoDaPagina.cobrancasSemCicloTruncado,
    );

    if (ciclos.esgotado && vinculos.esgotado && cobrancasSemCiclo.esgotado) {
      break;
    }
    if (paginas >= MAX_PAGINAS) {
      tetoDePaginasAtingido = true;
      // Reusa os campos `*Truncado` já lidos por `decidirDesfecho`: teto de
      // páginas SEM esgotar um braço é, pro operador, a mesma situação que
      // truncamento — há fila que este script não conferiu.
      resumo = {
        ...resumo,
        ciclosTruncado: resumo.ciclosTruncado || !ciclos.esgotado,
        vinculosTruncado: resumo.vinculosTruncado || !vinculos.esgotado,
        cobrancasSemCicloTruncado:
          resumo.cobrancasSemCicloTruncado || !cobrancasSemCiclo.esgotado,
      };
      break;
    }
  }

  const desfecho = decidirDesfecho(resultado, resumo);
  if (tetoDePaginasAtingido) {
    desfecho.avisos.push(
      `${PREFIXO} ATENÇÃO: teto de ${MAX_PAGINAS} páginas atingido nesta corrida sem esgotar todos os braços. Rode de novo — o offset avança sozinho, mas cada corrida tem esse limite de segurança.`,
    );
  }

  // UMA linha JSON: o log do Easypanel é o único observador, e linha única
  // sobrevive a interleaving de stdout. O token não entra aqui, nem truncado.
  // Já era UMA linha JSON à mão; `job`/`quando` viram `evento`/`hora`, e o
  // objeto passa a atravessar a redaction por chave.
  log.info("conciliacao-billing.passada-concluida", {
    ok: desfecho.okLogado,
    status: resultado.status,
    falha: resultado.falha ?? null,
    erroCategoria: resultado.erro ?? null,
    paginas,
    ...resumo,
    corpo: corpoParaLog(resultado.corpo),
  });

  // Os avisos são frases montadas por `decidirDesfecho` para o operador ler.
  // Continuam saindo em `error`, um registro por aviso, com o texto num campo:
  // reescrevê-los como eventos fechados é mudança de comportamento do desfecho,
  // não de log, e sai do escopo desta fatia.
  for (const aviso of desfecho.avisos) {
    log.error("conciliacao-billing.aviso", { aviso });
  }

  process.exit(desfecho.exitCode);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
