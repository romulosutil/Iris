"use server";

import { executarRedefinirSenha, type EstadoRedefinirSenha } from "./logic";

/**
 * Wrapper fino (Issue #55 — todo export de módulo `"use server"` é
 * invocável direto pelo cliente, então o núcleo com toda a lógica fica em
 * `logic.ts`, sem diretiva, e só este arquivo é `"use server"`).
 */
export async function redefinirSenha(
  _prev: EstadoRedefinirSenha | null,
  formData: FormData,
): Promise<EstadoRedefinirSenha> {
  return executarRedefinirSenha(formData);
}
