"use server";
import { revalidatePath } from "next/cache";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { appUser, patient, session, sessionEstado, userRole } from "@/db/schema";
import { FUSO_CLINICA_OFFSET } from "./fuso";

export type SessionEstado = (typeof sessionEstado.enumValues)[number];

export type AgendarState = { error?: string };

export type SessaoDoDia = {
  id: string;
  agendadaPara: Date;
  estado: SessionEstado;
  terapeutaId: string;
  terapeutaNome: string | null;
  pacienteNome: string | null;
};

const agendarSchema = z.object({
  patientId: z.string().uuid("Selecione um paciente válido."),
  terapeutaId: z.string().uuid("Selecione um profissional válido."),
  agendadaPara: z.string().min(1, "Data e hora são obrigatórias."),
});

/**
 * O `<input type="datetime-local">` envia uma string SEM fuso ("2026-07-11T12:00").
 * `new Date()` sobre ela assume o fuso do servidor (UTC no VPS) — a sessão
 * marcada às 12:00 viraria 09:00 ao exibir em São Paulo. Ancoramos a string
 * naive no fuso da clínica antes de instanciar. Strings que já trazem fuso
 * (`Z` ou `±HH:MM`) passam intactas.
 */
function ancorarNoFusoDaClinica(local: string): string {
  if (/(Z|[+-]\d{2}:\d{2})$/.test(local)) return local;
  const comSegundos = /T\d{2}:\d{2}$/.test(local) ? `${local}:00` : local;
  return `${comSegundos}${FUSO_CLINICA_OFFSET}`;
}

/**
 * Núcleo testável do agendamento. Marcar sessão é ato administrativo da agenda —
 * recepção e coordenação. O RLS ainda fecha o tenant (paciente e profissional
 * têm que ser da clínica ativa); aqui só validamos a entrada e traduzimos a
 * rejeição do banco numa mensagem amigável.
 */
export async function agendarSessao(
  ctx: TenantContext,
  formData: FormData,
): Promise<AgendarState & { id?: string }> {
  requireRole(ctx, "admin_recepcao", "coordenador");

  const parsed = agendarSchema.safeParse({
    patientId: String(formData.get("patientId") ?? "").trim(),
    terapeutaId: String(formData.get("terapeutaId") ?? "").trim(),
    agendadaPara: String(formData.get("agendadaPara") ?? "").trim(),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const quando = new Date(ancorarNoFusoDaClinica(parsed.data.agendadaPara));
  if (Number.isNaN(quando.getTime())) return { error: "Data e hora inválidas." };

  // O RLS garante que o profissional é da clínica, mas não que ele é TERAPEUTA
  // — sem isto, um erro de digitação vincularia a sessão a um coordenador ou à
  // recepção. Exige uma role `terapeuta` na clínica ativa (quem coordena e
  // também atende tem as duas roles em `user_role`). O `user_role_read` do RLS
  // já escopa por clínica, então isto também barra id de outra clínica.
  const ehTerapeuta = await withTenant(ctx, (tx) =>
    tx
      .select({ papel: userRole.papel })
      .from(userRole)
      .where(
        and(
          eq(userRole.userId, parsed.data.terapeutaId),
          eq(userRole.clinicId, ctx.clinicId),
          eq(userRole.papel, "terapeuta"),
        ),
      )
      .limit(1),
  );
  if (ehTerapeuta.length === 0) {
    return {
      error: "O profissional selecionado não é um terapeuta desta clínica.",
    };
  }

  try {
    const id = await withTenant(ctx, async (tx) => {
      const [nova] = await tx
        .insert(session)
        .values({
          clinicId: ctx.clinicId,
          patientId: parsed.data.patientId,
          terapeutaId: parsed.data.terapeutaId,
          agendadaPara: quando,
        })
        .returning({ id: session.id });
      return nova!.id;
    });
    return { id };
  } catch {
    // WITH CHECK do RLS barra paciente/profissional de outra clínica.
    return {
      error: "Não foi possível agendar: paciente ou profissional inválido.",
    };
  }
}

/**
 * Check-in: o terapeuta (ou recepção/coordenação) marca o início da sessão ao
 * receber o paciente. Só transiciona a partir de `agendada` — chamada repetida
 * é no-op segura. O RLS garante que só quem pode tocar a sessão a atualiza.
 */
export async function checkInSessao(
  ctx: TenantContext,
  sessionId: string,
): Promise<{ error?: string }> {
  if (!sessionId) return { error: "Sessão não informada." };
  const atualizadas = await withTenant(ctx, (tx) =>
    tx
      .update(session)
      .set({ estado: "presente", checkInEm: new Date() })
      .where(and(eq(session.id, sessionId), eq(session.estado, "agendada")))
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
        sql`(${session.agendadaPara} AT TIME ZONE 'America/Sao_Paulo')::date = ${diaISO}::date`,
      )
      .orderBy(asc(session.agendadaPara)),
  );
}

// ─── Wrappers para `useActionState` (resolvem o tenant do request) ────────────

export async function agendarSessaoAction(
  _prev: AgendarState,
  formData: FormData,
): Promise<AgendarState> {
  const ctx = await getTenantContext();
  try {
    const resultado = await agendarSessao(ctx, formData);
    if (resultado.error) return { error: resultado.error };
    revalidatePath("/agenda");
    return {};
  } catch {
    // `requireRole` lança em papel não autorizado. Sem este catch, a Server
    // Action estoura 500 e cai no ErrorBoundary — capturamos e devolvemos a
    // mensagem ao `useActionState` para exibir na tela.
    return { error: "Você não tem permissão para agendar sessões." };
  }
}

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
  } catch {
    return { error: "Não foi possível registrar o check-in." };
  }
}
