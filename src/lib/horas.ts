/**
 * Carga horária semanal — formato de exibição, passo e regra de consumo (#203).
 *
 * Fonte única de verdade para as três coisas que, espalhadas por componente,
 * divergem em uma semana:
 *
 *   1. COMO SE EXIBE (D-E). Hora é unidade de tempo, não decimal de planilha.
 *      `2,0h` força o leitor a converter `0,5` para "meia hora" de cabeça, e
 *      `20,0h` carrega um zero que não informa nada. A carga aparece na forma
 *      que o coordenador fala: `30min`, `1h`, `1h30`, `20h`.
 *      O decimal continua sendo a representação de ARMAZENAMENTO e CÁLCULO
 *      (`numeric(4,1)` no banco); a conversão acontece só na borda de exibição.
 *
 *   2. QUAL O PASSO. 30 em 30 minutos, porque é assim que a agenda é marcada.
 *      Espelha os CHECKs `ctm_horas_semana_passo` e `patient_alvo_horas_passo`
 *      da migração 0076 — validar aqui é para dar erro amigável ANTES de o
 *      Postgres estourar, nunca para substituir a constraint.
 *
 *   3. QUEM CONSOME SALDO (D-B/D-C). Usado pela soma SQL de cobertura, pela
 *      validação de alocação e pela UI. Um lugar só, senão a barra e a
 *      validação passam a discordar sobre o mesmo número.
 */

/** Incremento mínimo de carga, em horas. A agenda é marcada de 30 em 30 min. */
export const HORAS_PASSO = 0.5;

/**
 * Teto por vínculo/prescrição, em horas semanais. Não é regra clínica — é rede
 * contra erro de digitação: pega o `200` que era `20` antes de virar uma barra
 * de cobertura em 1000%. Espelha o `<= 60` dos CHECKs da 0076.
 */
export const HORAS_MAX_SEMANA = 60;

/**
 * Papéis de `care_team_membership` que CONSOMEM a carga prescrita.
 *
 * `substituto` consome (D-B): hora entregue é hora entregue — a família recebeu
 * e o convênio conta. `coordenador_referencia` NÃO consome (D-C): é gestão do
 * caso, não carga clínica. Coordenador que também atende ganha um SEGUNDO
 * vínculo como `terapeuta_referencia` — o papel define o consumo, nunca a
 * pessoa.
 */
export const PAPEIS_QUE_CONSOMEM_SALDO = [
  "terapeuta_referencia",
  "substituto",
] as const;

export type PapelQueConsomeSaldo = (typeof PAPEIS_QUE_CONSOMEM_SALDO)[number];

/** O papel deste vínculo desconta do alvo prescrito da disciplina? */
export function papelConsomeSaldo(papel: string): boolean {
  return (PAPEIS_QUE_CONSOMEM_SALDO as readonly string[]).includes(papel);
}

/**
 * Converte o valor cru do banco em número. `numeric` chega como STRING pelo
 * driver `postgres` — somar direto produziria concatenação (`"8" + "12"` =
 * `"812"`), então toda entrada passa por aqui antes de qualquer conta.
 * Retorna `null` para ausente ou não-numérico, nunca `NaN` disfarçado.
 */
export function parseHoras(
  valor: number | string | null | undefined,
): number | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const texto = valor.trim();
  // `Number("")` é 0, não NaN — sem este guard, um input vazio viraria carga
  // zero em vez de "não informado", e a barra afirmaria 0h onde não há dado.
  if (texto === "") return null;
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

/** É múltiplo exato de 30 minutos? Espelha o `(horas * 10)::int % 5 = 0`. */
export function ehMultiploDePasso(horas: number): boolean {
  if (!Number.isFinite(horas)) return false;
  // Compara em minutos inteiros: evita o 0.1+0.2 do ponto flutuante, que faria
  // `horas % 0.5` devolver resto para valores perfeitamente válidos.
  return Math.round(horas * 60) % 30 === 0;
}

/** Carga aceitável para persistir: dentro do passo, positiva e sob o teto. */
export function ehCargaValida(horas: number): boolean {
  return (
    Number.isFinite(horas) &&
    horas > 0 &&
    horas <= HORAS_MAX_SEMANA &&
    ehMultiploDePasso(horas)
  );
}

/**
 * Exibe carga como tempo, não como decimal (D-E).
 *
 *   0    → `0h`      (zero é ausência de carga, não "zero minutos")
 *   0.5  → `30min`
 *   1    → `1h`
 *   1.5  → `1h30`
 *   8.5  → `8h30`
 *   20   → `20h`
 *
 * Sem casa decimal, sem vírgula, sem zero à direita. Só há minutos quando
 * existem — e, pelo passo de 0,5h, os únicos minutos possíveis são `30`.
 * `null`/`undefined`/inválido devolve travessão: ausência de dado é um estado
 * legítimo (vínculo legado sem horas) e não pode virar `0h`, que afirmaria que
 * a carga é zero.
 */
export function formatarHoras(
  valor: number | string | null | undefined,
): string {
  const n = parseHoras(valor);
  if (n === null) return "—";

  const sinal = n < 0 ? "-" : "";
  const totalMin = Math.round(Math.abs(n) * 60);
  if (totalMin === 0) return "0h";

  const h = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (h === 0) return `${sinal}${min}min`;
  if (min === 0) return `${sinal}${h}h`;
  return `${sinal}${h}h${String(min).padStart(2, "0")}`;
}
