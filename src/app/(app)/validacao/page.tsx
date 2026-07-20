import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { withTenant } from "@/db/rls";
import { Stack } from "@/components/ui/layout";
import { listarFilaValidacao } from "./queries";
import { alvosValidosDoPaciente, type AlvoValido } from "./alvos";
import { ValidacaoFila } from "./validacao-fila";

/**
 * Fila de validação do coordenador (Fase 5 · Fatia 1). Coordenador-only —
 * espelha `excecoes/page.tsx`. Cada item pede uma ação unitária (confirmar,
 * reclassificar, devolver com dúvida ou invalidar) — nunca ação em lote.
 * Os alvos válidos de reclassificação são resolvidos aqui, por paciente
 * (uma query por paciente distinto na fila — fila pequena por natureza:
 * é o represado que ainda não foi tratado, não o histórico inteiro).
 */
export default async function ValidacaoPage() {
  const ctx = await getTenantContext();
  if (ctx.role !== "coordenador") notFound();

  const fila = await listarFilaValidacao(ctx);

  const pacientesUnicos = Array.from(new Set(fila.itens.map((i) => i.patientId)));
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
      <Stack gap="sm">
        <h1 className="font-display text-ink-anchor text-3xl font-bold">
          Fila de validação
        </h1>
        <p className="text-ink text-lg">
          {fila.total === 0
            ? "Nada represado — fila em dia."
            : `${fila.total} ${fila.total === 1 ? "item pede" : "itens pedem"} validação.`}
        </p>
      </Stack>

      <ValidacaoFila itens={fila.itens} alvosPorPaciente={alvosPorPaciente} />
    </Stack>
  );
}
