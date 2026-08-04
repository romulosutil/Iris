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
 * 2. **Faixas MARGINAIS, não faixa única retroativa.** Cadastrar o 16º
 *    paciente não pode reprecificar os 15 anteriores — a clínica que cresce
 *    nunca vê a conta do mês passado subir sozinha, e o preço por paciente
 *    adicional só cai. Isso torna a curva monótona crescente com incremento
 *    decrescente, o que é a promessa comercial que vendemos.
 */

/** Uma faixa de preço marginal. `ateQuantidade: null` = faixa aberta (última). */
export interface Faixa {
  /** Limite superior INCLUSIVO da faixa; `null` na faixa final, sem teto. */
  readonly ateQuantidade: number | null;
  /** Preço mensal, em centavos, de cada paciente que cai nesta faixa. */
  readonly valorCentavos: number;
}

/** Linha do memorial de cálculo exibido na fatura. */
export interface DetalheFaixa {
  /** Primeiro paciente coberto por esta faixa (1-indexado, inclusivo). */
  readonly deQuantidade: number;
  /** Último paciente coberto por esta faixa (1-indexado, inclusivo). */
  readonly ateQuantidade: number;
  /** Quantos pacientes ativos caíram nesta faixa. */
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
 * Cobrança de ativação do Mês 1: o primeiro paciente cadastrado sai pelo preço
 * cheio da primeira faixa, independente de quando no mês entrou. Exposto como
 * constante própria porque o fluxo de onboarding cobra esse valor isolado,
 * antes de existir ciclo mensal fechado.
 */
export const VALOR_PRIMEIRO_PACIENTE_CENTAVOS = 3900;

/**
 * Rejeita entrada inválida em vez de degradar para 0. Uma contagem de
 * pacientes corrompida que vira "R$ 0,00" silenciosamente é uma fatura errada
 * emitida ao cliente — falha barulhenta é mais barata que receita perdida.
 */
function validarQuantidade(pacientesAtivos: number): void {
  if (!Number.isFinite(pacientesAtivos)) {
    throw new RangeError(
      "Quantidade de pacientes ativos deve ser um número finito; recebido: " +
        String(pacientesAtivos),
    );
  }
  if (!Number.isInteger(pacientesAtivos)) {
    throw new RangeError(
      "Quantidade de pacientes ativos deve ser um número inteiro; recebido: " +
        String(pacientesAtivos),
    );
  }
  if (pacientesAtivos < 0) {
    throw new RangeError(
      "Quantidade de pacientes ativos não pode ser negativa; recebido: " +
        String(pacientesAtivos),
    );
  }
}

/**
 * Memorial de cálculo por faixa. Só devolve faixas efetivamente atingidas —
 * a fatura não deve listar linha com quantidade zero.
 *
 * @throws {RangeError} se `pacientesAtivos` não for inteiro finito >= 0.
 */
export function detalharMensalidade(pacientesAtivos: number): DetalheFaixa[] {
  validarQuantidade(pacientesAtivos);

  const detalhes: DetalheFaixa[] = [];
  let jaContabilizados = 0;

  for (const faixa of FAIXAS_PRECIFICACAO) {
    if (jaContabilizados >= pacientesAtivos) break;

    // Faixa aberta absorve todo o restante; faixa fechada leva só o que cabe
    // até o seu teto, e o excedente segue para a próxima (regra marginal).
    const restante = pacientesAtivos - jaContabilizados;
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
 * @throws {RangeError} se `pacientesAtivos` não for inteiro finito >= 0.
 */
export function calcularMensalidadeCentavos(pacientesAtivos: number): number {
  return detalharMensalidade(pacientesAtivos).reduce(
    (total, detalhe) => total + detalhe.subtotalCentavos,
    0,
  );
}

/**
 * Mesma mensalidade em REAIS. Uso exclusivo de exibição/simulação: a divisão
 * por 100 reintroduz ponto flutuante, então nunca somar valores derivados
 * daqui — agregue em centavos e converta só no fim.
 *
 * @throws {RangeError} se `activePatientsCount` não for inteiro finito >= 0.
 */
export function calculateMonthlyFee(activePatientsCount: number): number {
  return calcularMensalidadeCentavos(activePatientsCount) / 100;
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
