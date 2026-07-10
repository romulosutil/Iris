import type { CSSProperties } from "react";
import { Logo } from "@/components/ui/logo";

/** Marca hexagonal do logo reaproveitada como recorte — o hexágono é o motivo. */
const hexClip: CSSProperties = {
  clipPath: "polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0% 50%)",
};

// As 3 camadas de governança = os 3 anéis do logo. Ordem carrega informação
// (é um fluxo real), então o número é conteúdo, não enfeite.
type Camada = {
  n: string;
  cor: string;
  titulo: string;
  texto: string;
  destaque?: boolean;
};

const camadas: Camada[] = [
  {
    n: "1",
    cor: "bg-gold",
    titulo: "A IA sugere",
    texto:
      "Extrai evidências candidatas do diário em linguagem natural. Nunca pontua, nunca decide.",
  },
  {
    n: "2",
    cor: "bg-mint",
    titulo: "Você aprova",
    texto:
      "O terapeuta revisa cada candidata e aprova, edita ou rejeita. Só então vira registro.",
    destaque: true,
  },
  {
    n: "3",
    cor: "bg-blue",
    titulo: "O coordenador valida",
    texto:
      "Valida por exceção e pode reclassificar — versionado, com justificativa. Nada se sobrescreve.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-16 px-6 py-12 md:py-20">
      {/* Régua-espectro: assinatura de marca (neurodiversidade). */}
      <div
        aria-hidden
        className="h-1.5 w-full"
        style={{
          background:
            "linear-gradient(90deg, var(--color-spectrum-red), var(--color-spectrum-orange), var(--color-spectrum-yellow), var(--color-spectrum-green), var(--color-spectrum-blue), var(--color-spectrum-violet))",
        }}
      />

      <header className="flex flex-col gap-8">
        <Logo altura={44} animado aria-label="Iris" />
        <div className="flex flex-col gap-6">
          <h1 className="font-display text-ink-anchor max-w-[16ch] text-4xl font-bold text-balance md:text-6xl">
            Chegue na avaliação com o dossiê pronto.
          </h1>
          <p className="text-ink max-w-[60ch] text-lg md:text-xl">
            O Iris transforma o diário de sessão em evidência clínica rastreável
            até a frase de origem. A IA sugere; quem decide é você.
          </p>
        </div>
      </header>

      {/* Prova visual do conceito: as 3 camadas, na cor dos 3 anéis do logo. */}
      <section aria-labelledby="governanca" className="flex flex-col gap-6">
        <h2
          id="governanca"
          className="font-display text-graphite text-sm font-semibold tracking-wide uppercase"
        >
          Governança em três camadas
        </h2>
        <ol className="grid gap-5 md:grid-cols-3 md:items-start">
          {camadas.map((c) => (
            <li
              key={c.n}
              className={`bg-surface relative flex flex-col gap-3 border-2 p-5 ${
                c.destaque
                  ? "border-ink-anchor shadow-[var(--ds-shadow)] md:-mt-3 md:pt-8"
                  : "border-graphite shadow-[2px_2px_0_0_var(--color-graphite)]"
              }`}
            >
              {/* Passo humano em destaque: barra-topo ouro (topo, nunca lateral). */}
              {c.destaque ? (
                <span
                  aria-hidden
                  className="bg-gold absolute inset-x-0 top-0 h-2"
                />
              ) : null}
              <span
                aria-hidden
                style={hexClip}
                className={`${c.cor} font-display text-ink-anchor flex size-12 items-center justify-center text-xl font-bold`}
              >
                {c.n}
              </span>
              <h3 className="font-display text-ink-anchor text-lg font-semibold">
                {c.titulo}
              </h3>
              <p className="text-ink text-base">{c.texto}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="text-graphite mt-auto flex flex-wrap items-center justify-between gap-4 text-sm">
        <span>Iris — evidência clínica que não mente.</span>
        <span className="font-display font-semibold">
          Design system: Storybook
        </span>
      </footer>
    </main>
  );
}
