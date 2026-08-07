import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/status-badge";
import type { PacienteListItem } from "./queries";

export function ListaPacientes({
  pacientes,
}: {
  pacientes: PacienteListItem[];
}) {
  if (pacientes.length === 0) {
    return <Alert severidade="info">Nenhum paciente cadastrado ainda.</Alert>;
  }
  return (
    <ul className="flex flex-col gap-2.5">
      {pacientes.map((p) => (
        <li key={p.id}>
          <div className="flex items-center justify-between rounded-[var(--radius-control)] border-2 border-l-4 border-[var(--border-brutal)] border-l-[var(--action-primary)] bg-[var(--surface-card)] p-3.5 shadow-[var(--ds-shadow)] transition-transform duration-100 hover:translate-x-1">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex min-w-0 flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-display text-base font-bold text-[var(--text-primary)]">
                    {p.nome}
                  </span>
                  {/* #174 — o selo dizia "Ativo" para todo mundo, inclusive
                      para quem já tinha saído da contagem de pacientes ativos
                      da fatura (manualmente ou pela régua de 90 dias). Era a
                      única tela onde esse estado poderia aparecer, e mentia.
                      Arquivado NÃO some da lista: continua legível e
                      exportável, só sinalizado. */}
                  <StatusBadge variante={p.arquivadoEm ? "neutral" : "success"}>
                    {p.arquivadoEm ? "Arquivado" : "Ativo"}
                  </StatusBadge>
                  {/* Handoff 1 (#203): sem prescrição vigente o paciente não
                      pode receber equipe. O selo existe para que esse estado
                      incompleto não fique invisível para quem cadastrou e saiu
                      da tela — o texto carrega o estado, a cor só reforça. */}
                  {p.temPrescricao ? null : (
                    <span className="rounded-[var(--radius-pill)] border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2 py-0.5 font-mono text-[10px] font-semibold text-[var(--status-warning-fg)] uppercase">
                      Sem prescrição
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--text-secondary)]">
                  {p.convenio ? <span>Convênio: {p.convenio}</span> : null}
                  {p.responsavelContato ? (
                    <span>Contato: {p.responsavelContato}</span>
                  ) : null}
                  {p.nascimento ? (
                    <span>
                      Nasc:{" "}
                      {new Date(p.nascimento + "T00:00:00").toLocaleDateString(
                        "pt-BR",
                      )}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <Button variante="terciaria" tamanho="sm" asChild>
              <Link href={`/pacientes/${p.id}`}>Ver Prontuário &rarr;</Link>
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
