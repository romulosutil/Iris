/**
 * Gate D1 da Exportação Integral — leitura única do "responsável pela conta".
 *
 * Existia em três lugares (`page.tsx`, `motor.ts`, `download.ts`) com três
 * regras diferentes para o mesmo caso: `page.tsx` exigia coordenador quando
 * `clinic.responsavel_conta_id` era nulo, enquanto o motor e o download
 * liberavam qualquer papel. Numa feature cujo produto é o acervo inteiro da
 * clínica em um ZIP, o ramo mais frouxo é o que vale — então ele passa a ser
 * o único, aqui, e é o mais restrito dos três.
 */
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/rls";

export type GateResponsavel = {
  autorizado: boolean;
  clinicaNome: string;
  responsavelId: string | null;
};

/**
 * Resolve o gate na transação corrente (sob RLS do solicitante).
 *
 * Autoriza quando o usuário É o responsável nomeado; quando a clínica ainda
 * não nomeou responsável, só o coordenador passa. Clínica inexistente sob a
 * RLS do chamador nunca autoriza.
 */
export async function carregarGateResponsavel(
  tx: Tx,
  clinicId: string,
  userId: string,
  role: string,
): Promise<GateResponsavel> {
  const rows = (await tx.execute(sql`
    SELECT nome, responsavel_conta_id FROM clinic WHERE id = ${clinicId}
  `)) as unknown as {
    nome: string;
    responsavel_conta_id: string | null;
  }[];

  const clinica = rows?.[0];
  if (!clinica) {
    return { autorizado: false, clinicaNome: "Clínica", responsavelId: null };
  }

  const responsavelId = clinica.responsavel_conta_id ?? null;
  const autorizado =
    responsavelId === userId ||
    (responsavelId === null && role === "coordenador");

  return { autorizado, clinicaNome: clinica.nome, responsavelId };
}
