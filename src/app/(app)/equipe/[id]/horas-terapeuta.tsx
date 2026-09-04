import Link from "next/link";
import type { HorasTerapeuta } from "@/lib/agenda/horas-queries";

/**
 * Bloco de carga horária do terapeuta: capacidade vs. alocado vs. vago (por
 * semana) + os pacientes fixos. Componente de apresentação puro (sem client),
 * alimentado por `carregarHorasTerapeuta` na page — mantém a page fina e o
 * bloco testável de forma isolada (mesmo padrão do editor de disponibilidade).
 *
 * As três cifras vão num único `<dl>` (dt/dd) em vez de três `Stat` idênticos
 * lado a lado — o próprio `Stat` desaconselha a grade de cards iguais. `vago`
 * pode ser negativo (overbooking): renderizamos honestamente, sem clampar.
 */
function formatarHoras(n: number): string {
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}h`;
}

const cifras = [
  { rotulo: "Capacidade", chave: "capacidade" },
  { rotulo: "Alocado", chave: "alocado" },
  { rotulo: "Vago", chave: "vago" },
] as const;

export function HorasTerapeutaBloco({ horas }: { horas: HorasTerapeuta }) {
  return (
    <section
      aria-labelledby="horas-terapeuta-titulo"
      className="flex flex-col gap-4"
    >
      <h2
        id="horas-terapeuta-titulo"
        className="font-display text-xl font-bold text-[var(--text-primary)]"
      >
        Carga horária semanal
      </h2>

      <dl className="flex flex-wrap gap-x-8 gap-y-4 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4">
        {cifras.map(({ rotulo, chave }) => (
          <div key={chave}>
            <dt className="font-display text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase">
              {rotulo}
            </dt>
            <dd className="font-display mt-1 text-2xl font-semibold text-[var(--text-primary)]">
              {formatarHoras(horas[chave])}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2">
        <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
          Pacientes fixos
        </h3>
        {horas.pacientes.length === 0 ? (
          <p className="font-body text-sm text-[var(--text-secondary)]">
            Nenhum paciente fixo
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {horas.pacientes.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/pacientes/${p.id}/horas`}
                  className="font-body text-[var(--text-primary)] underline underline-offset-2"
                >
                  {p.nome}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
