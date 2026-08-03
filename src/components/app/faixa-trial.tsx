import { Banner } from "@/components/ui/banner";
import { Container } from "@/components/ui/layout";

interface FaixaTrialProps {
  diasRestantes: number;
  /**
   * `true` = o relógio ainda não disparou (#175). Tem precedência sobre
   * `diasRestantes`: nenhuma contagem é verdadeira antes do 1º paciente.
   */
  aguardandoPrimeiroPaciente?: boolean;
}

/**
 * Faixa informativa do período de trial, em quatro estados: aguardando o 1º
 * paciente, durante, último dia e encerrado.
 *
 * **O estado "aguardando" existe porque o relógio começa no 1º paciente**
 * (#175), não no cadastro. Mostrar "termina em 7 dias" para quem acabou de
 * criar a conta e ainda não cadastrou ninguém seria uma contagem falsa — e
 * pressa desnecessária logo no onboarding. A faixa aparece mesmo assim, porque
 * a condição ("começa quando você cadastrar o primeiro paciente") é justamente
 * o que a pessoa precisa saber para decidir quando começar.
 *
 * **O estado "encerrado" é o que evita a queda em silêncio.** Antes, a faixa
 * simplesmente sumia quando `diasRestantes` ficava negativo: a pessoa via a
 * contagem regressiva chegar em "termina hoje" e no dia seguinte não havia mais
 * nada na tela — nem aviso, nem o que fazer. Como o gate de escrita ainda não
 * existe (Fatia B), a conta segue funcionando, e o silêncio ensinava que o
 * trial não significava nada; a cobrança depois pareceria mudança de regra.
 *
 * Quem decide se a faixa aparece é o layout: `null` de `resolverFaixaTrial`
 * significa clínica fora do relógio de trial (isenta/sem trial configurado), e
 * aí nada é renderizado. Negativo significa trial encerrado — e **aparece**.
 *
 * Acessibilidade:
 * - role="status" (herdado do Banner) para notificar mudanças de estado do trial
 * - Texto sempre redundante à cor (nunca depende só de cor para convey urgência)
 * - Alvo mínimo 44px de altura (herdado do Container/layout)
 * - Semântica clara sem linguagem alarme (informação, não alerta) — o fim do
 *   trial não é erro nem risco, então segue `variant="info"`, nunca "alerta"
 *   (que carrega `role="alert"`, reservado ao risco clínico).
 */
export function FaixaTrial({
  diasRestantes,
  aguardandoPrimeiroPaciente = false,
}: FaixaTrialProps) {
  const mensagem = aguardandoPrimeiroPaciente
    ? "Seu período de teste começa quando você cadastrar o primeiro paciente — até lá, nenhum dia é consumido."
    : diasRestantes < 0
      ? "Seu período de teste terminou. Sua conta continua ativa e seus dados seguem acessíveis — fale com a gente para ativar a assinatura."
      : diasRestantes === 0
        ? "Seu período de teste termina hoje. Sua conta continua ativa depois disso."
        : diasRestantes === 1
          ? "Seu período de teste termina em 1 dia."
          : `Seu período de teste termina em ${diasRestantes} dias.`;

  return (
    <Container largura="md" className="py-4">
      <Banner variant="info">{mensagem}</Banner>
    </Container>
  );
}
