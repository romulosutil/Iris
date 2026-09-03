"use server";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { RoleError } from "@/auth/require-role";
import { type TenantContext } from "@/db/rls";
import {
  aprovarExtracao,
  descartarExtracao,
  editarExtracao,
  type CodigoRecusa,
  type ReviewResult,
} from "./logic";
import { logarErroSemPII } from "@/lib/observabilidade/logar-erro";
import { camposEditaveisDe } from "@/lib/extraction/campos-editaveis";
import { rotuloSubtipo } from "./resumo";
import type { ExtractionSubtipo } from "@/lib/extraction/provider";

// Recusas explícitas do core (#532): o código é o contrato com os testes; a
// UI recebe a frase. `CONCURRENCY_ERROR` segue passando cru — a tela já o
// distingue para oferecer "recarregar".
const COPY_RECUSA: Record<CodigoRecusa, string> = {
  SESSAO_SEM_NUMERO:
    "Esta sessão ainda não foi consolidada. Consolide a nota da sessão antes de revisar as extrações.",
  EVIDENCIA_VAZIA:
    "Esta evidência não tem alvo mapeado e não pode ser reaprovada assim. Edite a extração informando o alvo, ou descarte.",
};

// ─── Wrappers para `useActionState` (resolvem o tenant do request) ────────────
// O CORE acima recebe `ctx` (testável); estes wrappers re-derivam o tenant do
// request via getTenantContext — o cliente NUNCA fornece o contexto (não pode
// forjar clínica/papel/usuário).

export type RevisaoState = { error?: string; ok?: boolean };

async function comCtx(
  formData: FormData,
  fn: (
    ctx: TenantContext,
    extractionId: string,
    versao: number,
    justificativaColapso: string | undefined,
  ) => Promise<ReviewResult>,
): Promise<RevisaoState> {
  const ctx = await getTenantContext();
  const sessionId = String(formData.get("sessionId") ?? "");
  const extractionId = String(formData.get("extractionId") ?? "");
  const versao = Number(formData.get("versao") ?? "1");
  // T07 (R-10/R-11): campo opcional só usado quando `podeAutoValidar` colapsa
  // a aprovação e a extração é de fricção alta — a UI (`revisao-lista.tsx`)
  // só renderiza o textarea nesse caso. Ausente nos demais fluxos.
  const justificativaColapsoRaw = formData.get("justificativaColapso");
  const justificativaColapso =
    typeof justificativaColapsoRaw === "string" &&
    justificativaColapsoRaw.trim()
      ? justificativaColapsoRaw
      : undefined;
  try {
    const r = await fn(ctx, extractionId, versao, justificativaColapso);
    if (r.error) {
      if (r.error === "CONCURRENCY_ERROR") {
        return { error: "CONCURRENCY_ERROR" };
      }
      return { error: COPY_RECUSA[r.error as CodigoRecusa] ?? r.error };
    }
    if (!r.ok) return { error: "Extração não encontrada ou já revisada." };
    if (sessionId) {
      revalidatePath(`/revisao/${sessionId}`);
      revalidatePath(`/sessoes/${sessionId}`);
      revalidatePath("/sessoes");
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof RoleError) {
      return { error: "Só o terapeuta da sessão revisa as extrações." };
    }
    logarErroSemPII("wrapper revisão:", err);
    return { error: "Não foi possível registrar a revisão." };
  }
}

export async function aprovarExtracaoAction(
  _prev: RevisaoState,
  formData: FormData,
): Promise<RevisaoState> {
  return comCtx(formData, (ctx, id, versao, justificativaColapso) =>
    aprovarExtracao(ctx, { extractionId: id, versao, justificativaColapso }),
  );
}

export async function descartarExtracaoAction(
  _prev: RevisaoState,
  formData: FormData,
): Promise<RevisaoState> {
  // descartar não usa justificativaColapso — não insere evidence/evidence_revision.
  return comCtx(formData, (ctx, id, versao) =>
    descartarExtracao(ctx, { extractionId: id, versao }),
  );
}

export async function editarExtracaoAction(
  _prev: RevisaoState,
  formData: FormData,
): Promise<RevisaoState> {
  // Guard (#582): o diálogo só oferece os campos que o subtipo REALMENTE tem
  // na raiz do payload (camposEditaveisDe — fonte única, também usada pelo
  // client em revisao-lista.tsx). Um subtipo sem nenhum campo editável (ex.:
  // `cadeia`, que guarda nível de ajuda por ETAPA, não na raiz) não chega a
  // gravar nada — recusa explícita em vez de "salvo com sucesso" mudo. A
  // checagem é redundante com a UI (que já não renderiza o form nesse caso),
  // mas fecha a mesma porta para um POST direto.
  const subtipo = String(formData.get("subtipo") ?? "") as ExtractionSubtipo;
  const camposPermitidos = camposEditaveisDe(subtipo);
  if (camposPermitidos.length === 0) {
    return {
      error: `Extrações do tipo "${rotuloSubtipo(subtipo)}" ainda não podem ser editadas por aqui. Aprove se os dados estiverem certos, ou descarte esta sugestão e registre a correção diretamente na sessão.`,
    };
  }

  // payloadEditado = payload ORIGINAL (JSON no hidden) com os campos corrigidos
  // sobrepostos. Preserva o resto do conteúdo que o terapeuta não tocou; o
  // original imutável fica em `payload` (auditoria — a action core não o toca).
  let base: Record<string, unknown> = {};
  try {
    const raw = String(formData.get("payloadOriginal") ?? "{}");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object")
      base = parsed as Record<string, unknown>;
  } catch {
    base = {};
  }
  const editado: Record<string, unknown> = { ...base };
  for (const campo of camposPermitidos) {
    const v = formData.get(campo);
    if (typeof v === "string" && v.trim() !== "") editado[campo] = v.trim();
  }
  return comCtx(formData, (ctx, id, versao, justificativaColapso) =>
    editarExtracao(ctx, {
      extractionId: id,
      payloadEditado: editado,
      versao,
      justificativaColapso,
    }),
  );
}
