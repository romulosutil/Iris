import { timingSafeEqual } from "node:crypto";
import {
  conciliarCiclos,
  conciliarVinculos,
  type ResultadoConciliacaoCiclos,
  type ResultadoConciliacaoVinculos,
} from "@/lib/billing/conciliacao";
import { listarCobrancasDeCicloNaoConciliadas } from "@/lib/billing/erro-aplicacao";

/**
 * Conciliação manual de billing (#375).
 *
 * SOMENTE LEITURA. Nenhuma função de mutação é importada aqui, e há um teste
 * que varre o texto deste arquivo para garantir isso — a tentação de "já que
 * detectei, corrijo" é exatamente o caminho para uma segunda emissão de
 * cobrança convivendo com o job de fechamento de ciclo vencido, sem a
 * idempotência que o UNIQUE parcial de `provider_charge_id` dá àquele.
 *
 * Por que a lógica mora aqui e não no `.mjs` agendado: a imagem Docker do job
 * NÃO herda o `node_modules` do app (`infra/billing/Dockerfile` não roda
 * `npm install`, de propósito). É a mesma decisão de `fechar-ciclos/route.ts`.
 *
 * Autenticação: bearer fixo `BILLING_JOB_TOKEN`, comparado em tempo constante.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mensagemDoErro(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Env ausente → false. Deploy sem segredo recusa tudo, nunca libera. */
function autorizado(header: string | null): boolean {
  const esperado = process.env.BILLING_JOB_TOKEN;
  if (!esperado || !header) return false;
  const prefixo = "Bearer ";
  if (!header.startsWith(prefixo)) return false;
  const a = Buffer.from(header.slice(prefixo.length), "utf8");
  const b = Buffer.from(esperado, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  if (!autorizado(request.headers.get("authorization"))) {
    return Response.json({ error: "não autorizado" }, { status: 401 });
  }

  const vazioCiclos: ResultadoConciliacaoCiclos = {
    conferidos: 0,
    divergencias: [],
    falhas: [],
    truncado: false,
  };
  const vazioVinculos: ResultadoConciliacaoVinculos = {
    conferidos: 0,
    divergencias: [],
    falhas: [],
    truncado: false,
  };

  // Cada varredura tem `try/catch` PRÓPRIO, e as três são independentes: uma
  // etapa que cai não pode descartar o diagnóstico que as outras já produziram.
  // Este JSON é a única memória da passada — 500 seco apagaria o resto.
  let ciclos = vazioCiclos;
  let ciclosAbortado: string | null = null;
  try {
    ciclos = await conciliarCiclos();
  } catch (err) {
    ciclosAbortado = mensagemDoErro(err);
    console.error("[billing-conciliacao] varredura de ciclos abortou", err);
  }

  let vinculos = vazioVinculos;
  let vinculosAbortado: string | null = null;
  try {
    vinculos = await conciliarVinculos();
  } catch (err) {
    vinculosAbortado = mensagemDoErro(err);
    console.error("[billing-conciliacao] varredura de vínculos abortou", err);
  }

  /**
   * Terceiro braço: dinheiro que ENTROU sem ciclo correspondente. As duas
   * varreduras acima partem de `billing_cycle` / `subscription`, então são
   * cegas para uma cobrança nossa que o gateway conhece e o banco não. Esta
   * consulta parte do outro lado — da fila de eventos de webhook — e reavalia o
   * estado VIVO do ciclo, sem ler o carimbo histórico de `erro_aplicacao`.
   */
  const LIMITE_COBRANCAS_SEM_CICLO = 100;
  let cobrancasSemCiclo: Awaited<
    ReturnType<typeof listarCobrancasDeCicloNaoConciliadas>
  > = [];
  let cobrancasSemCicloTruncado = false;
  let cobrancasSemCicloAbortado: string | null = null;
  try {
    // +1 para SABER que há fila atrás sem uma segunda consulta de contagem —
    // mesmo padrão de `conciliarCiclos`/`conciliarVinculos` (A5: truncamento
    // nunca é silencioso).
    const lote = await listarCobrancasDeCicloNaoConciliadas(
      LIMITE_COBRANCAS_SEM_CICLO + 1,
    );
    cobrancasSemCicloTruncado = lote.length > LIMITE_COBRANCAS_SEM_CICLO;
    cobrancasSemCiclo = cobrancasSemCicloTruncado
      ? lote.slice(0, LIMITE_COBRANCAS_SEM_CICLO)
      : lote;
  } catch (err) {
    cobrancasSemCicloAbortado = mensagemDoErro(err);
    console.error("[billing-conciliacao] fila de eventos órfãos abortou", err);
  }

  const totalDivergencias =
    ciclos.divergencias.length +
    vinculos.divergencias.length +
    cobrancasSemCiclo.length;

  const abortou =
    ciclosAbortado !== null ||
    vinculosAbortado !== null ||
    cobrancasSemCicloAbortado !== null;

  return Response.json({
    // `ok` é "a passada rodou inteira", não "não achou nada": relatório com
    // divergências é uma conciliação que FUNCIONOU.
    ok: !abortou,
    quando: new Date().toISOString(),
    ciclos,
    ciclosAbortado,
    vinculos,
    vinculosAbortado,
    cobrancasSemCiclo,
    cobrancasSemCicloTruncado,
    cobrancasSemCicloAbortado,
    totalDivergencias,
  });
}
