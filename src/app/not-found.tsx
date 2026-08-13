import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { surface } from "@/components/ui/primitives/surface";

/**
 * 404 on-brand (espectro-brutal).
 * Substitui o not-found padrão do Next por copy honesta em pt-BR e uma saída óbvia.
 * Renderiza no root layout com layout centralizado e Card elevado sob estética brutalista.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center gap-6 px-6 py-16">
      <Logo variante="completo" altura={36} className="mb-2" />

      <div
        className={surface("solida", {
          radius: "control",
          className: "flex flex-col gap-4 p-6 bg-[var(--surface-card)] text-[var(--text-primary)] w-full border-[#1A1A1A] border-2",
        })}
      >
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[var(--text-secondary)] text-xs font-semibold tracking-wide uppercase">
            Erro 404
          </p>
          <h1 className="font-display text-[var(--text-primary)] text-2xl font-bold text-balance md:text-3xl">
            Página não encontrada
          </h1>
          <p className="text-[var(--text-primary)] text-sm md:text-base leading-relaxed">
            O endereço mudou ou nunca existiu. Nada quebrou do seu lado — é só um
            link que não leva a lugar nenhum.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-2">
          <Button variante="primaria" asChild className="w-full sm:w-auto">
            <Link href="/agenda">
              Voltar para a agenda
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
