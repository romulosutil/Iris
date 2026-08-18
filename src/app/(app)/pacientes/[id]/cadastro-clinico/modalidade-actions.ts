"use server";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import {
  alterarModalidadeClinica,
  type ModalidadeClinicaState,
} from "./modalidade-logic";

/** Wrapper `useActionState` (patientId via bind), mesmo padrão de `actions.ts`. */
export async function alterarModalidadeClinicaAction(
  patientId: string,
  _prev: ModalidadeClinicaState,
  formData: FormData,
): Promise<ModalidadeClinicaState> {
  const ctx = await getTenantContext();
  const novaModalidade = String(formData.get("clinicalModality") ?? "");
  const resultado = await alterarModalidadeClinica(
    ctx,
    patientId,
    novaModalidade,
  );
  if (resultado.ok) {
    revalidatePath(`/pacientes/${patientId}/cadastro-clinico`);
    revalidatePath(`/pacientes/${patientId}`);
  }
  return resultado;
}
