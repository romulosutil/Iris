import { timingSafeEqual } from "node:crypto";
import {
  cancelarAssinaturasComCarenciaVencida,
  fecharCiclosVencendo,
  reprocessarEventosPendentes,
} from "@/lib/billing/subscription";

/**
 * Gatilho interno do fechamento de ciclo (#36).
 *
 * Por que a apuração mora numa rota do app e não dentro do script agendado:
 * a imagem Docker do job NÃO herda as dependências do app (o Dockerfile lista
 * COPY e instala pacotes à mão), e um import novo que não chegou lá já derrubou
 * o motor de escalonamento em produção com test, typecheck e lint verdes. Se a
 * tabela de faixas de preço vivesse num `.mjs` paralelo, seria a mesma classe
 * de bug — com a agravante de cobrar valor errado em silêncio. O job é um POST;
 * a lógica fica aqui, onde `calculator.ts` é a única fonte do preço.
 *
 * Não é rota pública. A autenticação é um bearer fixo (`BILLING_JOB_TOKEN`)
 * comparado em tempo constante — mesmo idioma de `../../hooks/asaas/route.ts`.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bearer em tempo constante. Env ausente → false, nunca "passa porque não há
 * token configurado": um deploy sem o segredo deve recusar tudo, não liberar
 * um endpoint que dispara cobrança.
 */
function autorizado(header: string | null): boolean {
  const esperado = process.env.BILLING_JOB_TOKEN;
  if (!esperado || !header) return false;
  const prefixo = "Bearer ";
  if (!header.startsWith(prefixo)) return false;
  const recebido = header.slice(prefixo.length);
  const a = Buffer.from(recebido, "utf8");
  const b = Buffer.from(esperado, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  if (!autorizado(request.headers.get("authorization"))) {
    return Response.json({ error: "não autorizado" }, { status: 401 });
  }

  let dryRun = false;
  try {
    const corpo = (await request.json()) as { dryRun?: unknown };
    dryRun = corpo?.dryRun === true;
  } catch {
    // Corpo ausente ou malformado = execução normal. O job manda `{dryRun}`,
    // mas um POST vazio disparado à mão continua válido.
  }

  try {
    // Reprocessa primeiro: um evento de ativação pendente que só agora se
    // aplica precisa entrar no estado ANTES da varredura de ciclos, senão a
    // clínica recém-ativada fica de fora deste fechamento.
    const pendentes = await reprocessarEventosPendentes();
    const resultados = await fecharCiclosVencendo({ dryRun });

    // Corte por carência vencida por ÚLTIMO, e a ordem é a regra (#319):
    // `fecharCiclosVencendo` é quem emite as cobranças do dia e, portanto, quem
    // produz as recusas que carimbam `past_due`. Varrendo a carência antes,
    // cortaríamos no mesmo tick uma clínica cuja cobrança ainda ia ser tentada
    // — e o corte revoga a autorização de Pix Automático, que é irreversível
    // sem uma nova autorização da clínica no app do banco. Depois, o pior caso
    // é um dia a mais de carência, que é o lado seguro.
    const cortes = await cancelarAssinaturasComCarenciaVencida({ dryRun });
    const cortesComErro = cortes.filter((c) => c.erro);

    const comErro = resultados.filter((r) => r.erro);
    return Response.json({
      ok: true,
      dryRun,
      eventosReprocessados: pendentes,
      ciclosProcessados: resultados.length,
      // Chaves próprias, e não somadas às do fechamento: `ciclosProcessados` e
      // `falhas` são lidas no log do job como "faturamento do dia", e misturar
      // corte de inadimplente ali tornaria as duas leituras impossíveis de
      // separar depois do fato.
      carenciaAvaliadas: cortes.length,
      carenciaCortadas: cortes.filter((c) => c.cortada).length,
      // Truncamento vai no corpo, não só no `console.warn`: o job só registra
      // o JSON, e uma passada que parou no teto com fila atrás é
      // indistinguível de uma que cobriu tudo se esse sinal não subir.
      carenciaTruncado: cortes.some((c) => c.truncado),
      carenciaFalhas: cortesComErro.map((c) => ({
        clinicId: c.clinicId,
        erro: c.erro,
      })),
      cortesPorCarencia: cortes.map((c) => ({
        clinicId: c.clinicId,
        pastDueDesde: c.pastDueDesde,
        carenciaDias: c.carenciaDias,
        cortada: c.cortada,
      })),
      // Falha de UMA clínica não derruba a varredura, mas também não pode
      // sumir: vai no corpo, e o job registra a linha inteira no log.
      falhas: comErro.map((r) => ({ clinicId: r.clinicId, erro: r.erro })),
      resultados: resultados.map((r) => ({
        clinicId: r.clinicId,
        fichasContadas: r.fichasContadas,
        valorCentavos: r.valorCentavos,
        cobrancaEmitida: r.cobrancaEmitida,
        providerChargeId: r.providerChargeId,
      })),
    });
  } catch (err) {
    // 5xx só para falha que impediu a varredura inteira. O texto real do erro
    // vai no corpo: uma mensagem genérica aqui transformaria o diagnóstico de
    // faturamento parado numa caçada às cegas.
    console.error("[billing-fechamento] falha na varredura", err);
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
