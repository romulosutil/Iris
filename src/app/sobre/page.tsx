import type { CSSProperties } from "react";
import { Logo } from "@/components/ui/logo";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Stack, Split } from "@/components/ui/layout";
import { surface } from "@/components/ui/primitives/surface";
import { cn } from "@/lib/cn";

/** Marca hexagonal do logo reaproveitada como recorte — o hexágono é o motivo. */
const hexClip: CSSProperties = {
  clipPath: "polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0% 50%)",
};

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
    cor: "bg-[var(--status-ia-bg)] text-[var(--status-ia-fg)]",
    titulo: "A IA sugere",
    texto:
      "Extrai evidências candidatas do diário em linguagem natural. Nunca pontua, nunca decide.",
  },
  {
    n: "2",
    cor: "bg-[var(--action-primary)] text-[var(--action-primary-fg)]",
    titulo: "Você aprova",
    texto:
      "O terapeuta revisa cada candidata e aprova, edita ou rejeita. Só então vira registro.",
    destaque: true,
  },
  {
    n: "3",
    cor: "bg-[var(--status-info-bg)] text-[var(--status-info-fg)]",
    titulo: "O coordenador valida",
    texto:
      "Valida por exceção e pode reclassificar — versionado, com justificativa. Nada se sobrescreve.",
  },
];

export default function Home() {
  return (
    <Stack
      como="main"
      gap="lg"
      className="mx-auto min-h-dvh max-w-5xl bg-[var(--bg-app)] px-6 py-12 md:py-20"
    >
      {/* Régua-espectro: assinatura de marca (neurodiversidade). */}
      <div
        aria-hidden
        className="h-1.5 w-full"
        style={{
          background:
            "linear-gradient(90deg, var(--color-spectrum-red), var(--color-spectrum-orange), var(--color-spectrum-yellow), var(--color-spectrum-green), var(--color-spectrum-blue), var(--color-spectrum-violet))",
        }}
      />

      <Stack como="header" gap="md">
        <Logo altura={44} animado aria-label="Iris" />
        <Breadcrumb
          itens={[
            { rotulo: "Início", href: "/" },
            { rotulo: "Sobre o Iris", atual: true },
          ]}
        />
        <Stack gap="md">
          <h1 className="font-display max-w-[16ch] text-4xl font-bold text-balance text-[var(--text-primary)] md:text-6xl">
            Chegue na avaliação com o dossiê pronto.
          </h1>
          <p className="max-w-[60ch] text-lg text-[var(--text-secondary)] md:text-xl">
            O Iris transforma o diário de sessão em evidência clínica rastreável
            até a frase de origem. A IA sugere; quem decide é você.
          </p>
        </Stack>
      </Stack>

      {/* Prova visual do conceito: as 3 camadas, na cor dos 3 anéis do logo. */}
      <Stack como="section" gap="md" aria-labelledby="governanca">
        <h2
          id="governanca"
          className="font-display font-mono text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase"
        >
          Governança em três camadas
        </h2>
        <ol className="grid gap-5 md:grid-cols-3 md:items-start">
          {camadas.map((c) => (
            <Stack
              como="li"
              key={c.n}
              gap="sm"
              className={cn(
                "relative rounded-[var(--radius-control)] border-2 bg-[var(--surface-card)] p-5 shadow-[var(--ds-shadow)]",
                c.destaque
                  ? cn(
                      surface("solida"),
                      "border-[var(--border-brutal)] md:-mt-3 md:pt-8",
                    )
                  : "border-[var(--border-brutal)]",
              )}
            >
              {/* Passo humano em destaque: barra-topo ouro. */}
              {c.destaque ? (
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-2 rounded-t-[var(--radius-control)] bg-[var(--action-primary)]"
                />
              ) : null}
              <span
                aria-hidden
                style={hexClip}
                className={`${c.cor} font-display flex size-12 items-center justify-center border border-[var(--border-brutal)] text-xl font-bold`}
              >
                {c.n}
              </span>
              <h3 className="font-display text-lg font-semibold text-[var(--text-primary)]">
                {c.titulo}
              </h3>
              <p className="text-base text-[var(--text-primary)]">{c.texto}</p>
            </Stack>
          ))}
        </ol>
      </Stack>

      <Split
        como="footer"
        className="mt-auto text-sm text-[var(--text-secondary)]"
      >
        <span>Iris — evidência clínica que não mente.</span>
        <span className="font-display font-semibold">
          Design system: Storybook
        </span>
      </Split>
    </Stack>
  );
}
