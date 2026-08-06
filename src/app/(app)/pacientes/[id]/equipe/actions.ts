"use server";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import {
  adicionarMembroEquipe,
  editarMembroEquipe,
  encerrarVinculoEquipe,
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

// Usada como `action` de <form> nativo → retorna void e revalida a rota da equipe.
export async function encerrarVinculoAction(
  membershipId: string,
): Promise<void> {
  await encerrarVinculoEquipe(await getTenantContext(), membershipId);
  revalidatePath("/pacientes/[id]/equipe", "page");
}
