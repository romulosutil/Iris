import Link from "next/link";
import { Banner } from "@/components/ui/banner";
import { Container } from "@/components/ui/layout";
import type { EstadoConta } from "@/lib/billing/estado-conta";

interface FaixaTrialProps {
  estado: EstadoConta;
  /**
   * Valor BRUTO — pode ser negativo (teste encerrado). `null` quando o relógio
   * não é relevante para o estado.
   */
  diasRestantes: number | null;
}

/**
 * Faixa informativa do período de teste.
 *
 * **Quem decide se ela aparece agora é o estado da conta, não o relógio.** É o
 * fechamento do TODO que `src/lib/trial.ts` deixou escrito: *"quando a
 * `subscription` existir, é ela quem decide se a faixa aparece"*. A
 * `subscription` chegou e ninguém voltou — `resolverFaixaTrial` continuou
 * decidindo sozinho e não sabia distinguir "trial vencido" de "assinante
 * pagante". Agora `resolverFaixaTrial` deixa de ser decisor e vira detalhe
 * interno de `avaliarSituacaoConta`.
 *
 * **O estado "aguardando" existe porque o relógio começa no 1º paciente**
 * (#175), não no cadastro. Mostrar "termina em 7 dias" para quem acabou de
 * criar a conta e ainda não cadastrou ninguém seria uma contagem falsa — e
 * pressa desnecessária logo no onboarding. A faixa aparece mesmo assim, porque
 * a condição ("começa quando você cadastrar o primeiro paciente") é justamente
 * o que a pessoa precisa saber para decidir quando começar.
 *
 * **O estado "encerrado" é o que evita a queda em silêncio.** Antes, a faixa
 * sumia quando `diasRestantes` ficava negativo: a pessoa via a contagem chegar
 * a "termina hoje" e no dia seguinte não havia nada na tela — nem aviso, nem o
 * que fazer. Hoje o fim do teste tem consequência real (somente-leitura), então
 * a faixa precisa dizer isso e oferecer a saída.
 *
 * Acessibilidade:
 * - role="status" (herdado do Banner) para notificar mudanças de estado
 * - Texto sempre redundante à cor (nunca depende só de cor)
 * - Alvo mínimo 44px de altura (herdado do Container/layout)
 * - `variant="info"` em TODOS os estados, inclusive o encerrado: `alerta`
 *   carrega `role="alert"`, reservado ao risco clínico. Cobrança não interrompe
 *   leitor de tela.
 */
export function FaixaTrial({ estado, diasRestantes }: FaixaTrialProps) {
  // Conta em dia (ou fora do modelo comercial) não tem o que comunicar aqui.
  if (estado === "isenta" || estado === "ativa" || estado === "pagamento_atrasado") {
    return null;
  }

  const dias = diasRestantes ?? 0;

  const mensagem =
    estado === "trial_aguardando"
      ? "Seus 7 dias de teste começam quando você cadastrar o primeiro paciente. Até lá nenhum dia é consumido e nada é cobrado."
      : estado === "trial_ativo"
        ? dias === 0
          ? "Hoje é o último dia do seu teste. Amanhã a conta passa a somente-leitura até você ativar a assinatura — seus dados continuam acessíveis."
          : dias === 1
            ? "Falta 1 dia de teste. Depois disso você paga pelo uso — pelas fichas ativas no mês. Nada é cobrado agora."
            : `Faltam ${dias} dias de teste. Depois disso você paga pelo uso — pelas fichas ativas no mês. Nada é cobrado agora.`
        : estado === "pagamento_em_processamento"
          ? "Estamos aguardando a confirmação do seu pagamento. A conta está em somente-leitura até o banco confirmar."
          : estado === "cancelada"
            ? "Sua assinatura está cancelada e a conta está em somente-leitura. Seus dados continuam acessíveis e exportáveis."
            : "Seu período de teste terminou. A conta está em somente-leitura.";

  // CTA só onde ativar/reativar é de fato a saída. Em
  // `pagamento_em_processamento` já existe cobrança em voo e mandar a pessoa
  // de volta ao checkout gera uma segunda.
  const comCta = estado === "trial_expirado" || estado === "cancelada";

  return (
    <Container largura="md" className="py-4">
      <Banner variant="info">
        {mensagem}
        {comCta ? (
          <>
            {" "}
            <Link
              href="/assinatura"
              className="font-semibold underline underline-offset-4"
            >
              Ativar assinatura
            </Link>
          </>
        ) : null}
      </Banner>
    </Container>
  );
}
