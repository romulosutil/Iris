import "server-only";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import {
  logoComoDataUri,
  MIME_LOGO_ACEITO,
  validarCorMarca,
  validarLogoPng,
  type MarcaClinica,
} from "@/lib/branding/marca";
import { lerMarcaClinica } from "@/lib/branding/leitura";

/**
 * #258 (D9) — marca institucional (white-label) da clínica.
 *
 * Core ctx-accepting em módulo `server-only`. NUNCA exportar daqui a partir de
 * um `"use server"`: viraria endpoint com ctx forjável → bypass de RLS
 * cross-tenant (#55). Os wrappers ficam em `actions.ts`, e o guard
 * `src/security/ctx-forjavel-guard.test.ts` quebra o CI se isso regredir.
 */

export type MarcaResult = { ok: true } | { error: string };

/** Forma que a tela consome — o logotipo já vem como data URI para o preview. */
export type MarcaView = {
  corPrimaria: string | null;
  logoDataUri: string | null;
  nomeClinica: string;
};

export type SalvarMarcaInput = {
  corPrimaria: string;
  /** Bytes do novo logotipo, ou null quando o formulário não enviou arquivo. */
  logo: Buffer | null;
  /** `true` = o coordenador pediu explicitamente para remover o logotipo. */
  removerLogo: boolean;
};

export function marcaParaView(marca: MarcaClinica): MarcaView {
  return {
    corPrimaria: marca.corPrimaria,
    logoDataUri: logoComoDataUri(marca),
    nomeClinica: marca.nomeClinica,
  };
}

export async function lerMarcaDaTela(ctx: TenantContext): Promise<MarcaView> {
  return withTenant(ctx, async (tx) =>
    marcaParaView(await lerMarcaClinica(tx)),
  );
}

/**
 * Valida e grava a marca. Validação de conteúdo (contraste WCAG e magic bytes
 * do PNG) roda AQUI, no servidor: o seletor de cor e o `accept="image/png"` do
 * formulário são conveniência de UI, e nada impede um POST direto na action.
 */
export async function salvarMarca(
  ctx: TenantContext,
  input: SalvarMarcaInput,
): Promise<MarcaResult> {
  const cor = validarCorMarca(input.corPrimaria);
  if ("erro" in cor) return { error: cor.erro };

  if (input.logo && input.removerLogo) {
    return {
      error:
        "Escolha uma coisa de cada vez: enviar um logotipo novo ou remover o atual.",
    };
  }

  let logoValidado: Buffer | null = null;
  if (input.logo) {
    const png = validarLogoPng(input.logo);
    if ("erro" in png) return { error: png.erro };
    logoValidado = input.logo;
  }

  // Três estados distintos, e a diferença importa: enviou logotipo novo /
  // pediu remoção / não mexeu. Sem o terceiro, reeditar só a cor apagaria o
  // logotipo em silêncio (memória do repo: form-repopulado-rebaixa-campo-omitido).
  const manterLogo = logoValidado === null && !input.removerLogo;

  return withTenant(ctx, async (tx) => {
    // `clinic` não tem policy de UPDATE para `app_role` (0002, deliberado) e
    // as colunas de marca não têm GRANT de UPDATE para esse papel — um UPDATE
    // cru daqui estoura `42501 permission denied for table clinic` (medido na
    // 0156). A escrita é a função SECURITY DEFINER da 0156, cujo guard interno
    // resolve o tenant por `app_clinic_id_exigido()` e exige coordenador. A
    // clínica não entra por parâmetro — não há caminho de forjar tenant.
    await tx.execute(sql`
      SELECT app_salvar_marca_clinica(
        ${cor.valor}::text,
        ${manterLogo}::boolean,
        ${logoValidado}::bytea,
        ${logoValidado ? MIME_LOGO_ACEITO : null}::text
      )
    `);

    // Trilha: guarda O QUE mudou, nunca os bytes do logotipo.
    await tx.execute(sql`
      INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, detalhe)
      VALUES (${ctx.clinicId}::uuid, ${ctx.userId}::uuid,
              'clinica_marca_configurada', 'clinic', ${ctx.clinicId}::uuid,
              ${JSON.stringify({
                cor_primaria: cor.valor,
                logo: logoValidado
                  ? "substituido"
                  : input.removerLogo
                    ? "removido"
                    : "inalterado",
                logo_bytes: logoValidado?.length ?? null,
              })}::jsonb)
    `);

    return { ok: true };
  });
}
