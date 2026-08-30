"use server";

import { revalidatePath } from "next/cache";
import { requireRole, RoleError } from "@/auth/require-role";
import { getTenantContext } from "@/auth/tenant";
import { cancelarAssinaturaDaClinica } from "@/lib/billing/subscription";
import { iniciarAtivacaoAssinatura, type AtivacaoState } from "./logic";

/**
 * Wrapper de server action. Deriva o tenant do servidor e delega ao núcleo em
 * `logic.ts` — nenhuma função exportada daqui aceita `ctx`, senão viraria um
 * endpoint client-invocável com tenant forjável (#55).
 */
export async function ativarAssinatura(
  _prev: AtivacaoState,
  formData: FormData,
): Promise<AtivacaoState> {
  const ctx = await getTenantContext();
  return iniciarAtivacaoAssinatura(ctx, formData);
}

export type CancelamentoState = { erro?: string; sucesso?: boolean };

/**
 * Cancelamento pela tela (#36, C1). Sem regra de negócio: deriva o tenant,
 * exige coordenador e delega. A assinatura de `formData` existe só porque
 * `useActionState` a exige — nenhum campo dela é lido, e isso é de propósito:
 * o alvo do cancelamento é sempre a clínica do `ctx`, nunca um id que chegue
 * do cliente.
 */
export async function cancelarAssinaturaAction(
  _prev: CancelamentoState,
  _formData: FormData,
): Promise<CancelamentoState> {
  const ctx = await getTenantContext();
  try {
    requireRole(ctx, "coordenador");
  } catch (e) {
    if (e instanceof RoleError) {
      return { erro: "Só a coordenação pode cancelar a assinatura." };
    }
    throw e;
  }

  const r = await cancelarAssinaturaDaClinica(ctx.clinicId);
  if (!r.cancelada) {
    return {
      erro:
        r.motivo === "sem_assinatura"
          ? "Esta clínica não tem assinatura ativa para cancelar."
          : "A assinatura não está em um estado que possa ser cancelado agora.",
    };
  }

  // A tarja de estado da conta mora no layout, e navegação client-side não
  // revalida layout sozinha (#285): sem isto a tela continuaria dizendo
  // "ativa" depois do corte.
  revalidatePath("/", "layout");
  return { sucesso: true };
}
