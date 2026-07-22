import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { Stack } from "@/components/ui/layout";
import { listarPacientesParaRelatorio } from "./queries";
import { RelatoriosExport } from "./relatorios-export";
import { FamiliaReport } from "./familia-report";

/**
 * Rota `/relatorios` (Fase 5 · Fatia 3) — exportação do dossiê
 * `convenio_bruto`. Coordenador E terapeuta podem gerar (terapeuta só do seu
 * próprio paciente — RLS bloqueia o resto na exportação); qualquer outro
 * papel é rejeitado, espelhando `duvidas/page.tsx`. Hoje só existe o tile
 * "Dossiê para convênio" — "Relatório da família" é Fatia 4, não invente
 * aqui.
 */
export default async function RelatoriosPage() {
  const ctx = await getTenantContext();
  if (ctx.role !== "coordenador" && ctx.role !== "terapeuta") notFound();

  const pacientes = await listarPacientesParaRelatorio(ctx);

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <h1 className="font-display text-ink-anchor text-3xl font-bold">
          Relatórios
        </h1>
        <p className="text-ink text-lg">
          Dossiê para convênio: dados factuais de presença e evidências
          aprovadas no período — sem narrativa gerada por IA.
        </p>
      </Stack>

      <RelatoriosExport pacientes={pacientes} />

      <FamiliaReport
        pacientes={pacientes}
        podeCurar={ctx.role === "coordenador"}
      />
    </Stack>
  );
}
