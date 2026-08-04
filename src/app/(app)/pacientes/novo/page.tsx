import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumb } from "@/components/ui/breadcrumb";
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
      <PageHeader
        breadcrumb={
          <Breadcrumb
            itens={[
              { rotulo: "Pacientes", href: "/pacientes" },
              { rotulo: "Novo paciente", atual: true },
            ]}
          />
        }
        title="Novo paciente"
        description="Cadastro administrativo de paciente"
      />
      <NovoPacienteForm />
    </div>
  );
}
