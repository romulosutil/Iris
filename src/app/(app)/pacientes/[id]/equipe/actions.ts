"use server";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import {
  adicionarMembroEquipe,
  editarMembroEquipe,
  encerrarVinculoEquipe,
  type EncerramentoResultado,
} from "./logic";

/** Wrapper de request — deriva o tenant do servidor. */
export async function adicionarMembroEquipeAction(
  patientId: string,
  _prev: { error?: string },
  formData: FormData,
) {
  const resultado = await adicionarMembroEquipe(
    await getTenantContext(),
    patientId,
    formData,
  );
  if (!resultado.error) revalidatePath(`/pacientes/${patientId}/equipe`);
  return resultado;
}

/**
 * Edita disciplina/papel/horas de um vínculo vigente (#203, fatia 4).
 *
 * Existe para que corrigir horas não exija encerrar o vínculo — encerrar corta
 * o acesso ao prontuário (D-A) e registra uma saída que não aconteceu.
 */
export async function editarMembroEquipeAction(
  patientId: string,
  membershipId: string,
  _prev: { error?: string },
  formData: FormData,
) {
  const resultado = await editarMembroEquipe(
    await getTenantContext(),
    patientId,
    membershipId,
    formData,
  );
  if (!resultado.error) revalidatePath(`/pacientes/${patientId}/equipe`);
  return resultado;
}

/**
 * Encerra o vínculo e DEVOLVE o resultado (#203, fatia 6).
 *
 * Antes retornava `void`: o encerramento acontecia e a tela só piscava. Duas
 * coisas acontecem no mesmo ato — as horas voltam para o saldo e o profissional
 * perde o acesso ao prontuário na hora (D-A) — e o coordenador precisa ler as
 * duas. Por isso a assinatura é de `useActionState`: o toast é montado a partir
 * de `disciplina`, `horasDevolvidas` e `saldoTexto`.
 */
export async function encerrarVinculoAction(
  patientId: string,
  membershipId: string,
  _prev: EncerramentoResultado,
): Promise<EncerramentoResultado> {
  const resultado = await encerrarVinculoEquipe(
    await getTenantContext(),
    membershipId,
  );
  if (resultado.ok) revalidatePath(`/pacientes/${patientId}/equipe`);
  return resultado;
}
