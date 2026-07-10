import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 p-8">
      <h1>
        <Logo altura={56} animado aria-label="Iris" />
      </h1>
      <p className="text-ink max-w-[65ch] text-lg">
        Chegue na avaliação com o dossiê pronto. Evidências clínicas
        rastreáveis, decisão humana. O design system vive no Storybook.
      </p>
      <div>
        <Button>Começar</Button>
      </div>
    </main>
  );
}
