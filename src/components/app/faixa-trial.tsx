import { Banner } from "@/components/ui/banner";

interface FaixaTrialProps {
  diasRestantes: number;
}

/**
 * Faixa informativa de período de trial ativo.
 * Exibe enquanto diasRestantes >= 0, com mensagem diferenciada no último dia.
 *
 * Acessibilidade:
 * - role="status" (herdado do Banner) para notificar mudanças de estado do trial
 * - Texto sempre redundante à cor (nunca depende só de cor para convey urgência)
 * - Alvo mínimo 44px de altura (herdado do Container/layout)
 * - Semântica clara sem linguagem alarme (informação, não alerta)
 */
export function FaixaTrial({ diasRestantes }: FaixaTrialProps) {
  if (diasRestantes < 0) {
    return null;
  }

  const mensagem =
    diasRestantes === 0
      ? "Seu período de teste termina hoje."
      : diasRestantes === 1
        ? "Seu período de teste termina em 1 dia."
        : `Seu período de teste termina em ${diasRestantes} dias.`;

  return (
    <div className="bg-[var(--bg-app)] py-4">
      <div className="px-4 sm:px-6">
        <Banner variant="info">{mensagem}</Banner>
      </div>
    </div>
  );
}
