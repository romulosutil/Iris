import { notFound } from "next/navigation";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { withTenant } from "@/db/rls";
import { goal, milestone, patient, patientProtocol } from "@/db/schema";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { NovaMetaForm, type MilestoneOpcao } from "./nova-meta-form";
import {
  manterMetaAtivaAction,
  marcarDominadaAction,
  transicionarEstadoMetaAction,
} from "./actions";
import type { CriterioDominio } from "./schemas";

const ESTADO_ROTULO: Record<string, string> = {
  rascunho: "Rascunho",
  ativa: "Ativa",
  dominada: "Dominada",
  pausada: "Pausada",
  descontinuada: "Descontinuada",
};

function criterioTexto(criterio: unknown): string {
  const c = criterio as Partial<CriterioDominio>;
  if (c && c.tipo === "n_acertos_m_sessoes" && c.n != null && c.m != null) {
    return `${c.n} acerto(s) independente(s) em ${c.m} sessão(ões) consecutiva(s)`;
  }
  return "Critério não definido";
}

export default async function MetasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getTenantContext();
  try {
    // Recepção não vê dado clínico (RLS já barra a leitura; aqui evitamos
    // renderizar a casca da tela p/ um papel que nunca deveria chegar nela).
    requireRole(ctx, "coordenador", "terapeuta");
  } catch {
    notFound();
  }
  const isCoordenador = ctx.role === "coordenador";

  const { pacienteRow, metas, marcos } = await withTenant(ctx, async (tx) => {
    const pacienteRow = await tx
      .select({ nome: patient.nome })
      .from(patient)
      .where(eq(patient.id, id));

    const metas = await tx
      .select()
      .from(goal)
      .where(eq(goal.patientId, id))
      .orderBy(asc(goal.estado), asc(goal.criadoEm));

    // Marcos disponíveis p/ mapeamento opcional: dos protocolos ATIVOS do
    // paciente (vigência aberta). Se não houver, o formulário omite a seção.
    const ativos = await tx
      .select({ protocolId: patientProtocol.protocolId })
      .from(patientProtocol)
      .where(
        and(eq(patientProtocol.patientId, id), isNull(patientProtocol.desativadoEm)),
      );
    const protocolIds = ativos.map((a) => a.protocolId);
    const marcos = protocolIds.length
      ? await tx
          .select({ id: milestone.id, nome: milestone.nome, nivel: milestone.nivel })
          .from(milestone)
          .where(inArray(milestone.protocolId, protocolIds))
          .orderBy(asc(milestone.nome))
      : [];
    return { pacienteRow, metas, marcos };
  });
  if (!pacienteRow[0]) notFound();

  const hoje = new Date().toISOString().slice(0, 10);
  const revisaoVencida = metas.filter(
    (m) => m.estado === "ativa" && m.proximaRevisaoEm != null && m.proximaRevisaoEm <= hoje,
  );

  const opcoesMarco: MilestoneOpcao[] = marcos.map((m) => ({
    id: m.id,
    rotulo: m.nivel ? `${m.nome} · ${m.nivel}` : m.nome,
  }));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumb={
          <Breadcrumb
            itens={[
              { rotulo: "Pacientes", href: "/pacientes" },
              { rotulo: pacienteRow[0].nome, href: `/pacientes/${id}` },
              { rotulo: "Metas", atual: true },
            ]}
          />
        }
        title={`Metas · ${pacienteRow[0].nome}`}
        description="Metas individualizadas (PEI) e seu critério de domínio."
      />

      {revisaoVencida.length > 0 ? (
        <Alert severidade="info" titulo="Revisão de ciclo pendente">
          {revisaoVencida.length} meta(s) com revisão vencida — decida dominar,
          manter ou ajustar.
        </Alert>
      ) : null}

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-[var(--text-primary)] text-xl font-semibold">
          Metas do paciente
        </h2>
        {metas.length === 0 ? (
          <p className="text-[var(--text-primary)] text-sm">Nenhuma meta criada ainda.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {metas.map((m) => {
              const vencida =
                m.estado === "ativa" &&
                m.proximaRevisaoEm != null &&
                m.proximaRevisaoEm <= hoje;
              return (
                <li
                  key={m.id}
                  className="border-[var(--border-brutal)] bg-[var(--surface-card)] flex flex-col gap-2 border-2 p-5 shadow-[var(--ds-shadow)] rounded-[var(--radius-control)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-display text-[var(--text-primary)] text-lg font-semibold">
                      {m.descricao}
                    </h3>
                    <span className="border-[var(--border-brutal)] bg-[var(--surface-elevated)] text-[var(--text-primary)] shrink-0 border px-2 py-0.5 text-xs font-semibold tracking-wide uppercase rounded-[var(--radius-xs)]">
                      {ESTADO_ROTULO[m.estado] ?? m.estado}
                    </span>
                  </div>
                  <p className="text-[var(--text-primary)] text-sm">
                    {m.disciplina ? `${m.disciplina} · ` : ""}
                    {criterioTexto(m.criterioDominio)}
                  </p>
                  <p className="text-[var(--text-primary)] text-sm">
                    Ciclo de revisão: {m.cicloRevisaoSemanas} semanas
                    {m.proximaRevisaoEm ? ` · próxima: ${m.proximaRevisaoEm}` : ""}
                    {vencida ? " (vencida)" : ""}
                  </p>

                  {m.estado === "ativa" || m.estado === "pausada" ? (
                    <div className="mt-2 flex flex-wrap gap-3">
                      {m.estado === "ativa" ? (
                        <>
                          {isCoordenador ? (
                            <form action={marcarDominadaAction.bind(null, id)}>
                              <input type="hidden" name="goalId" value={m.id} />
                              <Button type="submit" risco="alto">
                                Marcar dominada
                              </Button>
                            </form>
                          ) : null}
                          <form action={manterMetaAtivaAction.bind(null, id)}>
                            <input type="hidden" name="goalId" value={m.id} />
                            <Button type="submit" variante="neutra">
                              Manter (adiar revisão)
                            </Button>
                          </form>
                          <form action={transicionarEstadoMetaAction.bind(null, id)}>
                            <input type="hidden" name="goalId" value={m.id} />
                            <input type="hidden" name="estado" value="pausada" />
                            <Button type="submit" variante="neutra">
                              Pausar
                            </Button>
                          </form>
                        </>
                      ) : (
                        <form action={transicionarEstadoMetaAction.bind(null, id)}>
                          <input type="hidden" name="goalId" value={m.id} />
                          <input type="hidden" name="estado" value="ativa" />
                          <Button type="submit" variante="neutra">
                            Reativar
                          </Button>
                        </form>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-[var(--text-primary)] text-xl font-semibold">
          Nova meta
        </h2>
        <NovaMetaForm patientId={id} milestones={opcoesMarco} />
      </section>
    </div>
  );
}
