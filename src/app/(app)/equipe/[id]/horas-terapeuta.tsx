import Link from "next/link";
import type { HorasTerapeuta } from "@/app/(app)/agenda/horas-queries";

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
        className="font-display text-[var(--text-primary)] text-xl font-bold"
      >
        Carga horária semanal
      </h2>

      <dl className="border-[var(--border-brutal)] bg-[var(--surface-card)] flex flex-wrap gap-x-8 gap-y-4 border-2 p-4 rounded-[var(--radius-control)]">
        {cifras.map(({ rotulo, chave }) => (
          <div key={chave}>
            <dt className="font-display text-[var(--text-secondary)] text-xs font-semibold tracking-wide uppercase">
              {rotulo}
            </dt>
            <dd className="font-display text-[var(--text-primary)] mt-1 text-2xl font-semibold">
              {formatarHoras(horas[chave])}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2">
        <h3 className="font-display text-[var(--text-primary)] text-base font-semibold">
          Pacientes fixos
        </h3>
        {horas.pacientes.length === 0 ? (
          <p className="font-body text-[var(--text-secondary)] text-sm">Nenhum paciente fixo</p>
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
