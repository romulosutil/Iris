"use server";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { salvarFichaClinica, type FichaClinicaState } from "./logic";

/** Wrapper para `useActionState` (patientId via bind). */
export async function salvarFichaClinicaAction(
  patientId: string,
  _prev: FichaClinicaState,
  formData: FormData,
): Promise<FichaClinicaState> {
  const ctx = await getTenantContext();
  const resultado = await salvarFichaClinica(ctx, patientId, formData);
  if (!resultado.error) {
    revalidatePath(`/pacientes/${patientId}/cadastro-clinico`);
  }
  return resultado;
}
