import "server-only";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";

/**
 * #122 — transições de estado do alerta de risco clínico.
 *
 * "Reconhecer" é ciência humana explícita ("estou ciente, estou avaliando") e é
 * DISTINTO de "resolver" (o caso foi encerrado com conduta registrada). A
 * separação existe porque o prazo mede a chegada da ciência, não a conclusão do
 * atendimento — o Iris não tem como saber quando um atendimento terminou, e
 * fingir que sabe seria a promessa que o parecer proíbe.
 *
 * Core ctx-accepting em módulo `server-only`: NUNCA exportar destas funções a
 * partir de um módulo `"use server"`, senão viram endpoint com ctx forjável
 * (#55). Os wrappers ficam em `actions.ts`.
 */

export type RiscoResult = { ok: true } | { error: string };

const idSchema = z.object({
  alertaId: z.string().uuid("Alerta inválido."),
});

const resolverSchema = idSchema.extend({
  conduta: z
    .string()
    .trim()
    .min(
      10,
      "Descreva a conduta adotada — o registro é a prova de diligência do profissional.",
    ),
});

const descartarSchema = idSchema.extend({
  motivo: z
    .string()
    .trim()
    .min(
      10,
      "Descreva por que o sinal não é risco. Descarte nunca é silencioso.",
    ),
});

/** Só transições a partir de estados vivos; terminal não volta atrás. */
const VIVOS = sql`('aberto','reconhecido','escalado_estagio_1','escalado_estagio_2')`;

async function aplicar(
  ctx: TenantContext,
  alertaId: string,
  mutacao: (autor: string) => ReturnType<typeof sql>,
  acao: string,
  detalheAudit: Record<string, unknown>,
): Promise<RiscoResult> {
  return withTenant(ctx, async (tx) => {
    // Lock por alerta + re-check: padrão de concorrência do repo (advisory lock,
    // sem coluna de versão). Dois destinatários notificados ao mesmo tempo
    // clicando "reconhecer" juntos é o caso normal, não a exceção.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${alertaId}::text, 0))`,
    );

    const atual = (await tx.execute(sql`
      SELECT status, patient_id FROM alerta_risco_clinico
       WHERE id = ${alertaId}::uuid AND deletado_em IS NULL
    `)) as unknown as Array<{ status: string; patient_id: string | null }>;

    if (atual.length === 0) {
      // Mesma mensagem para "não existe" e "não é seu": não virar oráculo de
      // UUID de outra clínica (padrão de 0045).
      return { error: "Alerta inexistente ou sem permissão." };
    }
    if (!sqlIncluiVivo(atual[0]!.status)) {
      return { error: "Este alerta já foi encerrado." };
    }

    await tx.execute(mutacao(ctx.userId));

    await tx.execute(sql`
      INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
      VALUES (${ctx.clinicId}::uuid, ${ctx.userId}::uuid, ${acao},
              'alerta_risco_clinico', ${alertaId}::uuid, ${atual[0]!.patient_id},
              ${JSON.stringify(detalheAudit)}::jsonb)
    `);

    return { ok: true };
  });
}

function sqlIncluiVivo(status: string): boolean {
  return [
    "aberto",
    "reconhecido",
    "escalado_estagio_1",
    "escalado_estagio_2",
  ].includes(status);
}

/**
 * Ciência humana explícita. Qualquer um dos destinatários serve — a RLS já
 * define quem enxerga o alerta, e quem enxerga pode reconhecer.
 *
 * Reconhecer PARA o escalonamento (o job só varre `aberto`), e é por isso que
 * não exige papel de coordenador: exigir coordenador faria o terapeuta que está
 * com o caso na mão não conseguir estancar o relógio.
 */
export async function reconhecerAlertaRisco(
  ctx: TenantContext,
  input: { alertaId: string },
): Promise<RiscoResult> {
  const p = idSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]!.message };

  return aplicar(
    ctx,
    p.data.alertaId,
    (autor) => sql`
      UPDATE alerta_risco_clinico
         SET status = 'reconhecido',
             reconhecido_por = ${autor}::uuid,
             reconhecido_em = now(),
             atualizado_por = ${autor}::uuid,
             atualizado_em = now()
       WHERE id = ${p.data.alertaId}::uuid
         AND status IN ${VIVOS}
    `,
    "alerta_risco_reconhecido",
    { transicao: "reconhecido" },
  );
}

/** Encerra o caso com a conduta humana registrada. */
export async function resolverAlertaRisco(
  ctx: TenantContext,
  input: { alertaId: string; conduta: string },
): Promise<RiscoResult> {
  const p = resolverSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]!.message };

  return aplicar(
    ctx,
    p.data.alertaId,
    (autor) => sql`
      UPDATE alerta_risco_clinico
         SET status = 'resolvido',
             conduta_registrada = ${p.data.conduta},
             atualizado_por = ${autor}::uuid,
             atualizado_em = now()
       WHERE id = ${p.data.alertaId}::uuid
         AND status IN ${VIVOS}
    `,
    "alerta_risco_resolvido",
    { transicao: "resolvido" },
  );
}

/**
 * Avaliado como não-risco após revisão humana. NUNCA apaga o registro — a linha
 * fica com o motivo, porque "descartei e depois aconteceu" precisa ser
 * auditável tanto para a clínica quanto para a defesa do profissional.
 */
export async function descartarAlertaRisco(
  ctx: TenantContext,
  input: { alertaId: string; motivo: string },
): Promise<RiscoResult> {
  const p = descartarSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]!.message };

  return aplicar(
    ctx,
    p.data.alertaId,
    (autor) => sql`
      UPDATE alerta_risco_clinico
         SET status = 'descartado',
             motivo_descarte = ${p.data.motivo},
             atualizado_por = ${autor}::uuid,
             atualizado_em = now()
       WHERE id = ${p.data.alertaId}::uuid
         AND status IN ${VIVOS}
    `,
    "alerta_risco_descartado",
    { transicao: "descartado" },
  );
}
