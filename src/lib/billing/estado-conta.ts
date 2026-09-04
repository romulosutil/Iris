import "server-only";
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/rls";
import { calcularStatusTrial } from "@/lib/trial";
import { formatarBRL } from "@/lib/moeda";

/**
 * Decisão unificada sobre o que uma clínica pode fazer (#36 + #175).
 *
 * Este módulo substitui `src/lib/billing/gate.ts`, que foi deletado. A troca é
 * substituição, não refatoração, de propósito: `gate.ts` e `trial.ts` afirmavam
 * regras opostas sobre o mesmo instante ("a cobrança nasce no 1º paciente" ×
 * "o relógio começa no 1º paciente"), e o resultado era um deadlock — o gate
 * bloqueava `free_tier` antes do INSERT, então `app_iniciar_trial()` nunca
 * rodava e o trial de 7 dias jamais começava para ninguém. Manter dois módulos
 * de nome parecido com intenções divergentes foi exatamente como isso nasceu.
 *
 * A política vem do BACKLOG (#163+#159): trial irrestrito, sem exigir cartão no
 * cadastro, e pós-trial = **somente-leitura com exportação livre** — não
 * bloqueio de cadastro. O estado é **derivado no request**, nunca uma flag
 * setada por job.
 *
 * Por que uma consulta só: "status da assinatura" e "relógio do trial" precisam
 * enxergar o mesmo instante do banco. Em duas idas, uma ativação concorrente
 * poderia ser lida por uma metade da decisão e não pela outra. (É a mesma
 * disciplina que o comentário original de `gate.ts` defendia para a contagem de
 * pacientes.)
 */

export type EstadoConta =
  /** Legado pré-cobrança (`isento_trial`): fora do relógio e fora da cobrança. */
  | "isenta"
  /** Sem 1º paciente ainda, dentro do teto de 14 dias de `trial.ts`. */
  | "trial_aguardando"
  | "trial_ativo"
  | "trial_expirado"
  | "ativa"
  /** `setup_pending` com o trial já vencido — pagamento em voo. */
  | "pagamento_em_processamento"
  /** `past_due`: renovação falhou, mas a conta continua escrevendo. */
  | "pagamento_atrasado"
  | "cancelada"
  /**
   * #191 — sintético: nunca produzido por `derivarSituacao`/SQL. Lançado por
   * `criarPacienteEConsent` quando o CPF do 1º paciente já consumiu trial
   * gratuito em outra clínica (`app_cpf_hash_usado_em_outro_trial`).
   */
  | "trial_bloqueado_fraude";

export interface SituacaoConta {
  estado: EstadoConta;
  podeEscrever: boolean;
  /**
   * Explícito, e não derivado de `podeEscrever` pelo chamador: a UI precisa
   * saber que ESTE botão some. Hoje os dois andam juntos; separá-los agora
   * evita que uma futura regra "pode editar mas não pode cadastrar" tenha de
   * reescrever todos os call sites.
   */
  podeCadastrarPaciente: boolean;
  /**
   * Valor BRUTO de dias de trial restantes — pode ser negativo (trial
   * encerrado). `null` quando o relógio é irrelevante para o estado (isenta,
   * ativa, cancelada). A faixa precisa do negativo para renderizar "encerrado".
   */
  diasRestantesTrial: number | null;
  statusAssinatura: string;
  /**
   * Soma dos ciclos em `devido`, em centavos — o que a clínica deve para
   * reativar (#290). `0` quando não deve nada, que é o caso da esmagadora
   * maioria.
   *
   * Não é derivado de `estado`: débito sobrevive à reativação quando fica
   * abaixo do piso de cobrança do gateway, então conta `ativa` com débito é
   * estado normal, não contradição.
   */
  debitoCentavos: number;
}

type LinhaSituacao = {
  status: string | null;
  isento_trial: boolean;
  trial_comeco_em: Date | string | null;
  trial_dias: number | null;
  criado_em: Date | string;
  timezone: string;
  /**
   * `SUM` dos ciclos `devido`. A consulta garante `0` pelo `COALESCE`, mas o
   * campo é OPCIONAL no tipo: `derivarSituacao` é chamado direto (em teste e
   * potencialmente por outra consulta) e exigir a coluna transformaria uma
   * regra de faturamento acessória em pré-requisito de todo chamador. Ausente,
   * vira zero — que é a leitura correta de "não sei de débito nenhum".
   */
  debito_centavos?: number | string | null;
};

function paraData(valor: Date | string): Date {
  return valor instanceof Date ? valor : new Date(valor);
}

/**
 * A regra inteira, isolada do I/O para ser testável sem banco.
 *
 * ```
 * podeEscrever = isento || status ∈ {active, past_due}
 *                       || (status ≠ canceled && trialAtivo)
 * ```
 *
 * Três decisões não-óbvias:
 *
 * - **`free_tier` + trial ativo → pode escrever.** É o desfazimento do
 *   deadlock. `free_tier` deixa de significar "não pagou" e passa a significar
 *   "ainda não entrou no ciclo de cobrança" — literalmente o "sem exigir cartão
 *   no cadastro" do backlog.
 * - **`setup_pending` durante o trial → pode escrever.** Antes `setup_pending`
 *   era MAIS restritivo que `free_tier`, o que punia justamente quem clicou em
 *   "ativar". Invariante nova: **iniciar o pagamento nunca pode piorar a
 *   situação**.
 * - **`past_due` → pode escrever sempre.** Preserva a intenção do gate antigo:
 *   a carência (`subscription.carencia_dias`, por linha) é aplicada pelo job de
 *   cobrança — desde a #319 por
 *   `cancelarAssinaturasComCarenciaVencida` (`subscription.ts`), que é quem
 *   transiciona para `canceled` quando ela vence. Até ela existir, este ramo
 *   liberava escrita indefinidamente: nada cortava. Falha de Pix/cartão costuma
 *   ser do banco do cliente, e travar a clínica por isso pune o paciente, não o
 *   inadimplente — mas o prazo agora de fato acaba.
 */
export function derivarSituacao(
  linha: LinhaSituacao | undefined,
  agora?: Date,
): SituacaoConta {
  // Sem linha a clínica não existe para este tenant. Somente-leitura é o lado
  // seguro: decidir por ausência de evidência aqui seria liberar escrita com
  // base em nada. (O INSERT falharia na FK de qualquer jeito.)
  if (!linha) {
    return {
      estado: "cancelada",
      podeEscrever: false,
      podeCadastrarPaciente: false,
      diasRestantesTrial: null,
      statusAssinatura: "desconhecido",
      debitoCentavos: 0,
    };
  }

  const status = linha.status ?? "free_tier";
  // `SUM` do Postgres volta como string no driver (numeric), e como `null` se a
  // coluna não vier — normalizar aqui evita `"1300"` vazando para a UI e virando
  // concatenação em vez de soma.
  const debitoCentavos = Number(linha.debito_centavos ?? 0) || 0;

  // Legado pré-cobrança (0064) e clínica sem trial configurado: curto-circuito
  // antes de tudo. Cobrar retroativamente quem entrou antes do modelo comercial
  // existir seria mudar o contrato unilateralmente.
  if (linha.isento_trial || linha.trial_dias == null) {
    return {
      estado: "isenta",
      podeEscrever: true,
      podeCadastrarPaciente: true,
      diasRestantesTrial: null,
      statusAssinatura: status,
      debitoCentavos,
    };
  }

  // Reusa `calcularStatusTrial` sem alterá-lo: o relógio permanece no 1º
  // paciente e o teto de 14 dias (`DIAS_ATE_INICIO_AUTOMATICO`) fica preservado.
  const trial = calcularStatusTrial(
    paraData(linha.criado_em),
    linha.trial_comeco_em == null ? null : paraData(linha.trial_comeco_em),
    linha.trial_dias,
    linha.timezone,
    agora,
  );

  // Bruto: negativo quando encerrado. `calcularStatusTrial` clampa em 0, então
  // o negativo é reconstruído a partir de `expirado` só para a faixa.
  const diasRestantesTrial = trial.expirado ? -1 : trial.diasRestantes;

  const permitir = (estado: EstadoConta): SituacaoConta => ({
    estado,
    podeEscrever: true,
    podeCadastrarPaciente: true,
    diasRestantesTrial,
    statusAssinatura: status,
    debitoCentavos,
  });
  const somenteLeitura = (estado: EstadoConta): SituacaoConta => ({
    estado,
    podeEscrever: false,
    podeCadastrarPaciente: false,
    diasRestantesTrial,
    statusAssinatura: status,
    debitoCentavos,
  });

  if (status === "active") return permitir("ativa");
  if (status === "past_due") return permitir("pagamento_atrasado");
  // Cancelada tranca na hora, mesmo com trial nominalmente ativo — e mesmo
  // sabendo que hoje o único jeito de cancelar é revogar a autorização numa
  // tela genérica do banco, sem contexto nenhum do Iris.
  //
  // O corte instantâneo é DELIBERADO (#287 Problema 2, decidido na #290). A
  // carência que o Problema 2 propunha — espelhando a de `past_due` logo acima
  // — reabriria exatamente o buraco que a #290 fecha: com o ciclo cobrado em
  // pro-rata só na reativação, uma janela de escrita depois do cancelamento é
  // o dia grátis que o loop cancela-usa-cancela procura. Em `past_due` a
  // carência não tem esse efeito, porque lá a assinatura continua viva e o
  // ciclo segue sendo faturado.
  //
  // O risco que sobra (revogação por engano no app do banco) é mitigado por
  // AVISO, não por acesso: e-mail no cancelamento, pendência registrada na
  // #290. Informar não devolve escrita e por isso não reabre o exploit.
  if (status === "canceled") return somenteLeitura("cancelada");

  if (trial.ativo) {
    return permitir(
      trial.aguardandoPrimeiroPaciente ? "trial_aguardando" : "trial_ativo",
    );
  }

  return somenteLeitura(
    status === "setup_pending"
      ? "pagamento_em_processamento"
      : "trial_expirado",
  );
}

/**
 * Avalia a situação DENTRO da transação de tenant já aberta. Recebe `tx` em vez
 * de abrir a própria conexão: chamado de dentro do `withTenant` da escrita, ele
 * enxerga a mesma imagem do banco que o INSERT que vem a seguir, e um rollback
 * reverte a decisão junto.
 */
export async function avaliarSituacaoConta(
  tx: Tx,
  clinicId: string,
  agora?: Date,
): Promise<SituacaoConta> {
  const resultado = await tx.execute<LinhaSituacao>(sql`
    SELECT
      (SELECT s.status::text FROM subscription s WHERE s.clinic_id = ${clinicId}) AS status,
      c.isento_trial,
      c.trial_comeco_em,
      c.trial_dias,
      c.criado_em,
      c.timezone,
      -- Na MESMA consulta, e não numa segunda ida: status da assinatura e valor
      -- devido precisam enxergar o mesmo instante do banco. Em duas idas, um
      -- webhook de pagamento concorrente seria lido por uma metade da decisão e
      -- não pela outra, e a tela mostraria "cancelada devendo R$ 0,00".
      --
      -- Sob RLS (app_role), coberta pela policy billing_cycle_select (0071,
      -- reescrita na 0085 para resolver o tenant pelo helper). Crase é proibida
      -- aqui: este SQL mora num template literal de JS.
      COALESCE((
        SELECT SUM(bc.valor_centavos)
        FROM billing_cycle bc
        WHERE bc.clinic_id = c.id AND bc.status = 'devido'
      ), 0) AS debito_centavos
    FROM clinic c
    WHERE c.id = ${clinicId}
  `);

  return derivarSituacao((resultado as unknown as LinhaSituacao[])[0], agora);
}

/**
 * Copy de cada estado, em pt-BR. Substitui `mensagemDeBloqueio`.
 *
 * `inadimplente` do enum antigo morreu — nunca teve caminho produtor.
 * `ativacao_requerida` virou `trial_expirado`, com copy nova: o produto não
 * bloqueia mais o cadastro do 1º paciente, ele passa a somente-leitura no fim
 * do teste.
 */
// `ativarEhASaida` mora em `./estado-conta-ui`, e não aqui: este módulo é
// `server-only` (fala com o banco) e o formulário de novo paciente é client
// component — importar daqui derruba o `pnpm build`.

/**
 * @param debitoCentavos Soma dos ciclos `devido`. **Opcional com default zero**
 * de propósito: os call sites que não têm o número (o erro lançado por
 * `criarPacienteEConsent`, por exemplo) continuam produzindo texto correto — só
 * menos informativo. Obrigatório teria forçado todo chamador a buscar um valor
 * que a maioria não usa.
 */
export function mensagemDeEstado(
  estado: EstadoConta,
  debitoCentavos = 0,
): string {
  if (estado === "cancelada" && debitoCentavos > 0) {
    return `Sua assinatura está cancelada e há ${formatarBRL(debitoCentavos)} em aberto do ciclo interrompido. Você continua vendo e exportando tudo o que registrou; para voltar a cadastrar e editar, quite o valor e reative.`;
  }

  switch (estado) {
    case "trial_expirado":
      return "Seu período de teste terminou. Você continua vendo e exportando o que já registrou — para voltar a cadastrar e editar, ative a assinatura. Você paga pelas fichas ativas no mês, sem valor mínimo.";
    case "pagamento_em_processamento":
      return "Estamos aguardando a confirmação do seu pagamento. Assim que o banco confirmar, a conta é liberada automaticamente.";
    case "cancelada":
      return "Sua assinatura está cancelada. Reative para voltar a cadastrar e editar.";
    case "trial_bloqueado_fraude":
      return "Este CPF já utilizou o período de teste gratuito em outra conta. Para cadastrar pacientes nesta clínica, ative a assinatura — sem período de teste.";
    case "isenta":
    case "trial_aguardando":
    case "trial_ativo":
    case "ativa":
    case "pagamento_atrasado":
      return "";
  }
}
