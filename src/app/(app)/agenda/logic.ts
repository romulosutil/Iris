import "server-only";
import { and, asc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import {
  appUser,
  patient,
  session,
  sessionEstado,
  sessionModalidade,
  userRole,
} from "@/db/schema";
import { transicaoPermitida, exigeJustificada } from "@/lib/agenda/transicoes";
import { comEscrita } from "@/lib/billing/guard-escrita";
import { FUSO_CLINICA_OFFSET } from "./fuso";

export type SessionEstado = (typeof sessionEstado.enumValues)[number];

export type SessaoDoDia = {
  id: string;
  agendadaPara: Date;
  estado: SessionEstado;
  terapeutaId: string;
  terapeutaNome: string | null;
  pacienteNome: string | null;
  // Task 8 (reposição): pré-preenchem `/agenda/semana?repor=...` a partir do
  // botão "Repor" numa falta — dispensa uma query extra na hora de montar o
  // link.
  patientId: string;
  disciplina: string;
  modalidade?: string;
};

/**
 * Check-in: o terapeuta (ou recepção/coordenação) marca o início da sessão ao
 * receber o paciente. Presença é registrada em `checkInEm` — o estado NÃO muda
 * (segue `agendada` até a consolidação em `realizada`, Agenda 2.0). Só marca uma
 * vez: a guarda `checkInEm IS NULL` torna a chamada repetida um no-op seguro. O
 * RLS garante que só quem pode tocar a sessão a atualiza.
 */
async function checkInSessaoCore(
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
 * Check-in escreve em `session` → conta em somente-leitura não passa. O guard
 * fica aqui, na exportação, e não no `actions.ts`, para que os testes de
 * integração (que chamam o core direto) exercitem o bloqueio.
 */
export const checkInSessao = comEscrita(checkInSessaoCore);

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
        patientId: session.patientId,
        disciplina: session.disciplina,
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

export type MarcarEstadoInput = {
  sessionId: string;
  estado: SessionEstado;
  justificada?: boolean;
  atendidoPorId?: string | null;
  modalidade?: (typeof sessionModalidade.enumValues)[number];
};

/**
 * Transição de estado da sessão (consolidação pós-atendimento). CAS otimista:
 * o UPDATE só afeta a linha se `estado = 'agendada'` no momento da escrita —
 * sem versão explícita, isso evita "lost update" quando duas pessoas marcam a
 * mesma sessão concorrentemente (0 linhas afetadas → erro "já foi
 * atualizada", em vez de sobrescrever silenciosamente).
 */
async function marcarEstadoCore(
  ctx: TenantContext,
  input: MarcarEstadoInput,
): Promise<{ error?: string; ok?: boolean }> {
  requireRole(ctx, "coordenador", "admin_recepcao", "terapeuta");

  if (!transicaoPermitida("agendada", input.estado)) {
    return { error: "Transição de estado inválida." };
  }

  // Substituto (quem realmente atendeu) tem que ser terapeuta ou coordenador da clínica ativa.
  if (input.atendidoPorId) {
    const ok = await withTenant(ctx, (tx) =>
      tx
        .select({ id: userRole.userId })
        .from(userRole)
        .where(
          and(
            eq(userRole.userId, input.atendidoPorId!),
            eq(userRole.clinicId, ctx.clinicId),
            inArray(userRole.papel, ["terapeuta", "coordenador"]),
          ),
        )
        .limit(1),
    );
    if (ok.length === 0) return { error: "Substituto não é terapeuta desta clínica." };
  }

  const just = exigeJustificada(input.estado) ? (input.justificada ?? false) : null;

  const rows = await withTenant(ctx, (tx) =>
    tx
      .update(session)
      .set({
        estado: input.estado,
        justificada: just,
        ...(input.atendidoPorId !== undefined ? { atendidoPorId: input.atendidoPorId } : {}),
        ...(input.modalidade ? { modalidade: input.modalidade } : {}),
      })
      .where(
        and(
          eq(session.id, input.sessionId),
          eq(session.estado, "agendada"), // CAS: só transiciona de agendada
        ),
      )
      .returning({ id: session.id }),
  );

  if (rows.length === 0) {
    return { error: "Esta sessão já foi atualizada por outra pessoa. Recarregue a página." };
  }
  return { ok: true };
}

/**
 * Consolidação muda `session.estado` → escrita. Bloqueada antes do `requireRole`
 * de propósito: com a conta em somente-leitura a resposta certa é o CTA de
 * ativação, não "sem permissão" — papel e situação da conta são recusas
 * diferentes e a UI reage a cada uma de um jeito.
 */
export const marcarEstado = comEscrita(marcarEstadoCore);
