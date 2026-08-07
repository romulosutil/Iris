import "server-only";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";

/**
 * #122 Fatia 4 — pré-requisitos do tenant para o módulo de alerta de risco:
 * responsável técnico, Protocolo de Emergência Interno e a declaração da
 * cláusula 10.3 dos termos de uso.
 *
 * Core ctx-accepting em módulo `server-only`. NUNCA exportar daqui a partir de
 * um `"use server"`: viraria endpoint com ctx forjável → bypass de RLS
 * cross-tenant (#55). Os wrappers ficam em `actions.ts`, e o guard
 * `src/security/ctx-forjavel-guard.test.ts` quebra o CI se isso regredir.
 */

export type EmergenciaResult = { ok: true } | { error: string };

export type UsuarioDaClinica = {
  id: string;
  nome: string;
  papel: string;
};

export type ConfigEmergencia = {
  responsavelTecnicoId: string | null;
  protocoloInterno: string | null;
  declaradoEm: string | null;
  declaradoPorNome: string | null;
};

const salvarSchema = z.object({
  // O responsável técnico é sempre um usuário COM PAPEL NESTA clínica — nunca
  // um contato externo. Validado de novo no UPDATE (subselect em user_role).
  responsavelTecnicoId: z
    .string()
    .uuid("Selecione um responsável técnico válido."),
  protocoloInterno: z
    .string()
    .trim()
    .min(
      10,
      "Descreva o Protocolo de Emergência Interno da clínica — é o texto que o Iris exibe no estágio 2.",
    ),
  declarado: z.literal(true, {
    message:
      "A declaração de que a clínica possui protocolo próprio de atendimento de emergências é obrigatória.",
  }),
});

export type SalvarEmergenciaInput = {
  responsavelTecnicoId: string;
  protocoloInterno: string;
  declarado: boolean;
};

/** Usuários com papel nesta clínica — candidatos a responsável técnico. */
export async function listarUsuariosDaClinica(
  ctx: TenantContext,
): Promise<UsuarioDaClinica[]> {
  return withTenant(ctx, async (tx) => {
    const linhas = (await tx.execute(sql`
      SELECT u.id, u.name AS nome, ur.papel::text AS papel
        FROM user_role ur
        JOIN app_user u ON u.id = ur.user_id
       WHERE ur.clinic_id = ${ctx.clinicId}::uuid
       ORDER BY u.name ASC
    `)) as unknown as Array<Record<string, unknown>>;

    return linhas.map((l) => ({
      id: l.id as string,
      nome: l.nome as string,
      papel: l.papel as string,
    }));
  });
}

export async function lerConfigEmergencia(
  ctx: TenantContext,
): Promise<ConfigEmergencia> {
  return withTenant(ctx, async (tx) => {
    const linhas = (await tx.execute(sql`
      SELECT c.responsavel_tecnico_id,
             c.protocolo_emergencia_interno,
             c.protocolo_emergencia_declarado_em::text AS declarado_em,
             d.name AS declarado_por_nome
        FROM clinic c
        LEFT JOIN app_user d ON d.id = c.protocolo_emergencia_declarado_por
       WHERE c.id = ${ctx.clinicId}::uuid
    `)) as unknown as Array<Record<string, unknown>>;

    const l = linhas[0];
    return {
      responsavelTecnicoId:
        (l?.responsavel_tecnico_id as string | null) ?? null,
      protocoloInterno:
        (l?.protocolo_emergencia_interno as string | null) ?? null,
      declaradoEm: (l?.declarado_em as string | null) ?? null,
      declaradoPorNome: (l?.declarado_por_nome as string | null) ?? null,
    };
  });
}

/**
 * Grava os três campos numa transação só.
 *
 * A declaração é registrada como QUEM e QUANDO (prova de aceite), não como
 * booleano — e é preservada se já existia: reeditar o protocolo não reescreve
 * a data de um aceite anterior nem transfere a autoria para quem só corrigiu
 * um texto.
 */
export async function salvarConfigEmergencia(
  ctx: TenantContext,
  input: SalvarEmergenciaInput,
): Promise<EmergenciaResult> {
  const p = salvarSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]!.message };

  return withTenant(ctx, async (tx) => {
    const alvo = (await tx.execute(sql`
      SELECT 1 FROM user_role
       WHERE clinic_id = ${ctx.clinicId}::uuid
         AND user_id = ${p.data.responsavelTecnicoId}::uuid
       LIMIT 1
    `)) as unknown as Array<unknown>;

    if (alvo.length === 0) {
      return {
        error: "O responsável técnico precisa ser um usuário desta clínica.",
      };
    }

    // #212 — NÃO voltar a fazer `UPDATE clinic` aqui. `clinic` só tem policy
    // de SELECT para `app_role` (0002, deliberado): o UPDATE cru afetava 0
    // linhas em silêncio e a tela devolvia `{ ok: true }` sem gravar nada.
    // A escrita é a função SECURITY DEFINER da 0081, cujo guard interno
    // espelha `clinic_read` + exige coordenador. A clínica não entra por
    // parâmetro — a função lê `app.clinic_id` do próprio contexto da
    // transação, então não há caminho de forjar tenant.
    await tx.execute(sql`
      SELECT app_salvar_config_emergencia(
        ${p.data.responsavelTecnicoId}::uuid,
        ${p.data.protocoloInterno}
      )
    `);

    await tx.execute(sql`
      INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, detalhe)
      VALUES (${ctx.clinicId}::uuid, ${ctx.userId}::uuid,
              'clinica_emergencia_configurada', 'clinic', ${ctx.clinicId}::uuid,
              ${JSON.stringify({ declarado: true })}::jsonb)
    `);

    return { ok: true };
  });
}
