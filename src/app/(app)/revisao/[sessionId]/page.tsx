import { redirect } from "next/navigation";

/**
 * #512 · T14 (R-34) — `/revisao/[sessionId]` foi absorvida por
 * `/sessoes/[id]` (T06): mesma `RevisaoLista`/`carregarRevisao`, agora dentro
 * do passo "Revisar evidências" da timeline
 * (`../../sessoes/[id]/passo-revisar.tsx`). Redirect permanente preservando o
 * `sessionId` — link salvo e teste E2E por URL não podem quebrar (R-34).
 */
export default async function RevisaoPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  redirect(`/sessoes/${sessionId}`);
}
