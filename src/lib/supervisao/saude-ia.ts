/**
 * DA-01 (#535): helpers puros do bloco "Saúde da IA" (/supervisao).
 * Sem acesso a banco, sem React — testados em `saude-ia.test.ts`.
 */

/**
 * "≥70% de aprovação sem edição" (PRODUCT.md:34, modelo-de-negocio.md:279).
 * Denominador = o que já foi REVISADO (aprovada + editada + descartada).
 * Sugestão ainda na fila não é acerto nem erro; incluí-la deprimiria a taxa
 * de uma semana recente só porque o coordenador ainda não chegou nela.
 * Nada revisado → `taxa: null` (não 0%, não 100%).
 */
export function taxaAprovacaoSemEdicao(l: {
  aprovadasSemEdicao: number;
  editadas: number;
  descartadas: number;
}): { revisadas: number; taxa: number | null } {
  const revisadas = l.aprovadasSemEdicao + l.editadas + l.descartadas;
  if (revisadas === 0) return { revisadas, taxa: null };
  return {
    revisadas,
    taxa: Math.round((l.aprovadasSemEdicao / revisadas) * 100),
  };
}

const fmt1 = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const fmt0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const fmtAte1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** Mediana de tempo até revisão: escolhe a unidade em que o número é legível. */
export function formatarDuracaoSegundos(segundos: number | null): string {
  if (segundos === null || !Number.isFinite(segundos)) return "—";
  if (segundos < 60) return `${fmt0.format(segundos)} s`;
  if (segundos < 3600) return `${fmt0.format(segundos / 60)} min`;
  if (segundos < 86400 * 2) return `${fmtAte1.format(segundos / 3600)} h`;
  return `${fmt0.format(segundos / 86400)} dias`;
}

/** Latência da chamada de IA: ms abaixo de 1 s, senão segundos com 1 casa. */
export function formatarLatenciaMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${fmt0.format(ms)} ms`;
  return `${fmt1.format(ms / 1000)} s`;
}

/** `2026-W36` + `2026-08-31` → `Semana 36 · 31/08` (segunda-feira da semana ISO). */
export function formatarSemana(
  semanaIso: string,
  semanaInicio: string,
): string {
  const w = semanaIso.split("-W")[1] ?? semanaIso;
  const [, m, d] = semanaInicio.split("-");
  return `Semana ${w} · ${d}/${m}`;
}

/** Inteiro em pt-BR; `null` = não medido. */
export function formatarInteiro(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return fmt0.format(n);
}
