/**
 * Faixas de corte de PHQ-9/GAD-7 — módulo PURO (sem React, sem "server-only").
 *
 * Extraído de `app/(app)/pacientes/[id]/tcc/instrumento-lista.tsx` (#464): a
 * projeção de `historico_relevante` do modo TCC (`historico-relevante.ts`)
 * precisa da MESMA régua que a tela mostra, e importar o `.tsx` de dentro de
 * `src/lib` arrastaria a árvore de componentes de UI para o caminho da
 * extração. A tela reexporta daqui — os cortes continuam com UMA fonte.
 *
 * Cortes públicos/estrutura confirmada, não conteúdo licenciado (#393
 * spec.md RQ8 + Invariantes: "estrutura numérica... pode ser hardcoded — só o
 * TEXTO dos itens é gated"). PHQ-9 (0-27) e GAD-7 (0-21) têm faixas
 * diferentes; GAD-7 não tem a banda "moderadamente grave" (só 4 faixas, não 5).
 *
 * Boundaries são inclusivos no limite inferior de cada faixa (>=), testados
 * nos dois lados (ex.: PHQ-9 4 vs. 5) — off-by-one é o bug clássico aqui.
 */

export type TipoInstrumento = "phq9" | "gad7";

const CORTES_PHQ9 = [
  { min: 0, rotulo: "mínimo" },
  { min: 5, rotulo: "leve" },
  { min: 10, rotulo: "moderado" },
  { min: 15, rotulo: "moderadamente grave" },
  { min: 20, rotulo: "grave" },
] as const;

const CORTES_GAD7 = [
  { min: 0, rotulo: "mínimo" },
  { min: 5, rotulo: "leve" },
  { min: 10, rotulo: "moderado" },
  { min: 15, rotulo: "grave" },
] as const;

/**
 * Deriva a faixa de corte (label) a partir do tipo de instrumento e do
 * escore total. `escoreTotal === null` (não deveria acontecer em produção, a
 * coluna é preenchida no INSERT — mas o tipo da coluna no schema é nullable)
 * retorna `null` em vez de estourar.
 */
export function derivarFaixaDeCorte(
  tipoInstrumento: TipoInstrumento,
  escoreTotal: number | null,
): string | null {
  if (escoreTotal === null) return null;
  const cortes = tipoInstrumento === "phq9" ? CORTES_PHQ9 : CORTES_GAD7;
  // Percorre de trás para frente: primeiro corte cujo `min` o escore atinge.
  for (let i = cortes.length - 1; i >= 0; i -= 1) {
    if (escoreTotal >= cortes[i]!.min) return cortes[i]!.rotulo;
  }
  return cortes[0]!.rotulo;
}
