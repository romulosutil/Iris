import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
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
      <h1 className="font-display text-ink-anchor text-2xl font-black">Feriados da clínica</h1>
      <p className="font-body text-ink">Datas que a clínica não atende. Valem para todos.</p>
      <FeriadosForm bloqueios={bloqueios} />
    </main>
  );
}
