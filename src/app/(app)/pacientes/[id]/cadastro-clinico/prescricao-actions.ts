"use server";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import {
  encerrarPrescricao,
  prescreverDisciplina,
  type PrescricaoState,
} from "./prescricao-logic";

/**
 * Únicos pontos de entrada invocáveis pelo cliente. Os núcleos que recebem
 * `ctx` vivem em `./prescricao-logic` (`server-only`, sem `"use server"`) e não
 * podem ser chamados direto — fecha a brecha de `ctx` forjável.
 *
 * A lista de pacientes também é revalidada: o selo `Sem prescrição` (handoff 1)
 * é derivado da existência de prescrição vigente, então sem isto o paciente
 * continuaria marcado como incompleto depois de prescrito.
 */
function revalidar(patientId: string): void {
  revalidatePath(`/pacientes/${patientId}/cadastro-clinico`);
  revalidatePath("/pacientes");
}

export async function prescreverDisciplinaAction(
  patientId: string,
  _prev: PrescricaoState,
  formData: FormData,
): Promise<PrescricaoState> {
  const ctx = await getTenantContext();
  const resultado = await prescreverDisciplina(ctx, patientId, formData);
  if (resultado.ok) revalidar(patientId);
  return resultado;
}

export async function encerrarPrescricaoAction(
  patientId: string,
  disciplina: string,
): Promise<void> {
  const ctx = await getTenantContext();
  await encerrarPrescricao(ctx, patientId, disciplina);
  revalidar(patientId);
}
