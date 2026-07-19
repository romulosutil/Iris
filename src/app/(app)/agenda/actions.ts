"use server";
import { revalidatePath } from "next/cache";
import { and, asc, eq, gte, isNull, lt } from "drizzle-orm";
import { getTenantContext } from "@/auth/tenant";
import { withTenant, type TenantContext } from "@/db/rls";
import { appUser, patient, session, sessionEstado } from "@/db/schema";
import { FUSO_CLINICA_OFFSET } from "./fuso";

export type SessionEstado = (typeof sessionEstado.enumValues)[number];

export type SessaoDoDia = {
  id: string;
  agendadaPara: Date;
  estado: SessionEstado;
  terapeutaId: string;
  terapeutaNome: string | null;
  pacienteNome: string | null;
};

/**
 * Check-in: o terapeuta (ou recepção/coordenação) marca o início da sessão ao
 * receber o paciente. Presença é registrada em `checkInEm` — o estado NÃO muda
 * (segue `agendada` até a consolidação em `realizada`, Agenda 2.0). Só marca uma
 * vez: a guarda `checkInEm IS NULL` torna a chamada repetida um no-op seguro. O
 * RLS garante que só quem pode tocar a sessão a atualiza.
 */
export async function checkInSessao(
  ctx: TenantContext,
  sessionId: string,
): Promise<{ error?: string }> {
  if (!sessionId) return { error: "Sessão não informada." };
  const atualizadas = await withTenant(ctx, (tx) =>
    tx
      .update(session)
      .set({ checkInEm: new Date() })
      .where(and(eq(session.id, sessionId), isNull(session.checkInEm)))
      .returning({ id: session.id }),
  );
  if (atualizadas.length === 0) {
    return { error: "Sessão não encontrada ou já iniciada." };
  }
  return {};
}

/**
 * Grade do dia: sessões cuja data (no fuso da clínica, America/Sao_Paulo) é
 * `diaISO`. O RLS já escopa por clínica/papel — coordenação/recepção veem a
 * clínica inteira; terapeuta vê só as próprias sessões ou de pacientes da sua
 * equipe. `pacienteNome` pode vir nulo se o terapeuta não for da equipe do
 * paciente (o RLS de `patient` não libera o nome) — a UI trata isso.
 */
export async function listarSessoesDoDia(
  ctx: TenantContext,
  diaISO: string,
): Promise<SessaoDoDia[]> {
  // Recorte do dia como INTERVALO no fuso da clínica em vez de cast por linha
  // (`AT TIME ZONE ...::date = diaISO`). A comparação de igualdade sobre a
  // coluna transformada é non-sargable e ignora `idx_session_clinic_dia`; um
  // range `>= início AND < fim` sobre a coluna crua usa o índice. Brasil não
  // tem horário de verão desde 2019 → o dia local tem 24h exatas, então
  // início + 24h fecha o dia sem borda de DST.
  const inicioDia = new Date(`${diaISO}T00:00:00${FUSO_CLINICA_OFFSET}`);
  if (Number.isNaN(inicioDia.getTime())) return [];
  const fimDia = new Date(inicioDia.getTime() + 24 * 60 * 60 * 1000);

  return withTenant(ctx, (tx) =>
    tx
      .select({
        id: session.id,
        agendadaPara: session.agendadaPara,
        estado: session.estado,
        terapeutaId: session.terapeutaId,
        terapeutaNome: appUser.name,
        pacienteNome: patient.nome,
      })
      .from(session)
      .leftJoin(patient, eq(patient.id, session.patientId))
      .leftJoin(appUser, eq(appUser.id, session.terapeutaId))
      .where(
        and(
          gte(session.agendadaPara, inicioDia),
          lt(session.agendadaPara, fimDia),
        ),
      )
      .orderBy(asc(session.agendadaPara)),
  );
}

// ─── Wrappers para `useActionState` (resolvem o tenant do request) ────────────

export async function checkInAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext();
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  try {
    const resultado = await checkInSessao(ctx, sessionId);
    if (!resultado.error) revalidatePath("/agenda");
    return resultado;
  } catch (err) {
    console.error("checkInAction: erro inesperado", err);
    return { error: "Não foi possível registrar o check-in." };
  }
}
