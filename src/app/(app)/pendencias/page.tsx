import { redirect } from "next/navigation";

/**
 * #512 · T14 (R-34) — `/pendencias` foi absorvida por `/sessoes` (T04): fila
 * única de sessões travadas, mesmo predicado (`contarTravadas`/`T02`), sem
 * duas telas parecidas. Redirect permanente para quem tem o link/favorito
 * antigo — R-34 exige que nem o link salvo nem o teste E2E por URL quebrem.
 */
export default function PendenciasPage() {
  redirect("/sessoes");
}
