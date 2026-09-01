import { redirect } from "next/navigation";

/**
 * #512 · T14 (R-34, R-35) — "Central de Validação" era o item primário do
 * coordenador; virou `/sessoes` (T04). `?de=validacao` carrega o sinal para
 * `AvisoCentralValidacao` (`../sessoes/estado-tela.tsx`) mostrar a dica de
 * primeira visita (R-35) — sumir com o nome sem aviso é ruim, mas o redirect
 * sozinho já resolve o link salvo/teste E2E por URL (R-34).
 */
export default function ValidacaoPage() {
  redirect("/sessoes?de=validacao");
}
