import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { withTenant } from "@/db/rls";
import { Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { listarDuvidasAbertas } from "./queries";
import { alvosValidosDoPaciente, type AlvoValido } from "../validacao/alvos";
import { DuvidasLista } from "./duvidas-lista";

/**
 * Dúvidas abertas do coordenador (Fase 5 · Fatia 1) — espelho de
 * `validacao/page.tsx`, do lado do terapeuta. Terapeuta E coordenador podem
 * ver/responder (o coordenador pode estar cobrindo uma equipe) — qualquer
 * outro papel é rejeitado. Os alvos válidos de correção são resolvidos aqui,
 * por paciente, mesmo padrão de `validacao/page.tsx`.
 */
export default async function DuvidasPage() {
  const ctx = await getTenantContext();
  if (ctx.role !== "terapeuta" && ctx.role !== "coordenador") notFound();

  const itens = await listarDuvidasAbertas(ctx);

  const pacientesUnicos = Array.from(new Set(itens.map((i) => i.patientId)));
  const alvosPorPaciente: Record<string, AlvoValido[]> = {};
  if (pacientesUnicos.length > 0) {
    await withTenant(ctx, async (tx) => {
      for (const patientId of pacientesUnicos) {
        alvosPorPaciente[patientId] = await alvosValidosDoPaciente(tx, patientId);
      }
    });
  }

  return (
    <Stack gap="lg">
      <PageHeader
        title="Dúvidas do coordenador"
        description={
          itens.length === 0
            ? "Nenhuma dúvida aberta — nada pendente de resposta."
            : `${itens.length} ${itens.length === 1 ? "dúvida pede" : "dúvidas pedem"} resposta.`
        }
      />

      <DuvidasLista itens={itens} alvosPorPaciente={alvosPorPaciente} />
    </Stack>
  );
}
