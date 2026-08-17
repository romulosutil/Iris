import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { withTenant } from "@/db/rls";
import { Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { GovernancaNav } from "@/components/ui/governanca-nav";
import { listarFilaValidacao } from "./queries";
import { alvosValidosDoPaciente, type AlvoValido } from "./alvos";
import { ValidacaoFila } from "./validacao-fila";

/**
 * Fila de validação do coordenador (Fase 5 · Fatia 1). Coordenador-only.
 */
export default async function ValidacaoPage() {
  const ctx = await getTenantContext();
  if (ctx.role !== "coordenador") notFound();

  const fila = await listarFilaValidacao(ctx);

  const pacientesUnicos = Array.from(
    new Set(fila.itens.map((i) => i.patientId)),
  );
  const alvosPorPaciente: Record<string, AlvoValido[]> = {};
  if (pacientesUnicos.length > 0) {
    await withTenant(ctx, async (tx) => {
      for (const patientId of pacientesUnicos) {
        alvosPorPaciente[patientId] = await alvosValidosDoPaciente(
          tx,
          patientId,
        );
      }
    });
  }

  return (
    <Stack gap="lg">
      <GovernancaNav />
      <PageHeader
        title="Central de Validação"
        description={
          fila.total === 0
            ? "Tudo em dia! Nenhuma evidência aguardando revisão no momento."
            : `A IA anotou ${fila.total} ${fila.total === 1 ? "sugestão de sessão" : "sugestões de sessões"}. Pronto para validar com seu olhar clínico?`
        }
      />
      <ValidacaoFila itens={fila.itens} alvosPorPaciente={alvosPorPaciente} />
    </Stack>
  );
}
