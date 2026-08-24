import { getTenantContext } from "@/auth/tenant";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/primitives/pill";
import { obterNotasDeSessao } from "./queries";

interface TemasPageProps {
  params: Promise<{ id: string }>;
}

export default async function TemasPage({ params }: TemasPageProps) {
  const { id: patientId } = await params;
  const ctx = await getTenantContext();

  const notas = await obterNotasDeSessao(ctx, patientId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 border-b-2 border-[var(--border-brutal)] pb-4">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl font-bold text-[var(--text-primary)]">
            Temas
          </h2>
          <Pill variant="solid" colorScheme="menta" size="sm">
            Terapia Convencional
          </Pill>
        </div>
        <p className="font-body text-sm text-[var(--text-secondary)]">
          Registro narrativo das sessões desta modalidade — sem pontuação de
          protocolo. Abaixo, a nota consolidada de cada sessão, em ordem
          cronológica reversa.
        </p>
      </div>

      {notas.length === 0 ? (
        <EmptyState
          title="Nenhuma nota de sessão registrada"
          description="Quando o terapeuta consolidar uma sessão no diário, o texto aparece aqui."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {notas.map((nota) => {
            const dataFmt = new Date(nota.agendadaPara).toLocaleDateString(
              "pt-BR",
              {
                timeZone: "America/Sao_Paulo",
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              },
            );

            return (
              <div
                key={nota.sessionId}
                className="flex flex-col gap-3 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-5 shadow-[var(--ds-shadow)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-brutal)]/20 pb-2">
                  <span className="font-display text-sm font-bold text-[var(--text-primary)]">
                    {nota.numeroSequencial
                      ? `Sessão #${nota.numeroSequencial}`
                      : "Sessão"}{" "}
                    · {dataFmt}
                  </span>
                </div>
                {nota.texto ? (
                  <p className="font-body text-sm whitespace-pre-wrap text-[var(--text-secondary)]">
                    {nota.texto}
                  </p>
                ) : (
                  <p className="font-body text-sm italic text-[var(--text-muted)]">
                    Nota restrita à equipe de {nota.disciplina ?? "Psicologia"} (sigilo profissional). Data e presença confirmadas.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
