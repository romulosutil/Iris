"use server";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import {
  arquivarPaciente,
  desarquivarPaciente,
  type ArquivamentoState,
} from "./logic";

/**
 * Wrappers finos de request. O core ctx-accepting fica em `logic.ts`
 * (`server-only`): toda função async exportada daqui é endpoint invocável pelo
 * cliente, então exportar o core deixaria o cliente forjar `ctx` e furar o RLS
 * (Issue #55, guardado por `src/security/ctx-forjavel-guard.test.ts`). O tenant
 * é derivado no servidor, nunca recebido como argumento.
 */
export async function arquivarPacienteAction(
  patientId: string,
  _prev: ArquivamentoState,
  formData: FormData,
): Promise<ArquivamentoState> {
  const motivo = lerMotivo(formData);
  const resultado = await arquivarPaciente(
    await getTenantContext(),
    patientId,
    motivo,
  );
  if (!resultado.error) revalidarPaciente(patientId);
  return resultado;
}

export async function desarquivarPacienteAction(
  patientId: string,
  _prev: ArquivamentoState,
  formData: FormData,
): Promise<ArquivamentoState> {
  const motivo = lerMotivo(formData);
  const resultado = await desarquivarPaciente(
    await getTenantContext(),
    patientId,
    motivo,
  );
  if (!resultado.error) revalidarPaciente(patientId);
  return resultado;
}

/**
 * O `required`/`minLength` do campo é conveniência de UX, não barreira: um
 * POST direto na action chega aqui sem passar por HTML nenhum. Quem recusa é o
 * `motivoArquivamentoSchema` no core — aqui só normalizamos o valor bruto do
 * `FormData` (que pode ser `null` ou um `File`) para string.
 */
function lerMotivo(formData: FormData): string {
  const bruto = formData.get("motivo");
  return typeof bruto === "string" ? bruto : "";
}

/**
 * Arquivar muda a aba em que o paciente aparece (Ativos/Arquivados), então a
 * listagem invalida junto com o prontuário — senão a lista mostra o paciente
 * no lugar antigo até o próximo hard reload.
 */
function revalidarPaciente(patientId: string): void {
  revalidatePath(`/pacientes/${patientId}`);
  revalidatePath("/pacientes");
}
