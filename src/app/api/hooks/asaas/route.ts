import { timingSafeEqual } from "node:crypto";
import { authDb } from "@/db/client";
import { asaasWebhookEvent } from "@/db/schema";

/**
 * Recepção de webhook do Asaas — Pix Automático (#36, Fase 7).
 *
 * O que este endpoint faz, e SÓ isso: autentica a chamada, deduplica a
 * entrega, persiste o evento bruto e responde 200. Não apura nada.
 *
 * Por que não apura: o faturamento é por paciente ativo/mês, e a contagem de
 * ativos + o cálculo do valor cobrado dependem da tabela `subscription`, que
 * ainda não existe (#159). Mais importante que a ordem das issues: esta rota
 * roda em `authDb` (role `iris_auth`), e `authDb` NUNCA toca dado de paciente
 * — é o invariante que mantém `withTenant()` como gargalo único de acesso a
 * dado clínico (ver `src/db/client.ts:60`). Contar pacientes aqui furaria
 * exatamente esse gargalo. Quando a #159 chegar, a apuração roda FORA do
 * handler, sobre o histórico bruto guardado aqui.
 *
 * Por que `authDb` e não `withTenant()`: a requisição vem do Asaas, não de uma
 * sessão de usuário — não existe tenant a resolver. A migração 0066 dá GRANT
 * de SELECT/INSERT em `asaas_webhook_event` só para `iris_auth`; `app_role`
 * não recebe grant nenhum.
 *
 * Env necessária (secret no Easypanel — nunca versionar):
 *   ASAAS_WEBHOOK_TOKEN  token que o Asaas devolve no header a cada entrega
 *                        (painel: Integrações → Webhooks → Token de autenticação)
 */

// node:crypto + driver Postgres: precisa de runtime Node, não edge.
export const runtime = "nodejs";
// Sem cache: é webhook, cada POST é efeito colateral.
export const dynamic = "force-dynamic";

/** Header em que o Asaas devolve o token configurado no painel. */
const HEADER_TOKEN = "asaas-access-token";

/**
 * Comparação do token em tempo constante.
 *
 * Dois cuidados que a versão ingênua erra:
 * 1. `timingSafeEqual` LANÇA quando os buffers têm tamanhos diferentes — e um
 *    throw aqui viraria 500, que o Asaas reentrega em loop. Compara-se o
 *    tamanho antes e retorna-se false (o tamanho do token não é segredo).
 * 2. Env ausente → false, nunca "passa porque não há token configurado". Um
 *    deploy sem o secret deve rejeitar tudo, não aceitar tudo.
 */
function tokenConfere(recebido: string | null): boolean {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido, "utf8");
  const b = Buffer.from(esperado, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * `id` do evento no Asaas. Vem como string (`evt_...`), mas aceitamos number
 * por robustez de contrato de terceiro — normalizando para text, que é o tipo
 * da coluna com o UNIQUE. Vazio/ausente é 400: sem chave não há dedup, e
 * gravar sem chave é pior que recusar (o Asaas reentrega e nós duplicamos).
 */
function extraiTexto(valor: unknown): string | null {
  if (typeof valor === "string") return valor.trim() || null;
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  return null;
}

export async function POST(request: Request): Promise<Response> {
  if (!tokenConfere(request.headers.get(HEADER_TOKEN))) {
    // Corpo curto e IDÊNTICO para token errado, token ausente e env não
    // configurada: a resposta não pode dizer qual dos três aconteceu.
    return Response.json({ error: "não autorizado" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    // 400, não 500: corpo malformado não melhora com reentrega.
    return Response.json(
      { error: "corpo inválido (JSON esperado)" },
      { status: 400 },
    );
  }

  const p = (payload ?? {}) as Record<string, unknown>;
  const asaasEventId = extraiTexto(p.id);
  const evento = extraiTexto(p.event);
  if (!asaasEventId || !evento) {
    return Response.json(
      { error: "payload sem `id` ou `event`" },
      { status: 400 },
    );
  }

  try {
    /**
     * Dedup à prova de corrida.
     *
     * O Asaas reentrega em paralelo, então SELECT-then-INSERT tem janela: as
     * duas entregas leem "não existe" antes de qualquer uma gravar, e uma
     * delas estoura violação de unicidade (→ 500 → mais reentrega) ou, pior,
     * o processamento roda duas vezes. Aqui quem decide a corrida é o
     * `UNIQUE (asaas_event_id)` do Postgres, dentro de UMA instrução atômica:
     * `ON CONFLICT DO NOTHING ... RETURNING` devolve linha só para quem de
     * fato inseriu. Zero linhas devolvidas = alguém chegou antes = duplicado.
     *
     * Preferido a `try/catch` na violação 23505 porque não custa um roundtrip
     * de erro nem exige acertar o SQLSTATE embrulhado pelo Drizzle.
     */
    const inseridas = await authDb
      .insert(asaasWebhookEvent)
      .values({ asaasEventId, evento, payload })
      .onConflictDoNothing({ target: asaasWebhookEvent.asaasEventId })
      .returning({ id: asaasWebhookEvent.id });

    if (inseridas.length === 0) {
      return Response.json({ received: true, duplicado: true });
    }

    /**
     * Só eventos `PIX_AUTOMATIC_RECURRING_*` interessam ao faturamento, mas
     * NÃO filtramos aqui: qualquer evento — conhecido, irrelevante ou novo —
     * é registrado e responde 200. 5xx em evento que não sabemos tratar vira
     * loop de reentrega no Asaas, e o payload guardado é o que permite
     * reprocessar quando a apuração existir (#159).
     */
    return Response.json({ received: true });
  } catch (err) {
    // Falha real de infraestrutura (banco fora) DEVE ser 5xx: aí a reentrega
    // do Asaas é justamente o comportamento desejado.
    console.error("[asaas-webhook] falha ao registrar evento", {
      asaasEventId,
      evento,
      err,
    });
    return Response.json(
      { error: "falha ao registrar evento" },
      { status: 500 },
    );
  }
}
