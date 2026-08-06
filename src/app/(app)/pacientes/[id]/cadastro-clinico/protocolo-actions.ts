"use server";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import {
  ativarProtocolo,
  desativarProtocolo,
  inicializarProtocolosDaClinica,
} from "./protocolo-logic";
import type { ProtocoloState } from "./protocolo-logic";

/**
 * Actions de `useActionState`, não mais `<form action>` fire-and-refresh.
 *
 * A fatia 3 deu ao núcleo motivos legítimos para RECUSAR (disciplina não
 * prescrita, conta em somente-leitura, vínculo já desfeito em outra aba). Com o
 * retorno `void` anterior, toda recusa era engolida: o coordenador clicava, a
 * página revalidava e nada mudava, sem uma palavra na tela.
 */
export async function ativarProtocoloAction(
  patientId: string,
  protocolId: string,
  _anterior: ProtocoloState,
  _formData: FormData,
): Promise<ProtocoloState> {
  const r = await ativarProtocolo(
    await getTenantContext(),
    patientId,
    protocolId,
  );
  if (r.ok) revalidatePath(`/pacientes/${patientId}/cadastro-clinico`);
  return r;
}

export async function desativarProtocoloAction(
  patientId: string,
  patientProtocolId: string,
  _anterior: ProtocoloState,
  _formData: FormData,
): Promise<ProtocoloState> {
  const r = await desativarProtocolo(
    await getTenantContext(),
    patientProtocolId,
  );
  if (r.ok) revalidatePath(`/pacientes/${patientId}/cadastro-clinico`);
  return r;
}

export async function inicializarProtocolosAction(
  patientId: string,
  _anterior: ProtocoloState,
  _formData: FormData,
): Promise<ProtocoloState> {
  const r = await inicializarProtocolosDaClinica(await getTenantContext());
  if (r.ok) revalidatePath(`/pacientes/${patientId}/cadastro-clinico`);
  return r;
}
