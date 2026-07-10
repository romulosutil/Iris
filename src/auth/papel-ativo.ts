export type Papel = "coordenador" | "terapeuta" | "admin_recepcao";

export type PapelResolvido = { papel: Papel } | { needsSelection: Papel[] };

/**
 * Resolve o papel ATIVO dado o conjunto de papéis do usuário na clínica ativa.
 * A PK (user_id, clinic_id, papel) permite múltiplos papéis na mesma clínica.
 * - coordenador é superset (vê todo paciente + todo clínico) → se presente, vence.
 * - papel único → usa.
 * - combo disjunto (admin_recepcao + terapeuta, escopos diferentes) → seleção.
 */
export function papelAtivo(papeis: Papel[]): PapelResolvido {
  const unicos = [...new Set(papeis)];
  if (unicos.includes("coordenador")) return { papel: "coordenador" };
  if (unicos.length === 1) return { papel: unicos[0] };
  return { needsSelection: unicos };
}
