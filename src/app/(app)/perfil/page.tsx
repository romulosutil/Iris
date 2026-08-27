import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { lerPerfilProfissional } from "./logic";
import { PerfilForm } from "./perfil-form";

/**
 * D56 — perfil profissional do próprio usuário. Sem gate de papel, de
 * propósito: a declaração de e-Psi (Res. CFP 009/2024) é do profissional sobre
 * o próprio cadastro, e quem coordena também atende. Por isso a rota fica fora
 * de `(app)/clinica/`, que é coordenador-only.
 */
export default async function PerfilPage() {
  const ctx = await getTenantContext();
  const perfil = await lerPerfilProfissional(ctx);
  if (!perfil) notFound();

  return (
    <Stack gap="lg" como="main">
      <PageHeader
        title="Meu perfil profissional"
        description="Registro no conselho e declaração de cadastro ativo no e-Psi para atendimento mediado por tecnologia (Res. CFP nº 009/2024)."
      />
      <PerfilForm perfil={perfil} />
    </Stack>
  );
}
