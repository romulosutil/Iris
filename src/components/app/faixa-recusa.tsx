import Link from "next/link";
import { Banner } from "@/components/ui/banner";
import { Container } from "@/components/ui/layout";
import type { AvisoRecusa } from "@/lib/billing/recusa-ui";

/**
 * Faixa de cobrança recusada (D36).
 *
 * Antes dela, uma recusa não produzia **nada** na interface: `billing_cycle.erro`
 * era escrito e nunca lido, a carência de 10 dias corria e a assinatura era
 * cortada — com revogação irreversível da autorização de Pix Automático — sem
 * que a clínica visse uma linha em lugar nenhum.
 *
 * Três decisões de tela, todas testadas:
 *
 * - **`variant="info"`, nunca `alerta`.** `alerta` carrega `role="alert"`,
 *   reservado ao risco clínico. Cobrança não interrompe leitor de tela. A
 *   urgência vem do `formato="padrao"` com título — o degrau acima da faixa de
 *   trial, que é `compacto`.
 * - **Não é dispensável.** É o único aviso antes de um corte irreversível.
 * - **CTA só onde há o que fazer aqui dentro.** Em recusa por teto ou saldo a
 *   ação mora no app do banco; um botão para dentro do Iris levaria a clínica a
 *   uma tela onde não há nada a fazer.
 *
 * ⚠️ **Limitação conhecida:** o layout não revalida em navegação client-side
 * (#285). O pagamento acontece FORA do Iris, então a faixa some no próximo
 * carregamento de servidor, não no instante do pagamento. Polling é escopo da
 * issue separada do mostrador de retentativas.
 */
export function FaixaRecusa({ aviso }: { aviso: AvisoRecusa | null }) {
  if (!aviso) return null;

  return (
    <Container largura="md" className="pt-3 pb-0">
      <Banner variant="info" formato="padrao" titulo={aviso.titulo}>
        <p>{aviso.texto}</p>
        {aviso.prazo ? (
          <p className="mt-2 font-semibold">{aviso.prazo}</p>
        ) : null}
        {aviso.ctaHref && aviso.ctaLabel ? (
          <p className="mt-3">
            <Link
              href={aviso.ctaHref}
              className="font-semibold whitespace-nowrap underline underline-offset-4"
            >
              {aviso.ctaLabel}
            </Link>
          </p>
        ) : null}
      </Banner>
    </Container>
  );
}
