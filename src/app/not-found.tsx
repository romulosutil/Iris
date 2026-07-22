import Link from "next/link";
import { Logo } from "@/components/ui/logo";

/**
 * 404 on-brand (espectro-brutal). Substitui o not-found padrão do Next (tela
 * preta, em inglês) por copy honesta em pt-BR e uma saída óbvia. Renderiza no
 * root layout — sem o header do shell autenticado. O tom segue a personalidade
 * do produto: literal, sem culpa, calibrado para leitura sob pressão.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-start justify-center gap-8 px-6 py-16">
      <Logo variante="completo" altura={36} />
      <div className="flex flex-col gap-3">
        <p className="font-mono text-[var(--text-secondary)] text-xs font-semibold tracking-wide uppercase">
          Erro 404
        </p>
        <h1 className="font-display text-[var(--text-primary)] text-4xl font-bold text-balance md:text-5xl">
          Página não encontrada.
        </h1>
        <p className="text-[var(--text-primary)] max-w-[60ch] text-lg">
          O endereço mudou ou nunca existiu. Nada quebrou do seu lado — é só um
          link que não leva a lugar nenhum.
        </p>
      </div>
      <Link
        href="/agenda"
        className="font-display text-[var(--action-secondary-fg)] border-[var(--border-brutal)] bg-[var(--action-secondary-bg)] border-2 rounded-[var(--radius-control)] px-5 py-2.5 text-base font-semibold underline-offset-4 shadow-[var(--ds-shadow)] hover:underline"
      >
        Voltar para a agenda
      </Link>
    </main>
  );
}
