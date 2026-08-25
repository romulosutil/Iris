"use server";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { purgarPacienteCore, type ExpurgoState } from "./logic";

/**
 * Wrapper fino de request. O core ctx-accepting fica em `logic.ts`
 * (`server-only`): toda função async exportada daqui é endpoint invocável pelo
 * cliente, então exportar o core deixaria o cliente forjar `ctx` e furar o RLS
 * (Issue #55, guardado por `src/security/ctx-forjavel-guard.test.ts`). O tenant
 * é derivado no servidor, nunca recebido como argumento.
 *
 * O `pacienteId` chega por `bind`, e não pelo `FormData`: um campo escondido no
 * formulário é editável por quem abre o devtools, e o alvo de um expurgo
 * definitivo não é lugar para isso. Continua não sendo barreira — quem forja o
 * POST manda o que quiser —, mas a barreira real é o guard de tenant dentro de
 * `app_purgar_paciente`, não o transporte.
 */
export async function purgarPacienteAction(
  pacienteId: string,
  _prev: ExpurgoState,
  formData: FormData,
): Promise<ExpurgoState> {
  const resultado = await purgarPacienteCore(await getTenantContext(), {
    pacienteId,
    motivo: lerCampo(formData, "motivo"),
    confirmacao: lerCampo(formData, "confirmacao"),
  });

  if (resultado.ok) {
    // A fila perde a linha, e o prontuário some da listagem de pacientes: o
    // expurgo APAGA a linha de `patient`, não a marca. Sem revalidar
    // `/pacientes` o paciente continuaria listado até o próximo hard reload —
    // um nome na tela para um prontuário que não existe mais.
    revalidatePath("/clinica/retencao");
    revalidatePath("/pacientes");
  }

  return resultado;
}

/** `FormData.get` devolve `null` ou `File`; o core só aceita string. */
function lerCampo(formData: FormData, campo: string): string {
  const bruto = formData.get(campo);
  return typeof bruto === "string" ? bruto : "";
}
