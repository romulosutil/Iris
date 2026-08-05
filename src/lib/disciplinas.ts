/**
 * Taxonomia e utilitários para padronização de disciplinas clínicas no Iris.
 */

export const DISCIPLINAS_PADRAO = [
  { id: "ABA", nome: "ABA / Psicologia Comportamental", sigla: "ABA" },
  { id: "Fonoaudiologia", nome: "Fonoaudiologia", sigla: "FONO" },
  { id: "Terapia Ocupacional", nome: "Terapia Ocupacional", sigla: "TO" },
  { id: "Psicopedagogia", nome: "Psicopedagogia", sigla: "PSP" },
  { id: "Fisioterapia", nome: "Fisioterapia", sigla: "FISIO" },
  { id: "Psicologia", nome: "Psicologia Geral", sigla: "PSI" },
  { id: "Psicomotricidade", nome: "Psicomotricidade", sigla: "PSM" },
] as const;

export type DisciplinaPadraoId = (typeof DISCIPLINAS_PADRAO)[number]["id"];

/**
 * Normaliza o rótulo de uma disciplina para exibição amigável.
 */
export function formatarDisciplina(disciplina: string): string {
  const encontrada = DISCIPLINAS_PADRAO.find(
    (d) => d.id.toLowerCase() === disciplina.trim().toLowerCase(),
  );
  return encontrada ? encontrada.nome : disciplina;
}

/**
 * Retorna a sigla amigável para badges compactas de disciplina.
 */
export function siglaDisciplina(disciplina: string): string {
  const encontrada = DISCIPLINAS_PADRAO.find(
    (d) => d.id.toLowerCase() === disciplina.trim().toLowerCase(),
  );
  return encontrada ? encontrada.sigla : disciplina.substring(0, 3).toUpperCase();
}
