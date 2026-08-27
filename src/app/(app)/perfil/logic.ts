import "server-only";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";

/**
 * D56 — declaração de cadastro ativo no e-Psi (Resolução CFP nº 009/2024),
 * especificada em `docs/legal/aditivo-especificacoes-legais.md` §1.3 e §4.
 *
 * É AUTODECLARAÇÃO: o profissional declara o próprio cadastro. Não existe
 * consulta à base do CFP (o §1.3 diz textualmente que o sistema não precisa
 * consultar API governamental, e não há API pública do e-Psi), e nenhum fluxo
 * do produto é bloqueado pelo valor — em particular `session.modalidade =
 * 'online'` segue livre. O campo é respaldo preventivo em fiscalização, não
 * barreira.
 *
 * Core ctx-accepting em módulo `server-only`. NUNCA exportar daqui a partir de
 * um `"use server"`: viraria endpoint com ctx forjável → bypass de RLS
 * cross-tenant (#55). Os wrappers ficam em `actions.ts`, e o guard
 * `src/security/ctx-forjavel-guard.test.ts` quebra o CI se isso regredir.
 */

export type PerfilResult = { ok: true } | { error: string };

export type PerfilProfissional = {
  nome: string;
  email: string;
  conselho: string | null;
  registroNumero: string | null;
  registroUf: string | null;
  ePsiVerified: boolean;
  ePsiNumber: string | null;
  ePsiDeclaradoEm: string | null;
};

export type DeclararEPsiInput = {
  declarado: boolean;
  numero: string;
};

/**
 * O número do e-Psi é texto livre de propósito: o CFP não publica um formato
 * estável, e chumbar máscara aqui só produziria recusa de valor válido. O que
 * a validação garante é o que importa juridicamente — marcar a caixa sem
 * informar o número não é declaração, é uma caixa marcada.
 */
const declararSchema = z
  .object({
    declarado: z.boolean(),
    numero: z
      .string()
      .trim()
      .max(60, "O número do e-Psi tem no máximo 60 caracteres."),
  })
  .refine((v) => !v.declarado || v.numero.length > 0, {
    message:
      "Informe o número do seu cadastro no e-Psi para registrar a declaração.",
    path: ["numero"],
  });

export async function lerPerfilProfissional(
  ctx: TenantContext,
): Promise<PerfilProfissional | null> {
  return withTenant(ctx, async (tx) => {
    // `app_user_read` (0002/0085) já limita a usuários com papel nesta clínica;
    // o `WHERE id` restringe ao próprio registro. Os dois juntos, não um só:
    // a policy sozinha deixaria ler colegas, e o WHERE sozinho não é barreira.
    const linhas = (await tx.execute(sql`
      SELECT name AS nome,
             email,
             conselho,
             registro_numero,
             registro_uf,
             e_psi_verified,
             e_psi_number,
             e_psi_declarado_em::text AS e_psi_declarado_em
        FROM app_user
       WHERE id = ${ctx.userId}::uuid
    `)) as unknown as Array<Record<string, unknown>>;

    const l = linhas[0];
    if (!l) return null;

    return {
      nome: l.nome as string,
      email: l.email as string,
      conselho: (l.conselho as string | null) ?? null,
      registroNumero: (l.registro_numero as string | null) ?? null,
      registroUf: (l.registro_uf as string | null) ?? null,
      ePsiVerified: l.e_psi_verified === true,
      ePsiNumber: (l.e_psi_number as string | null) ?? null,
      ePsiDeclaradoEm: (l.e_psi_declarado_em as string | null) ?? null,
    };
  });
}

export async function declararEPsi(
  ctx: TenantContext,
  input: DeclararEPsiInput,
): Promise<PerfilResult> {
  const p = declararSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]!.message };

  return withTenant(ctx, async (tx) => {
    // NÃO trocar por `UPDATE app_user` cru. `app_user` tem FORCE RLS e uma
    // única policy para `app_role`: `app_user_read`, FOR SELECT (0002/0085).
    // Sem policy FOR UPDATE o comando afeta 0 linhas EM SILÊNCIO e a tela
    // devolveria `{ ok: true }` sem gravar nada — o defeito #212, medido de
    // novo aqui e documentado na 0130.
    //
    // O usuário NÃO entra por parâmetro: `app_declarar_e_psi` (0131) resolve
    // o alvo por `app_user_id_exigido()` dentro da própria transação. Não
    // existe assinatura capaz de declarar e-Psi no registro alheio, e a trilha
    // em `audit_log` é escrita pela própria função.
    await tx.execute(
      sql`SELECT app_declarar_e_psi(${p.data.declarado}, ${p.data.numero})`,
    );

    return { ok: true };
  });
}
