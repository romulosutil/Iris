import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import type { PacienteListItem } from "./queries";

export function ListaPacientes({ pacientes }: { pacientes: PacienteListItem[] }) {
  if (pacientes.length === 0) {
    return <Alert severidade="info">Nenhum paciente cadastrado ainda.</Alert>;
  }
  return (
    <ul className="flex flex-col gap-2.5">
      {pacientes.map((p) => (
        <li key={p.id}>
          <div className="flex items-center justify-between p-3.5 bg-[var(--surface-card)] border-2 border-[var(--border-brutal)] border-l-4 border-l-[var(--action-primary)] rounded-[var(--radius-control)] shadow-[var(--ds-shadow)] transition-transform duration-100 hover:translate-x-1">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-display font-bold text-base text-[var(--text-primary)]">
                    {p.nome}
                  </span>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-[var(--radius-pill)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border border-[var(--status-success-border)] font-semibold">
                    Ativo
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--text-secondary)]">
                  {p.convenio ? <span>Convênio: {p.convenio}</span> : null}
                  {p.responsavelContato ? <span>Contato: {p.responsavelContato}</span> : null}
                  {p.nascimento ? (
                    <span>
                      Nasc: {new Date(p.nascimento + "T00:00:00").toLocaleDateString("pt-BR")}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <Link href={`/pacientes/${p.id}`}>
              <Button variante="terciaria" tamanho="sm">
                Ver Prontuário &rarr;
              </Button>
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
