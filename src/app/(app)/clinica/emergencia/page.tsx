import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { lerConfigEmergencia, listarUsuariosDaClinica } from "./logic";
import { EmergenciaForm } from "./emergencia-form";

/**
 * #122 Fatia 4 — configuração de emergência do tenant. Coordenador-only: é
 * configuração estrutural da clínica (quem é o responsável técnico, qual o
 * protocolo exibido no estágio 2, quem assinou a declaração da cláusula 10.3).
 */
export default async function EmergenciaPage() {
  const ctx = await getTenantContext();
  try {
    requireRole(ctx, "coordenador");
  } catch {
    notFound();
  }

  const [config, usuarios] = await Promise.all([
    lerConfigEmergencia(ctx),
    listarUsuariosDaClinica(ctx),
  ]);

  return (
    <Stack gap="lg" como="main">
      <PageHeader
        title="Emergência e protocolo da clínica"
        description="Responsável técnico, Protocolo de Emergência Interno e a declaração exigida para usar o módulo de alerta de risco."
      />
      <EmergenciaForm config={config} usuarios={usuarios} />
    </Stack>
  );
}
