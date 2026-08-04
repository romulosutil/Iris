"use server";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import {
  ativarProtocolo,
  desativarProtocolo,
  inicializarProtocolosDaClinica,
} from "./protocolo-logic";

// Usadas como `action` de <form> nativo (fire-and-refresh) → retornam void e
// revalidam a rota do cadastro clínico para refletir o novo estado do vínculo.
export async function ativarProtocoloAction(
  patientId: string,
  protocolId: string,
): Promise<void> {
  await ativarProtocolo(await getTenantContext(), patientId, protocolId);
  revalidatePath(`/pacientes/${patientId}/cadastro-clinico`);
}

export async function desativarProtocoloAction(
  patientProtocolId: string,
): Promise<void> {
  await desativarProtocolo(await getTenantContext(), patientProtocolId);
  revalidatePath("/pacientes/[id]/cadastro-clinico", "page");
}

export async function inicializarProtocolosAction(
  patientId: string,
): Promise<void> {
  await inicializarProtocolosDaClinica(await getTenantContext());
  revalidatePath(`/pacientes/${patientId}/cadastro-clinico`);
}
