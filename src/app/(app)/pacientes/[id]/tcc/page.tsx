import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getTenantContext } from "@/auth/tenant";
import { withTenant } from "@/db/rls";
import { patient } from "@/db/schema";
import { obterRPDEntries } from "./logic";
import { obterRPDSugestoes } from "./sugestoes";
import {
  obterInstrumentoAplicacoes,
  obterInstrumentoItensTexto,
} from "./instrumento-logic";
import { RpdForm } from "./rpd-form";
import { RpdSugestoes } from "./rpd-sugestoes";
import { InstrumentoLista } from "./instrumento-lista";
import { InstrumentoForm } from "./instrumento-form";
import { rotuloDistorcao } from "./constants";
import { Pill } from "@/components/ui/primitives/pill";

interface TccPageProps {
  params: Promise<{ id: string }>;
}

export default async function TccPage({ params }: TccPageProps) {
  const { id: patientId } = await params;
  const ctx = await getTenantContext();

  // #387 — guard ausente até aqui: a rota respondia por URL direta a paciente
  // `protocol_driven`/`conventional` sem checar nada. Mesma query de
  // `../layout.tsx` (pós-#388) — RLS decide o que este tenant enxerga; ausência
  // de linha (id inexistente ou outra clínica) e modalidade errada levam ao
  // mesmo 404, de propósito: não vazar "existe, mas é de outra modalidade".
  const dadosPaciente = await withTenant(ctx, async (tx) => {
    const [p] = await tx
      .select({ clinicalModality: patient.clinicalModality })
      .from(patient)
      .where(eq(patient.id, patientId));
    return p;
  });
  if (dadosPaciente?.clinicalModality !== "cognitive_behavioral") {
    notFound();
  }

  const entries = await obterRPDEntries(ctx, patientId);
  const sugestoes = await obterRPDSugestoes(ctx, patientId);
  const instrumentoAplicacoes = await obterInstrumentoAplicacoes(
    ctx,
    patientId,
  );
  const [itensPhq9, itensGad7] = await Promise.all([
    obterInstrumentoItensTexto(ctx, "phq9"),
    obterInstrumentoItensTexto(ctx, "gad7"),
  ]);

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
        <p className="font-body text-sm text-[var(--text-secondary)]">
          Instrumentos estruturados e Registro de Pensamentos Distorcidos (RPD).
        </p>
      </div>

      {/* O gráfico de crenças morava aqui, encostado no formulário de RPD:
          leitura misturada com registro. Ele foi para a aba Evolução, que
          passou a ser a leitura de evolução DESTE paciente em vez do hexágono
          de eixos VB-MAPP que ele nunca teve. Esta aba fica sendo só o
          registro — e o ponteiro existe para quem já sabia onde o gráfico
          estava não achar que ele sumiu. */}
      <p className="font-body text-sm text-[var(--text-secondary)]">
        O acompanhamento gráfico da reestruturação de crenças e dos escores de
        PHQ-9 e GAD-7 fica na aba{" "}
        <Link
          href={`/pacientes/${patientId}`}
          className="font-semibold text-[var(--text-primary)] underline underline-offset-4"
        >
          Evolução
        </Link>
        . Esta aba é o registro.
      </p>

      {/* #392 — fila de sugestões de RPD do agente, acima do formulário
          manual (aprovar/editar/descartar antes de registrar um novo). */}
      <div className="flex flex-col gap-3">
        <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
          🤖 Sugestões de RPD do Agente
        </h3>
        <RpdSugestoes patientId={patientId} sugestoes={sugestoes} />
      </div>

      {/* #393 — instrumentos padronizados: forms manuais (T4) + histórico
          texto (T6). Cada form só renderiza itens se `instrumento_item_texto`
          já tiver conteúdo carregado para aquele tipo (T3, gate de fonte
          primária) — enquanto vazio (default), mostra estado vazio próprio. */}
      <div className="flex flex-col gap-3">
        <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
          Instrumentos Padronizados (PHQ-9 / GAD-7)
        </h3>
        <InstrumentoLista aplicacoes={instrumentoAplicacoes} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <InstrumentoForm
            patientId={patientId}
            tipoInstrumento="phq9"
            itensTexto={itensPhq9}
          />
          <InstrumentoForm
            patientId={patientId}
            tipoInstrumento="gad7"
            itensTexto={itensGad7}
          />
        </div>
      </div>

      {/* Formulário de Novo RPD */}
      <RpdForm patientId={patientId} />

      {/* Histórico de Registros de Pensamentos */}
      <div className="flex flex-col gap-4 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-5 shadow-[var(--ds-shadow)]">
        <div className="flex items-center justify-between border-b-2 border-[var(--border-brutal)] pb-3">
          <h3 className="font-display flex items-center gap-2 text-lg font-bold text-[var(--text-primary)]">
            <span>📚</span> Histórico de RPD ({entries.length})
          </h3>
        </div>

        {entries.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--text-secondary)]">
            Nenhum RPD registrado até o momento.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {entries.map((item, idx) => {
              const dataFmt = new Date(item.criadoEm).toLocaleDateString(
                "pt-BR",
                {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                },
              );

              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-elevated)] p-4 shadow-[var(--ds-shadow-sm)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-brutal)]/20 pb-2">
                    <span className="font-display text-sm font-bold text-[var(--text-primary)]">
                      Registro #{entries.length - idx} · {dataFmt}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {(item.distorcoesCognitivas as string[] | null)?.map(
                        (slug) => (
                          <Pill
                            key={slug}
                            variant="inset"
                            colorScheme="ouro"
                            size="sm"
                          >
                            {rotuloDistorcao(slug)}
                          </Pill>
                        ),
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
                    <div>
                      <strong className="block text-[var(--text-primary)]">
                        1. Situação / Gatilho:
                      </strong>
                      <span className="text-[var(--text-secondary)]">
                        {item.situacao}
                      </span>
                    </div>

                    <div>
                      <strong className="block text-[var(--text-primary)]">
                        2. Pensamento Automático:
                      </strong>
                      <span className="font-medium text-black italic">
                        &quot;{item.pensamentoAutomatico}&quot;
                      </span>
                    </div>

                    <div>
                      <strong className="block text-[var(--text-primary)]">
                        3. Emoção & Intensidade Inicial:
                      </strong>
                      <span className="text-[var(--text-secondary)]">
                        {item.emocao} (<strong>{item.intensidade}%</strong>)
                      </span>
                    </div>

                    <div>
                      <strong className="block text-[var(--text-primary)]">
                        4. Reavaliação Pós-Resposta:
                      </strong>
                      <span className="text-[var(--text-secondary)]">
                        {item.intensidadePos !== null ? (
                          <>
                            <strong className="text-black">
                              {item.intensidadePos}%
                            </strong>{" "}
                            (Redução de {item.intensidade - item.intensidadePos}
                            %)
                          </>
                        ) : (
                          "Não informada"
                        )}
                      </span>
                    </div>

                    <div className="md:col-span-2">
                      <strong className="block text-[var(--text-primary)]">
                        Pensamento Alternativo:
                      </strong>
                      <span className="text-[var(--text-secondary)]">
                        {item.respostaRacional ?? "Não informado"}
                      </span>
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
