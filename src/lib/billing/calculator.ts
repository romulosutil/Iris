/**
 * Calculadora de mensalidade da Iris — pura, sem I/O e sem dependência de
 * runtime (não importa `server-only`, banco, nem `process.env`).
 *
 * Duas decisões estruturais que o resto do módulo assume:
 *
 * 1. **Toda aritmética em centavos, com inteiro.** Preço em `number` decimal
 *    acumula erro de ponto flutuante (0.1 + 0.2 !== 0.3) e diverge da fatura
 *    real, que é emitida em centavos pelo provedor de pagamento. Reais só
 *    aparecem na borda de exibição (`calculateMonthlyFee`, `formatarBRL`).
 *
 * 2. **Faixas MARGINAIS, não faixa única retroativa.** A 16ª ficha ativa não
 *    pode reprecificar as 15 anteriores — a clínica que cresce nunca vê a
 *    conta do mês passado subir sozinha, e o preço por ficha adicional só cai.
 *    Isso torna a curva monótona crescente com incremento decrescente, o que é
 *    a promessa comercial que vendemos.
 *
 * 3. **A unidade cobrada é a FICHA ATIVA, não "o paciente".** Quem entra na
 *    contagem é decidido pela apuração do ciclo em `billing_apurar_ciclo`
 *    (migração 0075): ficha cadastrada dentro do ciclo OU com interação
 *    registrada nele. "Paciente ativo" significava três coisas ao mesmo tempo
 *    (não arquivado, unidade faturável, e "em tratamento" no sentido clínico);
 *    "ficha ativa" nomeia o registro consumido e não colide com a leitura
 *    clínica. Esta calculadora não decide QUEM conta — só quanto custa a
 *    quantidade que a apuração devolveu.
 */

/** Uma faixa de preço marginal. `ateQuantidade: null` = faixa aberta (última). */
export interface Faixa {
  /** Limite superior INCLUSIVO da faixa; `null` na faixa final, sem teto. */
  readonly ateQuantidade: number | null;
  /** Preço mensal, em centavos, de cada ficha ativa que cai nesta faixa. */
  readonly valorCentavos: number;
}

/** Linha do memorial de cálculo exibido na fatura. */
export interface DetalheFaixa {
  /** Primeira ficha ativa coberta por esta faixa (1-indexado, inclusivo). */
  readonly deQuantidade: number;
  /** Última ficha ativa coberta por esta faixa (1-indexado, inclusivo). */
  readonly ateQuantidade: number;
  /** Quantas fichas ativas caíram nesta faixa. */
  readonly quantidade: number;
  readonly valorUnitarioCentavos: number;
  readonly subtotalCentavos: number;
}

/**
 * Fonte única da verdade da precificação. Qualquer tela, fatura ou simulador
 * deve derivar daqui — preço duplicado em componente é como o valor exibido
 * ao cliente descola do valor cobrado.
 *
 * Ordem crescente de `ateQuantidade` é pré-requisito do algoritmo abaixo.
 */
export const FAIXAS_PRECIFICACAO: readonly Faixa[] = [
  { ateQuantidade: 15, valorCentavos: 3900 },
  { ateQuantidade: 40, valorCentavos: 3200 },
  { ateQuantidade: null, valorCentavos: 2500 },
] as const;

/**
 * LEGADO — **não é mais cobrado em lugar nenhum.** Era a cobrança de ativação
 * do Mês 1, do tempo em que a ativação criava uma recorrência de valor fixo no
 * gateway (ou seja, cobrava antes de existir ciclo). Com o trilho pós-pago da
 * migração 0075, a ativação só registra o meio de pagamento e a fatura nasce no
 * fechamento do ciclo, com o valor apurado. Mantido apenas porque a suíte de
 * testes ainda o referencia; nenhum caminho de produção deve voltar a usá-lo.
 */
export const VALOR_PRIMEIRO_PACIENTE_CENTAVOS = 3900;

/**
 * Rejeita entrada inválida em vez de degradar para 0. Uma contagem de
 * fichas corrompida que vira "R$ 0,00" silenciosamente é uma fatura errada
 * emitida ao cliente — falha barulhenta é mais barata que receita perdida.
 */
function validarQuantidade(fichasAtivas: number): void {
  if (!Number.isFinite(fichasAtivas)) {
    throw new RangeError(
      "Quantidade de fichas ativas deve ser um número finito; recebido: " +
        String(fichasAtivas),
    );
  }
  if (!Number.isInteger(fichasAtivas)) {
    throw new RangeError(
      "Quantidade de fichas ativas deve ser um número inteiro; recebido: " +
        String(fichasAtivas),
    );
  }
  if (fichasAtivas < 0) {
    throw new RangeError(
      "Quantidade de fichas ativas não pode ser negativa; recebido: " +
        String(fichasAtivas),
    );
  }
}

/**
 * Memorial de cálculo por faixa. Só devolve faixas efetivamente atingidas —
 * a fatura não deve listar linha com quantidade zero.
 *
 * @throws {RangeError} se `fichasAtivas` não for inteiro finito >= 0.
 */
export function detalharMensalidade(fichasAtivas: number): DetalheFaixa[] {
  validarQuantidade(fichasAtivas);

  const detalhes: DetalheFaixa[] = [];
  let jaContabilizados = 0;

  for (const faixa of FAIXAS_PRECIFICACAO) {
    if (jaContabilizados >= fichasAtivas) break;

    // Faixa aberta absorve todo o restante; faixa fechada leva só o que cabe
    // até o seu teto, e o excedente segue para a próxima (regra marginal).
    const restante = fichasAtivas - jaContabilizados;
    const capacidade =
      faixa.ateQuantidade === null
        ? restante
        : faixa.ateQuantidade - jaContabilizados;
    const quantidade = Math.min(restante, capacidade);

    if (quantidade > 0) {
      detalhes.push({
        deQuantidade: jaContabilizados + 1,
        ateQuantidade: jaContabilizados + quantidade,
        quantidade,
        valorUnitarioCentavos: faixa.valorCentavos,
        subtotalCentavos: quantidade * faixa.valorCentavos,
      });
      jaContabilizados += quantidade;
    }
  }

  return detalhes;
}

/**
 * Valor total da mensalidade, em CENTAVOS. É esta função — não a versão em
 * reais — que deve alimentar a integração de cobrança.
 *
 * @throws {RangeError} se `fichasAtivas` não for inteiro finito >= 0.
 */
export function calcularMensalidadeCentavos(fichasAtivas: number): number {
  return detalharMensalidade(fichasAtivas).reduce(
    (total, detalhe) => total + detalhe.subtotalCentavos,
    0,
  );
}

/**
 * Mesma mensalidade em REAIS. Uso exclusivo de exibição/simulação: a divisão
 * por 100 reintroduz ponto flutuante, então nunca somar valores derivados
 * daqui — agregue em centavos e converta só no fim.
 *
 * @throws {RangeError} se `fichasAtivas` não for inteiro finito >= 0.
 */
export function calculateMonthlyFee(fichasAtivas: number): number {
  return calcularMensalidadeCentavos(fichasAtivas) / 100;
}

/**
 * Formata centavos como moeda brasileira ("R$ 745,00").
 *
 * Atenção: o `Intl` usa espaço não-quebrável (U+00A0) entre o símbolo e o
 * número — comparar a string inteira com `"R$ 745,00"` digitado à mão falha.
 * Compare o trecho numérico, ou normalize o espaço antes.
 */
export function formatarBRL(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}
