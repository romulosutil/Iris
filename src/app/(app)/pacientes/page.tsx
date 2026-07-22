import Link from "next/link";
import { getTenantContext } from "@/auth/tenant";
import { Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listarTodosPacientes } from "./queries";

export default async function PacientesPage() {
  const ctx = await getTenantContext();
  const pacientes = await listarTodosPacientes(ctx);

  const podeCadastrar = ctx.role === "coordenador" || ctx.role === "admin_recepcao";

  return (
    <Stack gap="lg">
      <PageHeader
        title="Pacientes"
        description={
          pacientes.length === 0
            ? "Nenhum paciente encontrado na clínica."
            : `${pacientes.length} ${pacientes.length === 1 ? "paciente cadastrado" : "pacientes cadastrados"}.`
        }
        actions={
          podeCadastrar ? (
            <Link href="/pacientes/novo">
              <Button variante="primaria">+ Novo Paciente</Button>
            </Link>
          ) : undefined
        }
      />

      {pacientes.length === 0 ? (
        <div className="p-8 border-2 border-dashed border-[var(--border-brutal)] rounded-[var(--radius-card)] bg-[var(--surface-card)] text-center space-y-3">
          <p className="font-display font-bold text-lg text-[var(--text-primary)]">
            Nenhum paciente cadastrado ainda.
          </p>
          {podeCadastrar ? (
            <Link href="/pacientes/novo" className="inline-block">
              <Button variante="secundaria">Cadastrar Primeiro Paciente</Button>
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pacientes.map((p) => (
            <Card key={p.id} titulo={p.nome}>
              <div className="space-y-3 text-sm text-[var(--text-secondary)]">
                {p.nascimento ? (
                  <p>
                    <strong className="text-[var(--text-primary)]">Nascimento:</strong>{" "}
                    {new Date(p.nascimento + "T00:00:00").toLocaleDateString("pt-BR")}
                  </p>
                ) : null}
                {p.responsavelContato ? (
                  <p>
                    <strong className="text-[var(--text-primary)]">Contato:</strong>{" "}
                    {p.responsavelContato}
                  </p>
                ) : null}
                {p.convenio ? (
                  <p>
                    <strong className="text-[var(--text-primary)]">Convênio:</strong>{" "}
                    {p.convenio}
                  </p>
                ) : null}

                <div className="pt-3 mt-2 border-t border-[var(--border-brutal)]/20 flex flex-wrap gap-2">
                  <Link href={`/pacientes/${p.id}`}>
                    <Button variante="primaria" tamanho="sm">
                      Prontuário
                    </Button>
                  </Link>
                  <Link href={`/pacientes/${p.id}/metas`}>
                    <Button variante="secundaria" tamanho="sm">
                      PEI & Metas
                    </Button>
                  </Link>
                  <Link href={`/pacientes/${p.id}/ausencias`}>
                    <Button variante="neutra" tamanho="sm">
                      Ausências
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Stack>
  );
}

