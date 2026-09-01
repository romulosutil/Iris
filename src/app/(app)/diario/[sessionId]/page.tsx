import { redirect } from "next/navigation";

/**
 * #512 · T14 (R-34) — `/diario/[sessionId]` foi absorvida por `/sessoes/[id]`
 * (T06): mesma `CapturaForm`/`ConsolidarForm`, agora dentro do passo
 * "Documentar" da timeline (`../../sessoes/[id]/passo-documentar.tsx`).
 * Redirect permanente preservando o `sessionId` — link salvo e teste E2E por
 * URL não podem quebrar (R-34).
 */
export default async function DiarioPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  redirect(`/sessoes/${sessionId}`);
}
