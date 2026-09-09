import { getTenantContext } from "@/auth/tenant";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/primitives/pill";
import { MIN_SESSOES_RECORRENTE } from "@/lib/extraction/historico-relevante";
import { obterNotasDeSessao, obterTemasRecorrentes } from "./queries";

function formatarData(d: Date): string {
  return new Date(d).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

interface TemasPageProps {
  params: Promise<{ id: string }>;
}

export default async function TemasPage({ params }: TemasPageProps) {
  const { id: patientId } = await params;
  const ctx = await getTenantContext();

  const [notas, temas] = await Promise.all([
    obterNotasDeSessao(ctx, patientId),
    obterTemasRecorrentes(ctx, patientId),
  ]);

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
          protocolo. Primeiro os temas aprovados na revisão; depois a nota
          consolidada de cada sessão, em ordem cronológica reversa.
        </p>
      </div>

      {/* #645 — temas de verdade (`session_tema`), não mais o paliativo da nota
          consolidada. Só o que passou pela aprovação do terapeuta aparece. */}
      <section className="flex flex-col gap-3">
        <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
          Temas
        </h3>
        {temas.length === 0 ? (
          <EmptyState
            title="Nenhum tema registrado ainda"
            description="Os temas saem da extração da sessão e viram registro quando o terapeuta aprova a revisão."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {temas.map((t) => (
              <li
                key={t.temaChave}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] px-4 py-3 shadow-[var(--ds-shadow)]"
              >
                <span className="flex items-center gap-2">
                  <span className="font-display text-sm font-bold text-[var(--text-primary)]">
                    {t.tema}
                  </span>
                  {t.ocorrencias >= MIN_SESSOES_RECORRENTE ? (
                    <Pill variant="solid" colorScheme="menta" size="sm">
                      Recorrente
                    </Pill>
                  ) : null}
                </span>
                <span className="font-body text-xs text-[var(--text-secondary)]">
                  {t.ocorrencias} {t.ocorrencias === 1 ? "sessão" : "sessões"}
                  {t.ultimaEm ? ` · última em ${formatarData(t.ultimaEm)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
        Notas de sessão
      </h3>
      {notas.length === 0 ? (
        <EmptyState
          title="Nenhuma nota de sessão registrada"
          description="Quando o terapeuta consolidar uma sessão no diário, o texto aparece aqui."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {notas.map((nota) => {
            const dataFmt = formatarData(nota.agendadaPara);

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
                  <p className="font-body text-sm text-[var(--text-muted)] italic">
                    Nota restrita à equipe de {nota.disciplina ?? "Psicologia"}{" "}
                    (sigilo profissional). Data e presença confirmadas.
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
