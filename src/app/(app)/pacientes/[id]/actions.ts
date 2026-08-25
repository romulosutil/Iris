"use server";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import {
  arquivarPaciente,
  desarquivarPaciente,
  desfazerAlta,
  registrarAlta,
  type AltaState,
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
 * #352 — alta clínica. Mesmos wrappers finos, mesma revalidação: registrar alta
 * dispara o trigger que arquiva (`patient_alta_arquiva_trg`, `0065`), então o
 * paciente muda de aba na listagem exatamente como no arquivamento manual.
 */
export async function registrarAltaAction(
  patientId: string,
  _prev: AltaState,
  formData: FormData,
): Promise<AltaState> {
  const resultado = await registrarAlta(
    await getTenantContext(),
    patientId,
    lerCampo(formData, "data"),
    lerCampo(formData, "motivo"),
  );
  if (!resultado.error) revalidarPaciente(patientId);
  return resultado;
}

export async function desfazerAltaAction(
  patientId: string,
  _prev: AltaState,
  formData: FormData,
): Promise<AltaState> {
  const resultado = await desfazerAlta(
    await getTenantContext(),
    patientId,
    lerCampo(formData, "motivo"),
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
  return lerCampo(formData, "motivo");
}

/** `FormData.get` devolve `null` ou `File`; o core só aceita string. */
function lerCampo(formData: FormData, campo: string): string {
  const bruto = formData.get(campo);
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
