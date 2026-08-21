import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import {
  anamnese,
  anamneseAlvo,
  goal,
  goalMilestoneMapping,
  milestone,
  patient,
} from "@/db/schema";
import { comEscrita, type BloqueioConta } from "@/lib/billing/guard-escrita";
import { desarquivarPacienteSeArquivado } from "@/lib/patient/desarquivamento";
import { salvarRascunhoSchema, validarAnamneseSchema } from "./schemas";

/**
 * #407 T09 — persistência de rascunho de anamnese (ANAM-02/ANAM-10).
 *
 * Propositalmente NÃO toca a linha do tempo clínica: nenhuma `goal`, nenhum
 * `session_snapshot`. Um rascunho é material de trabalho do avaliador — só
 * vira meta/marco quando validado (T10/T14). Por isso este core não chama
 * `criarMeta` nem `desarquivarPacienteSeArquivado` (aquele é o efeito colateral
 * que `criarMetaCore`, em `../metas/logic.ts`, dispara — e que aqui não pode
 * acontecer).
 */
type AnamneseState = { error?: string; bloqueioConta?: BloqueioConta };

async function salvarRascunhoAnamneseCore(
  ctx: TenantContext,
  input: z.input<typeof salvarRascunhoSchema>,
): Promise<AnamneseState & { id?: string }> {
  requireRole(ctx, "coordenador", "terapeuta");
  const parsed = salvarRascunhoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const d = parsed.data;
  try {
    return await withTenant(ctx, async (tx) => {
      const [row] = await tx
        .insert(anamnese)
        .values({
          clinicId: ctx.clinicId,
          patientId: d.patientId,
          protocolId: d.protocolId ?? null,
          nivelEntradaSugerido: d.nivelEntradaSugerido ?? null,
          sugestaoAceita: d.sugestaoAceita ?? null,
          observacoes: d.observacoes ?? null,
          complementaAnamneseId: d.complementaAnamneseId ?? null,
          estado: "rascunho",
          criadoPor: ctx.userId,
        })
        .returning({ id: anamnese.id });
      await tx.insert(anamneseAlvo).values(
        d.alvos.map((alvo) => ({
          anamneseId: row!.id,
          clinicId: ctx.clinicId,
          patientId: d.patientId,
          eixo: alvo.eixo,
          descricao: alvo.descricao,
          disciplina: alvo.disciplina ?? null,
          milestoneId: alvo.milestone_id ?? null,
          nivelAjudaInicial: alvo.nivel_ajuda_inicial,
          procedencia: alvo.procedencia,
          criterioN: alvo.criterio_n,
          criterioM: alvo.criterio_m,
          cicloRevisaoSemanas: alvo.ciclo_revisao_semanas,
        })),
      );
      return { id: row!.id };
    });
  } catch (err) {
    console.error("salvarRascunhoAnamnese:", err);
    return { error: "Não foi possível salvar o rascunho de anamnese." };
  }
}

export const salvarRascunhoAnamnese = comEscrita(salvarRascunhoAnamneseCore);

/**
 * Mesma âncora UTC de `proximaRevisaoISO` em `../metas/logic.ts` — não
 * exportada de lá (módulo separado), então repetida aqui em vez de importada
 * entre arquivos de domínio distintos.
 */
function proximaRevisaoISO(semanas: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + semanas * 7);
  return d.toISOString().slice(0, 10);
}

/**
 * #407 T10 — publica uma anamnese em rascunho: cria uma `goal` por alvo (já
 * `ativa`, nunca `rascunho` — `contaComoAlvo` exclui rascunho e deixaria o
 * hexágono nulo), monta `repertorio_state`/`segmentacao` e chama o definer
 * `app_validar_anamnese` (T05), que grava o snapshot 0 e marca a anamnese
 * como validada. Os gates de negócio (modalidade, protocolo/taxonomia,
 * consentimento) vivem no definer e em T11-T13 — aqui é só a mecânica de
 * publicação. Um único `withTenant`: se o definer der RAISE, os INSERTs de
 * `goal` e o desarquivamento revertem junto.
 */
async function validarAnamneseCore(
  ctx: TenantContext,
  input: z.input<typeof validarAnamneseSchema>,
): Promise<AnamneseState & { id?: string }> {
  // T14 (ANAM-03 / D-B): A validação de anamnese é exclusiva de coordenador.
  // Esta é uma decisão nova do design (D-B), não herança: metas/logic.ts:41 deixa
  // terapeuta criar meta avulsa, mas a publicação do marco zero (snapshot 0) requer coordenador.
  requireRole(ctx, "coordenador");
  const parsed = validarAnamneseSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const { anamneseId } = parsed.data;
  try {
    return await withTenant(ctx, async (tx) => {
      const [anamneseRow] = await tx
        .select({ id: anamnese.id, patientId: anamnese.patientId })
        .from(anamnese)
        .where(
          and(eq(anamnese.id, anamneseId), eq(anamnese.estado, "rascunho")),
        );
      if (!anamneseRow) {
        return { error: "Anamnese não encontrada ou já validada." };
      }

      // T11 — gate de modalidade: allowlist explícita em "protocol_driven".
      // Default do schema (schema.ts:408-410) é 'protocol_driven' e modalidade.ts:58-63
      // trata desconhecido como protocolo — negar só 'conventional' deixaria
      // modalidade nova/desconhecida passar sem gate. Logo, usamos ===.
      const [pacienteRow] = await tx
        .select({ modalidade: patient.clinicalModality })
        .from(patient)
        .where(eq(patient.id, anamneseRow.patientId));
      if (pacienteRow?.modalidade === "protocol_driven") {
        // allow — anamnese só é possível em protocol_driven
      } else {
        return { error: "ANAMNESE_MODALIDADE_INCOMPATIVEL" };
      }

      const alvos = await tx
        .select()
        .from(anamneseAlvo)
        .where(eq(anamneseAlvo.anamneseId, anamneseId));

      // T15 (ANAM-08): Segunda barreira do teto de 24 alvos (D-C).
      // O teto de 24 é deliberado (4 alvos por eixo × 6 eixos) para evitar
      // sobrecarga do prontuário no marco zero. Enquanto criarMeta avulsa não tem
      // limite, a validação de anamnese exige alvos <= 24.
      if (alvos.length > 24) {
        return { error: "ANAMNESE_TETO_ALVOS" };
      }
      if (alvos.length === 0) {
        return { error: "ANAMNESE_SEM_ALVOS" };
      }

      const repertorio: Record<
        string,
        {
          nivel_ajuda_recente: number | null;
          contagem: number;
          is_candidata: boolean;
          origem: "anamnese";
          procedencia: string;
        }
      > = {};
      const segmentacao: Record<
        string,
        Record<
          string,
          { tipo_estrutura: string; metrica: "nivel_ajuda"; rotulo: string }
        >
      > = {};

      for (const alvo of alvos) {
        const [goalRow] = await tx
          .insert(goal)
          .values({
            patientId: anamneseRow.patientId,
            clinicId: ctx.clinicId,
            descricao: alvo.descricao,
            disciplina: alvo.disciplina,
            estado: "ativa",
            criterioDominio: {
              tipo: "n_acertos_m_sessoes",
              n: alvo.criterioN,
              m: alvo.criterioM,
            },
            cicloRevisaoSemanas: alvo.cicloRevisaoSemanas,
            proximaRevisaoEm: proximaRevisaoISO(alvo.cicloRevisaoSemanas),
            criadoPor: ctx.userId,
          })
          .returning({ id: goal.id });
        const goalId = goalRow!.id;

        if (alvo.milestoneId) {
          await tx
            .insert(goalMilestoneMapping)
            .values({ goalId, milestoneId: alvo.milestoneId });

          const [marco] = await tx
            .select({
              tipoEstrutura: milestone.tipoEstrutura,
              nome: milestone.nome,
              protocolId: milestone.protocolId,
            })
            .from(milestone)
            .where(eq(milestone.id, alvo.milestoneId));
          if (marco) {
            segmentacao[goalId] = {
              [marco.protocolId]: {
                tipo_estrutura: marco.tipoEstrutura,
                metrica: "nivel_ajuda",
                rotulo: marco.nome,
              },
            };
          }
        }

        await tx
          .update(anamneseAlvo)
          .set({ goalId })
          .where(eq(anamneseAlvo.id, alvo.id));

        repertorio[goalId] = {
          nivel_ajuda_recente: alvo.nivelAjudaInicial ?? null,
          contagem: 0,
          is_candidata: false,
          origem: "anamnese",
          procedencia: alvo.procedencia,
        };
      }

      await desarquivarPacienteSeArquivado(
        tx,
        ctx,
        anamneseRow.patientId,
        "validacao_anamnese",
      );

      await tx.execute(
        sql`SELECT app_validar_anamnese(${anamneseId}::uuid, ${JSON.stringify(repertorio)}::jsonb, ${JSON.stringify(segmentacao)}::jsonb)`,
      );

      return { id: anamneseId };
    });
  } catch (err) {
    console.error("validarAnamnese:", err);
    return { error: "Não foi possível validar a anamnese." };
  }
}

export const validarAnamnese = comEscrita(validarAnamneseCore);
