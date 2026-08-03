import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveTenant, COOKIE_CLINICA, COOKIE_PAPEL } from "@/auth/tenant";
import InstitutionalLandingPage, { metadata } from "./institucional/page";

export { metadata };

/**
 * Rota raiz pública (/) — irisclinica.ia.br
 * Exibe a Landing Page para visitantes não autenticados.
 * Se o usuário estiver autenticado, redireciona para a aplicação (/agenda).
 */
export default async function RootPage() {
  const reqHeaders = await headers();
  const ck = await cookies();
  const r = await resolveTenant(reqHeaders, {
    activeClinic: ck.get(COOKIE_CLINICA)?.value,
    activeRole: ck.get(COOKIE_PAPEL)?.value,
  });

  if (r.status === "ok") {
    redirect("/agenda");
  } else if (r.status === "needs_clinic_selection") {
    redirect("/selecionar-clinica");
  } else if (r.status === "needs_role_selection") {
    redirect("/selecionar-papel");
  } else if (r.status === "cadastro_incompleto") {
    redirect("/sem-acesso?motivo=cadastro-incompleto");
  } else if (r.status === "no_access") {
    redirect("/sem-acesso");
  }

  return <InstitutionalLandingPage />;
}
