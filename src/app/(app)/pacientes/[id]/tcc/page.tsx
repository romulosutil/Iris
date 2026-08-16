import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { formatarDataHoraRpd, obterRPDEntries } from "./logic";
import { RpdForm } from "./rpd-form";
import { GraficoEvolucaoCrencas } from "./grafico-evolucao-crencas";
import { Pill } from "@/components/ui/primitives/pill";

interface TccPageProps {
  params: Promise<{ id: string }>;
}

export default async function TccPage({ params }: TccPageProps) {
  const { id: patientId } = await params;
  const ctx = await getTenantContext();
  try {
    // admin_recepcao não vê dado clínico (RLS já barra a leitura; aqui
    // evitamos renderizar a casca da tela p/ um papel que nunca deveria
    // chegar nela — mesmo padrão de metas/page.tsx e pei/page.tsx).
    requireRole(ctx, "coordenador", "terapeuta");
  } catch {
    notFound();
  }

  const entries = await obterRPDEntries(ctx, patientId);

  return (
    <div className="flex flex-col gap-6">
      {/* Header do Nicho TCC */}
      <div className="flex flex-col gap-1 border-b-2 border-[var(--border-brutal)] pb-4">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl font-bold text-[var(--text-primary)]">
            Terapia Cognitivo-Comportamental (TCC)
          </h2>
          <Pill variant="solid" colorScheme="menta" size="sm">
            Nicho Clínico
          </Pill>
        </div>
        <p className="text-sm text-[var(--text-secondary)] font-body">
          Instrumentos estruturados, Registro de Pensamentos Distorcidos (RPD) e acompanhamento gráfico de reestruturação cognitiva.
        </p>
      </div>

      {/* Gráfico de Evolução de Crenças */}
      <GraficoEvolucaoCrencas entries={entries} />

      {/* Formulário de Novo RPD */}
      <RpdForm patientId={patientId} />

      {/* Histórico de Registros de Pensamentos */}
      <div className="flex flex-col gap-4 border-2 border-[var(--border-brutal)] rounded-[var(--radius-control)] bg-[var(--surface-card)] p-5 shadow-[var(--ds-shadow)]">
        <div className="flex items-center justify-between border-b-2 border-[var(--border-brutal)] pb-3">
          <h3 className="font-display text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
            <span>📚</span> Histórico de RPD ({entries.length})
          </h3>
        </div>

        {entries.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)] py-4 text-center">
            Nenhum RPD registrado até o momento.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {entries.map((item, idx) => {
              const dataFmt = formatarDataHoraRpd(item.criadoEm);

              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-elevated)] p-4 shadow-[var(--ds-shadow-sm)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-brutal)]/20 pb-2">
                    <span className="font-display text-sm font-bold text-[var(--text-primary)]">
                      Registro #{entries.length - idx} · {dataFmt}
                    </span>
                    <Pill variant="inset" colorScheme="ouro" size="sm">
                      {item.distorcaoCognitiva}
                    </Pill>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 text-xs">
                    <div>
                      <strong className="text-[var(--text-primary)] block">1. Situação / Gatilho:</strong>
                      <span className="text-[var(--text-secondary)]">{item.situacao}</span>
                    </div>

                    <div>
                      <strong className="text-[var(--text-primary)] block">2. Pensamento Automático:</strong>
                      <span className="italic text-[var(--text-primary)] font-medium">&quot;{item.pensamentoAutomatico}&quot;</span>
                    </div>

                    <div>
                      <strong className="text-[var(--text-primary)] block">
                        3. Emoção & Intensidade Inicial:
                      </strong>
                      <span className="text-[var(--text-secondary)]">
                        {item.emocao} (<strong>{item.intensidade}%</strong>)
                      </span>
                    </div>

                    <div>
                      <strong className="text-[var(--text-primary)] block">
                        4. Reavaliação Pós-Resposta:
                      </strong>
                      <span className="text-[var(--text-secondary)]">
                        {item.intensidadePos !== null ? (
                          <>
                            <strong className="text-[var(--text-primary)]">{item.intensidadePos}%</strong> (Redução de{" "}
                            {item.intensidade - item.intensidadePos}%)
                          </>
                        ) : (
                          "Não informada"
                        )}
                      </span>
                    </div>

                    <div className="md:col-span-2">
                      <strong className="text-[var(--text-primary)] block">5. Resposta Racional:</strong>
                      <span className="text-[var(--text-secondary)]">{item.respostaRacional}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
