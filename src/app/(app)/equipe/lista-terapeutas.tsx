import Link from "next/link";

type Terapeuta = { id: string; name: string; email: string };

export function ListaTerapeutas({ terapeutas }: { terapeutas: Terapeuta[] }) {
  if (terapeutas.length === 0) {
    return <p className="font-body text-ink">Nenhum terapeuta cadastrado ainda.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {terapeutas.map((t) => (
        <li key={t.id}>
          <Link
            href={`/equipe/${t.id}`}
            className="font-display text-ink hover:text-ink-anchor border-ink-anchor flex min-h-11 items-center border-2 bg-surface px-4 py-2 font-bold underline-offset-4 hover:underline focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]"
          >
            {t.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
