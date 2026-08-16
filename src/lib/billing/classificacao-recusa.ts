/**
 * Classificação da recusa de cobrança: código do gateway → grupo de desfecho
 * (#318).
 *
 * ## O problema que isto resolve
 *
 * Antes daqui, os 25 códigos publicados pelo Asaas caíam todos no MESMO
 * desfecho: `billing_cycle → falhou`, `subscription → past_due`. A informação
 * chegava, era interpolada num texto livre e descartada na decisão. Efeitos
 * concretos disso, todos medidos na #318:
 *
 * - `PAYMENT_ALREADY_DONE` significa **cobrança liquidada** e virava dívida
 *   contra clínica adimplente;
 * - `EXCEEDED_MAXIMUM_RETRY_ATTEMPTS` é defeito NOSSO (retentativa mal emitida)
 *   e chega DEPOIS da recusa de saldo que já carimbou o estado certo —
 *   sobrescrevê-lo apaga o diagnóstico correto com o nosso erro;
 *   `EXTERNAL_INSTITUTION_ERROR` é falha do banco e cobrava carência de quem
 *   não errou.
 *
 * ## A regra que gera a coluna `carimbaPastDue` (vale para a tabela inteira)
 *
 * > Carimba `past_due` no ato quando a recusa é, **por si só, prova de um fato
 * > sobre a clínica sobre o qual ela pode agir**. Não carimba quando a recusa
 * > não prova nada sobre ela.
 *
 * G1 (o limite é dela), G2 (a conta dela não tinha saldo), G4 (o documento é
 * dela) e G5 (a conta é dela) provam. G6 prova algo sobre **nós**, G7 sobre o
 * **banco**, G0 não se sabe — e G3 não carimba porque o desfecho dele é outro
 * (corte, não carência).
 *
 * ## O catálogo é ABERTO — o ramo default é requisito, não zelo
 *
 * O OpenAPI do Asaas declara `refusalReason` como `string` **sem `enum`**, e a
 * doc avisa que valores novos entram sem aviso prévio. Por isso:
 *
 * - `classificarRecusa` aceita `string | null`, nunca uma união de literais;
 * - qualquer coisa fora dos 25 códigos é **G0**, e `null` também (é o estado de
 *   produção enquanto o D35 não estiver medido em prod: sem instrução para
 *   consultar, o motivo chega `null`);
 * - a comparação é EXATA (`trim` + caixa alta), sem casamento parcial: um
 *   `LIKE`/`includes` aqui reintroduziria a adivinhação que a coluna
 *   `recusa_codigo` existe para matar.
 *
 * ## ⚠️ O que este módulo NÃO faz, de propósito
 *
 * - **Não corta assinatura.** G3 (autorização morta) tem `corteImediato`, e o
 *   corte **nunca** pode sair só do código: exige reconsulta a
 *   `GET /pix/automatic/authorizations/{id}` e só vale se o gateway DISSER
 *   `CANCELLED`/`EXPIRED`/`REFUSED` — se responder `ACTIVE`, o código mente e o
 *   caso é G7. É o mesmo fail-closed da #319 em `cancelarVinculo`, e a razão é
 *   que revogação não volta sem novo consentimento da clínica no app do banco.
 *   Enquanto essa reconsulta não existir no caminho de conciliação, G3 se
 *   comporta como "registra e espera" — o corte fica com o backstop de D+7.
 * - **Não comanda retentativa.** `valeGastarRetentativa` descreve se vale
 *   queimar uma das 3 tentativas do `3R_7D`; quem executa é a #322.
 * - **Não renderiza nada.** `copy` é o texto que a clínica deve ver quando a
 *   #312/D36 existir — hoje nenhuma tela lê. Regra que vale para os 9 grupos:
 *   **dizer o que fazer e onde, nunca o código** (a própria doc do Asaas
 *   orienta a não expor o código cru), e nunca citar valor (o teto do Pix
 *   Automático é ilegível por regulação).
 */

/** Os 9 grupos de desfecho da #318. `G0` é o default do catálogo aberto. */
export type GrupoRecusa =
  "G0" | "G1" | "G2" | "G3" | "G4" | "G5" | "G6" | "G7" | "G8";

export interface PoliticaRecusa {
  grupo: GrupoRecusa;
  /**
   * O ciclo vai para `falhou`. Falso não é "tanto faz": é **proibido escrever**
   * — ver G6, em que a escrita apagaria o estado correto gravado pela recusa
   * anterior.
   */
  marcaCicloFalhou: boolean;
  /** A assinatura entra em `past_due` e a carência de 10 dias começa a correr. */
  carimbaPastDue: boolean;
  /** O ciclo é conciliado como PAGO (só G8: a cobrança já foi liquidada). */
  conciliaComoPago: boolean;
  /** Vale gastar uma das 3 tentativas do `3R_7D` (orçamento finito, #322). */
  valeGastarRetentativa: boolean;
  /**
   * O desfecho deste grupo é o corte imediato — e ele **exige** confirmação da
   * autorização no gateway antes de qualquer escrita irreversível. Só G3.
   */
  corteImediato: boolean;
  /** Texto interno, para `billing_cycle.erro`. Não é copy de tela. */
  diagnostico: string;
  /** Copy pt-BR para a clínica, ou `null` quando ela não vê nada. */
  copy: string | null;
}

/**
 * O catálogo publicado, agrupado por DESFECHO — dois códigos ficam juntos se e
 * somente se o sistema deve fazer a mesma coisa com eles.
 *
 * 25 códigos: 1 emitido pelo próprio Asaas (`PAYMENT_OVERDUE`) e 24 pelo banco
 * pagador. Apagar a linha de um grupo joga os códigos dele em G0 — é o mutante
 * com que `classificacao-recusa.int.test.ts` é validado.
 */
const CATALOGO: Readonly<
  Record<Exclude<GrupoRecusa, "G0">, readonly string[]>
> = {
  // G1 — teto insuficiente. A clínica tem saldo e quer pagar; o limite que
  // ela definiu no app do banco é menor que a mensalidade.
  G1: ["MAXIMUM_AMOUNT_EXCEEDED"],
  // G2 — saldo insuficiente. Inadimplência genuína, e o caso canônico da
  // finalidade `NTAG` do BACEN (retentativa por falta de saldo/limite).
  G2: ["PAYMENT_OVERDUE"],
  // G3 — não existe trilho de débito: a autorização não está válida.
  G3: [
    "RECURRING_PAYMENT_NOT_CONFIRMED",
    "PAYMENT_INSTRUCTION_WITHOUT_AUTHORIZATION",
    "INVALID_RECURRING_PAYMENT_ID",
  ],
  // G4 — cadastral DA CLÍNICA: o documento que mandamos não confere com o
  // titular da conta. O dado é nosso (`clinic.cpf_cnpj`), o valor certo é dela.
  G4: [
    "PAYER_CPF_CNPJ_MISMATCH",
    "INVALID_CUSTOMER_CPF_CNPJ",
    "INCORRECT_CUSTOMER_CPF_CNPJ",
  ],
  // G5 — conta encerrada ou bloqueada.
  G5: ["ACCOUNT_CLOSED", "ACCOUNT_BLOCKED"],
  // G6 — defeito NOSSO: mandamos coisa errada. Os três primeiros são o modo
  // de falha do bug de janela que a #317 fechou; `RECEIVER_CPF_CNPJ_MISMATCH`
  // é o CNPJ do RECEBEDOR (nós), não o da clínica; os três últimos são
  // comando de retentativa mal emitido por nós.
  G6: [
    "RECEIVED_TOO_EARLY",
    "RECEIVED_TOO_LATE",
    "DUE_DATE_MISMATCH",
    "AMOUNT_MISMATCH",
    "RECEIVER_CPF_CNPJ_MISMATCH",
    "POST_DUE_DATE_ATTEMPT_NOT_ALLOWED",
    "OUT_OF_TIME_FRAME_FOR_RETRY",
    "EXCEEDED_MAXIMUM_RETRY_ATTEMPTS",
    "PAYMENT_ALREADY_SCHEDULED",
  ],
  // G7 — falha do banco ou do SPI. Falha do banco não é inadimplência da
  // clínica.
  G7: [
    "EXTERNAL_INSTITUTION_ERROR",
    "PARTICIPANT_NOT_REGISTERED",
    "PARTICIPANT_ISPB_INVALID",
    "SAME_INSTITUTION_ERROR",
    "OTHER",
  ],
  // G8 — a cobrança JÁ foi liquidada. Não é falha, é conciliação perdida.
  G8: ["PAYMENT_ALREADY_DONE"],
};

/**
 * A tabela de desfechos da #318, uma entrada por grupo.
 *
 * Separada do `CATALOGO` de propósito: o catálogo é fato do gateway (cresce
 * sozinho), a política é decisão nossa. Mexer numa não é mexer na outra.
 */
const POLITICAS: Readonly<Record<GrupoRecusa, Omit<PoliticaRecusa, "grupo">>> =
  {
    /**
     * G1 carimba `past_due` DE PROPÓSITO. O instinto é poupar quem "tem saldo e
     * quer pagar", mas sem carimbo a assinatura nunca é cortada e um teto baixo
     * demais vira assinatura gratuita vitalícia, sem erro em lugar nenhum. Os 10
     * dias de carência SÃO o prazo para subir o limite. O que muda em relação a
     * G2 não é o relógio — é a copy e o estado de UI.
     */
    G1: {
      marcaCicloFalhou: true,
      carimbaPastDue: true,
      conciliaComoPago: false,
      // Só depois que a clínica agir: retentar antes de o limite subir queima
      // tentativa com resultado conhecido.
      valeGastarRetentativa: true,
      corteImediato: false,
      diagnostico:
        "recusada: o limite da autorização de Pix Automático é menor que o valor da cobrança",
      copy: "O débito automático não passou. O limite que você definiu no app do seu banco é menor que o valor desta mensalidade. Esse limite fica na autorização de Pix Automático do Iris, dentro do seu banco — não conseguimos ver nem alterar por aqui.",
    },
    G2: {
      marcaCicloFalhou: true,
      carimbaPastDue: true,
      conciliaComoPago: false,
      valeGastarRetentativa: true,
      corteImediato: false,
      diagnostico:
        "recusada: sem saldo ou limite na conta no momento do débito",
      copy: "O débito automático não passou por falta de saldo na conta. Deixe o valor disponível e a cobrança será tentada de novo.",
    },
    /**
     * G3 é o único grupo cujo desfecho é o CORTE, e o corte nunca pode sair só do
     * código: exige a reconsulta descrita no cabeçalho. Por isso não carimba
     * `past_due` (o desfecho não é carência) e mesmo assim leva o ciclo a
     * `falhou` — a cobrança falhou de fato, e é o registro que a tela vai ler.
     */
    G3: {
      marcaCicloFalhou: true,
      carimbaPastDue: false,
      conciliaComoPago: false,
      // Não há trilho de débito: retentar é 400 garantido.
      valeGastarRetentativa: false,
      corteImediato: true,
      diagnostico:
        "recusada: não há autorização de Pix Automático válida para este débito",
      copy: "Sua autorização de débito automático não está mais válida. Para continuar, refaça a autorização de Pix Automático pelo app do seu banco.",
    },
    G4: {
      marcaCicloFalhou: true,
      carimbaPastDue: true,
      conciliaComoPago: false,
      // Depois da correção do cadastro; antes dela, o resultado é o mesmo.
      valeGastarRetentativa: true,
      corteImediato: false,
      diagnostico:
        "recusada: o CPF/CNPJ enviado não confere com o titular da conta pagadora",
      copy: "O CPF/CNPJ cadastrado não confere com o titular da conta usada no débito automático. Corrija o documento nos dados da clínica.",
    },
    /**
     * G5 carimba pela mesma regra geral: conta encerrada é fato sobre a clínica
     * tanto quanto saldo zerado, e ela pode agir (outra conta).
     *
     * ⚠️ RESTRIÇÃO INEGOCIÁVEL (Decisão 1 da #318): `ACCOUNT_BLOCKED` **não**
     * dispara o corte imediato de G3. Bloqueio é frequentemente temporário
     * (judicial, antifraude, revisão cadastral); cortar na hora por um bloqueio
     * que se resolve em 3 dias troca um problema reversível por um irreversível —
     * a revogação da autorização não volta sem novo consentimento no app do banco.
     */
    G5: {
      marcaCicloFalhou: true,
      carimbaPastDue: true,
      conciliaComoPago: false,
      // Desperdício garantido: a conta não vai debitar em tentativa nenhuma.
      valeGastarRetentativa: false,
      corteImediato: false,
      diagnostico: "recusada: conta bancária encerrada ou bloqueada",
      copy: "A conta bancária usada no débito automático está encerrada ou bloqueada. Refaça a autorização de Pix Automático com outra conta.",
    },
    /**
     * G6 NÃO MOVE ESTADO NENHUM — e não é só "não carimba `past_due`": o ciclo
     * **não vai para `falhou`**, e por isso `erro`/`recusa_codigo` também não são
     * reescritos.
     *
     * O motivo é concreto: `EXCEEDED_MAXIMUM_RETRY_ATTEMPTS` (retentativa nossa
     * mal emitida) chega DEPOIS da recusa de saldo que já carimbou `past_due`
     * corretamente. Deixar G6 escrever apagaria o estado certo com erro nosso — a
     * clínica ficaria com um diagnóstico que fala do nosso bug, não da causa real.
     *
     * A clínica não vê nada: defeito nosso é custo nosso. O sinal fica no log.
     */
    G6: {
      marcaCicloFalhou: false,
      carimbaPastDue: false,
      conciliaComoPago: false,
      // Só depois do conserto — retentar o mesmo comando errado repete a recusa e
      // queima tentativa.
      valeGastarRetentativa: true,
      corteImediato: false,
      diagnostico: "recusada por defeito do Iris na emissão da instrução",
      copy: null,
    },
    /**
     * G7 não carimba: falha do banco não é inadimplência da clínica. O que a
     * recusa operacional compra é TEMPO, não imunidade — o banco ter falhado não
     * faz a mensalidade deixar de ser devida.
     *
     * ⚠️ Quem cobra o tempo de volta é o **backstop de D+7** (Decisão 2 da #318),
     * que ainda NÃO EXISTE: entrega própria, varredura na rota interna depois de
     * `fecharCiclosVencendo`. Até ela entrar, uma recusa operacional não produz
     * consequência nenhuma. Não subir esta branch para produção sem ela.
     */
    G7: {
      marcaCicloFalhou: false,
      carimbaPastDue: false,
      conciliaComoPago: false,
      valeGastarRetentativa: true,
      corteImediato: false,
      diagnostico: "recusada por falha operacional do banco pagador ou do SPI",
      copy: null,
    },
    /**
     * G8 é correção de DINHEIRO, não classificação: `PAYMENT_ALREADY_DONE`
     * significa que a cobrança foi liquidada. Antes daqui virava `falhou` →
     * `past_due` → dívida congelada contra clínica adimplente, e o gate de
     * reativação (#290) barrava quem já tinha pago.
     */
    G8: {
      marcaCicloFalhou: false,
      carimbaPastDue: false,
      conciliaComoPago: true,
      valeGastarRetentativa: false,
      corteImediato: false,
      diagnostico:
        "cobrança já liquidada no gateway; ciclo conciliado como pago",
      copy: null,
    },
    /**
     * G0 falha ABERTO para o cliente e BARULHENTO para nós: código desconhecido
     * (ou ausente) nunca pune a clínica no ato, porque não prova nada sobre ela.
     * O buraco de receita é fechado pelo mesmo backstop de D+7 que cobre G7.
     */
    G0: {
      marcaCicloFalhou: false,
      carimbaPastDue: false,
      conciliaComoPago: false,
      valeGastarRetentativa: true,
      corteImediato: false,
      diagnostico: "recusada por motivo que o Iris ainda não sabe classificar",
      copy: null,
    },
  };

/** Índice reverso código → grupo, montado uma vez a partir do `CATALOGO`. */
const GRUPO_POR_CODIGO: ReadonlyMap<string, GrupoRecusa> = new Map(
  Object.entries(CATALOGO).flatMap(([grupo, codigos]) =>
    codigos.map((codigo) => [codigo, grupo as GrupoRecusa] as const),
  ),
);

/**
 * Classifica o código CRU da recusa num dos 9 grupos de desfecho.
 *
 * `codigo` é `string | null` e **nunca** uma união de literais: o catálogo é
 * aberto por contrato do gateway. Desconhecido e `null` caem os dois em G0.
 *
 * `trim` + caixa alta antes de comparar porque os 25 códigos são literais ASCII
 * maiúsculos: normalizar não pode produzir falso positivo (só casa com um código
 * do catálogo, letra por letra) e evita que espaço em branco de transporte vire
 * "código novo".
 */
export function classificarRecusa(codigo: string | null): PoliticaRecusa {
  const normalizado = (codigo ?? "").trim().toUpperCase();
  const grupo = GRUPO_POR_CODIGO.get(normalizado) ?? "G0";
  return { grupo, ...POLITICAS[grupo] };
}
