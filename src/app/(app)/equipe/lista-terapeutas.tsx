import Link from "next/link";
import { DataRow } from "@/components/ui/data-row";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

type Terapeuta = { id: string; name: string; email: string };

export function ListaTerapeutas({ terapeutas }: { terapeutas: Terapeuta[] }) {
  if (terapeutas.length === 0) {
    return <Alert severidade="info">Nenhum terapeuta cadastrado ainda.</Alert>;
  }
  return (
    <ul className="flex flex-col gap-2.5">
      {terapeutas.map((t) => (
        <li key={t.id}>
          <div className="flex items-center justify-between rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-3.5 shadow-[var(--ds-shadow)] transition-transform duration-100 hover:translate-x-1">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex min-w-0 flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-display text-base font-bold text-[var(--text-primary)]">
                    {t.name}
                  </span>
                  <span className="rounded-[var(--radius-pill)] border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--status-success-fg)] uppercase">
                    Ativo
                  </span>
                </div>
                <span className="text-xs text-[var(--text-secondary)]">
                  {t.email}
                </span>
              </div>
            </div>
            <Link href={`/equipe/${t.id}`}>
              <Button variante="terciaria" tamanho="sm">
                Ver Perfil &rarr;
              </Button>
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
