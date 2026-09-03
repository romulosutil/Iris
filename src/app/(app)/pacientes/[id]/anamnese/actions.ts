"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantContext } from "@/auth/tenant";
import { RoleError } from "@/auth/require-role";
import { salvarRascunhoAnamnese, validarAnamnese } from "./logic";
import { salvarRascunhoSchema, validarAnamneseSchema } from "./schemas";
import { logarErroSemPII } from "@/lib/observabilidade/logar-erro";

export type AnamneseActionResult = {
  ok?: boolean;
  error?: string;
  id?: string;
};

/**
 * Salva ou atualiza um rascunho de anamnese (T17/ANAM-02/ANAM-10).
 * Acessível a terapeutas e coordenadores da clínica.
 */
export async function salvarRascunhoAnamneseAction(
  input: z.input<typeof salvarRascunhoSchema>,
): Promise<AnamneseActionResult> {
  try {
    const ctx = await getTenantContext();
    const res = await salvarRascunhoAnamnese(ctx, input);
    if (res.error) return { error: res.error };
    revalidatePath(`/pacientes/${input.patientId}/anamnese`);
    return { ok: true, id: res.id };
  } catch (err) {
    if (err instanceof RoleError) {
      return {
        error:
          "Só coordenador ou terapeuta da equipe salva rascunho de anamnese.",
      };
    }
    logarErroSemPII("salvarRascunhoAnamneseAction:", err);
    return { error: "Não foi possível salvar o rascunho de anamnese." };
  }
}

/**
 * Valida a anamnese e define o marco zero (snapshot 0) do paciente (T17/ANAM-03/ANAM-04).
 * Acesso exclusivo para coordenadores.
 */
export async function validarAnamneseAction(
  patientId: string,
  input: z.input<typeof validarAnamneseSchema>,
): Promise<AnamneseActionResult> {
  try {
    const ctx = await getTenantContext();
    const res = await validarAnamnese(ctx, input);
    if (res.error) return { error: res.error };

    // Revalidação ampla no sucesso da validação (#285)
    revalidatePath(`/pacientes/${patientId}`);
    revalidatePath(`/pacientes/${patientId}/timeline`);
    revalidatePath(`/pacientes/${patientId}/anamnese`);

    return { ok: true, id: res.id };
  } catch (err) {
    if (err instanceof RoleError) {
      return {
        error: "Só coordenador valida a anamnese e define o marco zero.",
      };
    }
    logarErroSemPII("validarAnamneseAction:", err);
    return { error: "Não foi possível validar a anamnese." };
  }
}
