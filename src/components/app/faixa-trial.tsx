"use client";

import Link from "next/link";
import { Banner } from "@/components/ui/banner";
import { Container } from "@/components/ui/layout";
import { formatarBRL } from "@/lib/billing/calculator";
import type { EstadoConta } from "@/lib/billing/estado-conta";

interface FaixaTrialProps {
  estado: EstadoConta;
  /**
   * Valor BRUTO — pode ser negativo (teste encerrado). `null` quando o relógio
   * não é relevante para o estado.
   */
  diasRestantes: number | null;
  /**
   * Soma dos ciclos `devido`, em centavos (#290). `0` quando não há dívida.
   *
   * Default zero para não obrigar todo call site (e todo teste) a passar um
   * número que quase sempre é o mesmo.
   */
  debitoCentavos?: number;
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
 * - Formato compacto/sutil para não competir visualmente com decisões clínicas
 * - `variant="info"` em TODOS os estados, inclusive o encerrado: `alerta`
 *   carrega `role="alert"`, reservado ao risco clínico. Cobrança não interrompe
 *   leitor de tela.
 */
export function FaixaTrial({
  estado,
  diasRestantes,
  debitoCentavos = 0,
}: FaixaTrialProps) {
  const temDebito = debitoCentavos > 0;

  // Conta em dia (ou fora do modelo comercial) não tem o que comunicar aqui —
  // EXCETO quando sobrou dívida (#290). Reativar com débito abaixo do piso de
  // cobrança do gateway é caminho normal, e sem esta exceção a dívida sumiria
  // da tela justamente no intervalo em que a clínica poderia pagá-la,
  // reaparecendo somada no cancelamento seguinte. Débito invisível é o que
  // transforma cobrança legítima em contestação.
  if (
    estado === "isenta" ||
    estado === "ativa" ||
    estado === "pagamento_atrasado"
  ) {
    if (!temDebito) return null;
    return (
      <Container largura="md" className="pt-3 pb-0">
        <Banner variant="info" formato="compacto" dismissible>
          Há {formatarBRL(debitoCentavos)} em aberto de um ciclo interrompido em
          cancelamento anterior. O valor não vence nem expira: ele é cobrado na
          próxima vez que você reativar a assinatura.
        </Banner>
      </Container>
    );
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
            ? temDebito
              ? `Sua assinatura está cancelada e há ${formatarBRL(debitoCentavos)} em aberto do ciclo interrompido. A conta está em somente-leitura; seus dados continuam acessíveis e exportáveis. Para voltar a cadastrar e editar, quite o valor e reative.`
              : "Sua assinatura está cancelada e a conta está em somente-leitura. Seus dados continuam acessíveis e exportáveis."
            : "Seu período de teste terminou. A conta está em somente-leitura.";

  // CTA direto para cadastro no onboarding de trial aguardando
  const ctaCadastrar = estado === "trial_aguardando";

  // CTA só onde ativar/reativar é de fato a saída. Em
  // `pagamento_em_processamento` já existe cobrança em voo e mandar a pessoa
  // de volta ao checkout gera uma segunda.
  const ctaAtivar = estado === "trial_expirado" || estado === "cancelada";

  return (
    <Container largura="md" className="pt-3 pb-0">
      <Banner variant="info" formato="compacto" dismissible>
        {mensagem}
        {ctaCadastrar ? (
          <>
            {" "}
            <Link
              href="/pacientes/novo"
              className="font-semibold whitespace-nowrap underline underline-offset-4"
            >
              Cadastrar primeiro paciente →
            </Link>
          </>
        ) : null}
        {ctaAtivar ? (
          <>
            {" "}
            <Link
              href="/assinatura"
              className="font-semibold whitespace-nowrap underline underline-offset-4"
            >
              Ativar assinatura
            </Link>
          </>
        ) : null}
      </Banner>
    </Container>
  );
}
