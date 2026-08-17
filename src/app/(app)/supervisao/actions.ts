"use server";

import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { RoleError } from "@/auth/require-role";
import type { TenantContext } from "@/db/rls";
import type { SinalTipo } from "@/lib/supervisao/sinais";
import {
  reconhecerAlerta,
  resolverAlerta,
  descartarAlerta,
  type SupervisaoResult,
  type SupervisaoState,
} from "./logic";
// Re-export do tipo público consumido por `supervisao-fila.tsx` (moveu p/ logic).
export type { SupervisaoState };

// ─── Wrappers para useActionState ──────────────────────────────────────────

async function comCtx(
  fn: (ctx: TenantContext) => Promise<SupervisaoResult>,
): Promise<SupervisaoState> {
  try {
    const ctx = await getTenantContext();
    const r = await fn(ctx);
    if (r.ok) {
      revalidatePath("/supervisao");
      return { ok: true };
    }
    return { error: r.error };
  } catch (err) {
    if (err instanceof RoleError)
      return { error: "Só o coordenador supervisiona." };
    console.error("wrapper supervisao:", err);
    return { error: "Erro interno no servidor." };
  }
}

export async function reconhecerAlertaAction(
  _prev: SupervisaoState,
  fd: FormData,
): Promise<SupervisaoState> {
  return comCtx((ctx) =>
    reconhecerAlerta(ctx, {
      chaveNatural: String(fd.get("chaveNatural") ?? ""),
      tipo: String(fd.get("tipo") ?? "") as SinalTipo,
      patientId: String(fd.get("patientId") ?? ""),
      goalId:
        fd.get("goalId") && String(fd.get("goalId")) !== ""
          ? String(fd.get("goalId"))
          : null,
      protocolId:
        fd.get("protocolId") && String(fd.get("protocolId")) !== ""
          ? String(fd.get("protocolId"))
          : null,
      detalhe: JSON.parse(String(fd.get("detalhe") ?? "{}")),
    }),
  );
}

export async function resolverAlertaAction(
  _prev: SupervisaoState,
  fd: FormData,
): Promise<SupervisaoState> {
  return comCtx((ctx) =>
    resolverAlerta(ctx, {
      chaveNatural: String(fd.get("chaveNatural") ?? ""),
      tipo: String(fd.get("tipo") ?? "") as SinalTipo,
      patientId: String(fd.get("patientId") ?? ""),
      goalId:
        fd.get("goalId") && String(fd.get("goalId")) !== ""
          ? String(fd.get("goalId"))
          : null,
      protocolId:
        fd.get("protocolId") && String(fd.get("protocolId")) !== ""
          ? String(fd.get("protocolId"))
          : null,
      detalhe: JSON.parse(String(fd.get("detalhe") ?? "{}")),
      nota: String(fd.get("nota") ?? ""),
    }),
  );
}

export async function descartarAlertaAction(
  _prev: SupervisaoState,
  fd: FormData,
): Promise<SupervisaoState> {
  return comCtx((ctx) =>
    descartarAlerta(ctx, {
      chaveNatural: String(fd.get("chaveNatural") ?? ""),
      tipo: String(fd.get("tipo") ?? "") as SinalTipo,
      patientId: String(fd.get("patientId") ?? ""),
      goalId:
        fd.get("goalId") && String(fd.get("goalId")) !== ""
          ? String(fd.get("goalId"))
          : null,
      protocolId:
        fd.get("protocolId") && String(fd.get("protocolId")) !== ""
          ? String(fd.get("protocolId"))
          : null,
      detalhe: JSON.parse(String(fd.get("detalhe") ?? "{}")),
      motivo: String(fd.get("motivo") ?? ""),
    }),
  );
}
