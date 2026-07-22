import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { PageHeader } from "@/components/ui/page-header";
import { listarBloqueios } from "@/app/(app)/agenda/bloqueio-queries";
import { FeriadosForm } from "./feriados-form";

export default async function FeriadosPage() {
  const ctx = await getTenantContext();
  try {
    requireRole(ctx, "coordenador");
  } catch {
    notFound();
  }
  const bloqueios = await listarBloqueios(ctx, { escopo: "clinica" });
  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        title="Feriados da clínica"
        description="Datas que a clínica não atende. Valem para todos."
      />
      <FeriadosForm bloqueios={bloqueios} />
    </main>
  );
}
