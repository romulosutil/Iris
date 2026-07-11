import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { NovoPacienteForm } from "./novo-paciente-form";

export default async function NovoPacientePage() {
  const ctx = await getTenantContext();
  try {
    requireRole(ctx, "admin_recepcao", "coordenador");
  } catch {
    notFound();
  }
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-ink-anchor text-3xl font-bold">
        Novo paciente — cadastro administrativo
      </h1>
      <NovoPacienteForm />
    </div>
  );
}
