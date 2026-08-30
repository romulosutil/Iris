import { Alert } from "@/components/ui/alert";
import type { CicloCorrente } from "./queries";

export interface AvisoPastDueProps {
  ciclo: CicloCorrente | null;
  /**
   * A frase do relógio de carência, ou `null` para omiti-la.
   *
   * `null` quando a faixa global do layout já está mostrando o mesmo prazo
   * (há ciclo em `falhou`): a faixa tem precedência porque ela também explica
   * a CAUSA da recusa, e duas frases de prazo na mesma tela são ruído. Quem
   * decide é a página, que já sabe se `obterAvisoRecusa` devolveu algo.
   */
  prazo: string | null;
}

/**
 * `past_due` explicado na tela (#36, bloco B2).
 *
 * ## O que esta copy afirma, e onde isso foi medido
 *
 * A issue #36 descreve `past_due` de um jeito que o código de hoje contradiz
 * em dois pontos. Vale o código:
 *
 * 1. **A carência VENCE e cancela.** A issue diz que "a carência não leva a
 *    `canceled` por inadimplência". `cancelarAssinaturasComCarenciaVencida`
 *    (`subscription.ts:934`) varre `status = 'past_due'` com
 *    `past_due_desde + carencia_dias <= agora` e corta com
 *    `statusEsperado: "past_due"` (`subscription.ts:1012`).
 * 2. **Pagar em `past_due` reativa sozinho.** A issue pede copy "sem prometer
 *    reativação automática". `liquidarCiclo` (`subscription.ts:2445`) faz
 *    `UPDATE subscription SET status='active', past_due_desde=NULL WHERE
 *    status='past_due'` quando o pagamento é confirmado. O que NÃO reativa é
 *    pagar depois de a assinatura já estar `canceled` — é o `WHERE` daquele
 *    update, e é a regra da #290.
 *
 * ## Por que existe, se já há a faixa global de recusa
 *
 * Porque hoje existe um `past_due` que não aparece em lugar nenhum:
 * `FaixaRecusa` só monta quando o ciclo mais recente está em `falhou`
 * (`recusa-ativa.ts:88`), `FaixaTrial` devolve `null` em `pagamento_atrasado`
 * sem débito (`faixa-trial.tsx`), e `mensagemDeEstado` devolve string vazia
 * para esse estado (`estado-conta.ts:307`). Mas `past_due` também é carimbado
 * quando o gateway reporta o vínculo como `pausada` (`subscription.ts:136`),
 * sem ciclo em `falhou` nenhum — e nesse caminho a carência corre, a
 * assinatura será cancelada, e a clínica não lê uma linha sobre isso.
 *
 * ## O que a copy NÃO faz
 *
 * Não afirma causa (o caminho do backstop de D+7 não pergunta nada a banco
 * nenhum — o prazo só venceu) e não promete retentativa. São as duas regras já
 * escritas no cabeçalho de `recusa-ui.ts`, e valem aqui igual.
 */
export function AvisoPastDue({ ciclo, prazo }: AvisoPastDueProps) {
  if (!ciclo || ciclo.statusAssinatura !== "past_due") return null;

  return (
    <Alert severidade="warning" titulo="Pagamento em atraso">
      <p>
        A cobrança do último ciclo não foi confirmada, então sua assinatura está
        marcada como em atraso. O acesso ao Iris{" "}
        <strong>continua liberado</strong> — atendimento, prontuário e cadastro
        seguem funcionando normalmente.
      </p>
      <p className="mt-2">
        Para regularizar, pague a fatura em aberto no histórico de cobranças
        abaixo. Assim que o pagamento é confirmado, a assinatura{" "}
        <strong>volta a ficar ativa sozinha</strong>: não é preciso refazer nada
        aqui.
      </p>
      {prazo ? <p className="mt-2 font-semibold">{prazo}</p> : null}
      <p className="mt-2">
        Se o prazo passar, a assinatura é cancelada. A partir daí, pagar o que
        está em aberto deixa de bastar: voltar exige uma{" "}
        <strong>autorização nova</strong> de Pix Automático, feita por você
        nesta tela.
      </p>
    </Alert>
  );
}
