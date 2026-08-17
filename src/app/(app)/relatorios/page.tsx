import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { Stack } from "@/components/ui/layout";
import { listarPacientesParaRelatorio } from "./queries";
import { RelatoriosExport } from "./relatorios-export";
import { FamiliaReport } from "./familia-report";
import { ConvenioNarrativoReport } from "./convenio-narrativo-report";

/**
 * Rota `/relatorios` (Fase 5). Tiles: "Dossiê para convênio" (Fatia 3, factual,
 * coordenador E terapeuta — terapeuta só do seu próprio paciente, RLS
 * bloqueia o resto na exportação); "Relatório da família" (Fatia 4, gerar:
 * coordenador ou terapeuta on-team, curar/exportar: só coordenador);
 * "Relatório narrativo de convênio" (Fatia 5, D6: coordenador-only em TODAS
 * as ações — terapeuta nem gera, nem vê o tile). Qualquer outro papel é
 * rejeitado, espelhando `duvidas/page.tsx`.
 */
export default async function RelatoriosPage() {
  const ctx = await getTenantContext();
  if (ctx.role !== "coordenador" && ctx.role !== "terapeuta") notFound();

  const pacientes = await listarPacientesParaRelatorio(ctx);

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <h1 className="font-display text-3xl font-bold text-[var(--text-primary)]">
          Relatórios
        </h1>
        <p className="text-lg text-[var(--text-primary)]">
          Dossiê para convênio: dados factuais de presença e evidências
          aprovadas no período — sem narrativa gerada por IA.
        </p>
      </Stack>

      <RelatoriosExport pacientes={pacientes} />

      {/* Escopo de tema família: aplica os tokens [data-mode="familia"]
          (sombra reduzida, canto macio, acento de conquista) SÓ ao cartão da
          família. Os demais cartões desta página herdam o modo clínico do
          <html data-mode="clinico"> (layout.tsx). R6.6.1. */}
      <div data-mode="familia">
        <FamiliaReport
          pacientes={pacientes}
          podeCurar={ctx.role === "coordenador"}
        />
      </div>

      {ctx.role === "coordenador" ? (
        <ConvenioNarrativoReport pacientes={pacientes} podeCurar />
      ) : null}
    </Stack>
  );
}
