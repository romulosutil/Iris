import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { withTenant } from "@/db/rls";
import { patient } from "@/db/schema";
import {
  carregarHorasPaciente,
  type HorasDisciplina,
} from "@/app/(app)/agenda/horas-queries";
import { Stack } from "@/components/ui/layout";
import { Alert } from "@/components/ui/alert";

interface Props {
  params: Promise<{ id: string }>;
}

/** Formata horas semanais em pt-BR (ex.: 12, 8, 1,5); trata alvo ausente. */
function fmtHoras(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/**
 * Tabela pura de carga horária por disciplina (alvo × agendado × realizado).
 * Extraída como componente para o teste a11y renderizar sem tocar no banco.
 * `alerta` marca uma disciplina abaixo do prescrito AGORA (snapshot da semana
 * corrente — a query não reconstrói o histórico semana-a-semana), então a copy
 * evita afirmar uma duração que o dado não sustenta.
 */
export function TabelaHoras({ linhas }: { linhas: HorasDisciplina[] }) {
  const abaixo = linhas.filter((l) => l.alerta);
  return (
    <Stack gap="md">
      {abaixo.length > 0 ? (
        <Alert severidade="info" titulo="Abaixo do prescrito">
          {abaixo.length === 1
            ? `A disciplina ${abaixo[0]!.disciplina} está com menos horas agendadas do que o alvo prescrito.`
            : `${abaixo.length} disciplinas estão com menos horas agendadas do que o alvo prescrito.`}
        </Alert>
      ) : null}
      <div className="overflow-x-auto">
        <table className="border-[var(--border-brutal)] w-full border-collapse border-2 text-sm">
          <thead>
            <tr className="border-[var(--border-brutal)] border-b-2">
              <th
                scope="col"
                className="font-display text-[var(--text-primary)] px-4 py-2 text-left font-black"
              >
                Disciplina
              </th>
              <th
                scope="col"
                className="font-display text-[var(--text-primary)] px-4 py-2 text-right font-black"
              >
                Alvo
              </th>
              <th
                scope="col"
                className="font-display text-[var(--text-primary)] px-4 py-2 text-right font-black"
              >
                Agendado
              </th>
              <th
                scope="col"
                className="font-display text-[var(--text-primary)] px-4 py-2 text-right font-black"
              >
                Realizado
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 ? (
              <tr>
                <td className="text-muted px-4 py-3" colSpan={4}>
                  Nenhuma disciplina com alvo, agendamento ou sessão realizada.
                </td>
              </tr>
            ) : (
              linhas.map((l) => (
                <tr
                  key={l.disciplina}
                  className="border-[var(--border-brutal)]/20 border-b last:border-b-0"
                >
                  <th
                    scope="row"
                    className="text-[var(--text-primary)] px-4 py-2 text-left font-semibold"
                  >
                    {l.disciplina}
                    {l.alerta ? (
                      <span className="text-status-info-text ml-2 text-xs font-bold">
                        (abaixo do prescrito)
                      </span>
                    ) : null}
                  </th>
                  <td className="text-ink px-4 py-2 text-right tabular-nums">
                    {fmtHoras(l.alvo)}
                  </td>
                  <td className="text-ink px-4 py-2 text-right tabular-nums">
                    {fmtHoras(l.agendado)}
                  </td>
                  <td className="text-ink px-4 py-2 text-right tabular-nums">
                    {fmtHoras(l.realizado)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Stack>
  );
}

export default async function HorasPage({ params }: Props) {
  const { id } = await params;
  const ctx = await getTenantContext();
  requireRole(ctx, "terapeuta", "coordenador");

  const pac = await withTenant(ctx, async (tx) => {
    const [p] = await tx
      .select({ id: patient.id, nome: patient.nome })
      .from(patient)
      .where(and(eq(patient.id, id), eq(patient.clinicId, ctx.clinicId)))
      .limit(1);
    return p ?? null;
  });
  if (!pac) notFound();

  const linhas = await carregarHorasPaciente(ctx, id);

  return (
    <main className="flex flex-col gap-6">
      <h1 className="font-display text-ink-anchor text-2xl font-black">
        Horas — {pac.nome}
      </h1>
      <TabelaHoras linhas={linhas} />
    </main>
  );
}
