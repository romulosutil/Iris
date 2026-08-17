import Link from "next/link";
import { getTenantContext } from "@/auth/tenant";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { listarTodosPacientes } from "./queries";
import { ListaPacientes } from "./lista-pacientes";

export default async function PacientesPage() {
  const ctx = await getTenantContext();
  const pacientes = await listarTodosPacientes(ctx);

  const podeCadastrar =
    ctx.role === "coordenador" || ctx.role === "admin_recepcao";

  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        title="Pacientes"
        description="Pacientes cadastrados na clínica."
        actions={
          podeCadastrar ? (
            <Button variante="primaria" asChild>
              <Link href="/pacientes/novo">+ Novo Paciente</Link>
            </Button>
          ) : undefined
        }
      />
      <ListaPacientes pacientes={pacientes} />
    </main>
  );
}
