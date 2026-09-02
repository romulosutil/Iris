import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { listarSaudeIa, listarSupervisao } from "./queries";
import { SupervisaoFila } from "./supervisao-fila";
import { SaudeIa } from "./saude-ia";

export default async function SupervisaoPage() {
  const ctx = await getTenantContext();
  if (ctx.role !== "coordenador") notFound();

  // Sequencial de propósito: cada `withTenant` abre a própria transação; duas
  // em paralelo dobrariam conexões numa tela que já roda várias consultas.
  const { itens } = await listarSupervisao(ctx);
  // DA-01 (#535): agregados da view (sem PII), coordenador-only na própria view.
  const saudeIa = await listarSaudeIa(ctx);

  return (
    <Stack gap="lg">
      <PageHeader
        title="Supervisão & Estagnação"
        description="Acompanhamento de estagnação, regressão clínica e faltas excessivas de pacientes."
      />
      <SupervisaoFila itens={itens} />
      <SaudeIa linhas={saudeIa} />
    </Stack>
  );
}
