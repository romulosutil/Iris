import "server-only";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import { validarEMaterializarCpfCnpj } from "@/lib/documento";
import { getProviderPorId } from "@/lib/billing/provider";
import { logarErroSemPII } from "@/lib/observabilidade/logar-erro";

/**
 * #262 — Dados da Clínica: razão social, CPF/CNPJ, endereço e e-mail
 * financeiro, editáveis pelo coordenador.
 *
 * Core ctx-accepting em módulo `server-only`. NUNCA exportar daqui a partir de
 * um `"use server"`: viraria endpoint com ctx forjável → bypass de RLS
 * cross-tenant (#55). Os wrappers ficam em `actions.ts`, e o guard
 * `src/security/ctx-forjavel-guard.test.ts` quebra o CI se isso regredir.
 */

export type DadosClinicaResult = { ok: true } | { error: string };

export type DadosClinica = {
  nome: string;
  cpfCnpj: string | null;
  razaoSocial: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  emailFinanceiro: string | null;
  /**
   * Gate do documento: uma vez que existe cobrança EMITIDA no gateway, o
   * CPF/CNPJ não pode mais mudar — é o mesmo predicado que a função
   * `app_salvar_dados_clinica` (0095) aplica no banco. Aqui é só espelho
   * para a UI travar o campo; a fronteira real é o guard da função.
   */
  documentoTravado: boolean;
};

export type SalvarDadosClinicaInput = {
  razaoSocial: string;
  cpfCnpj: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  emailFinanceiro: string;
};

// Campos livres: todos opcionais (a clínica preenche aos poucos). Formato só
// é validado quando o campo vem preenchido; string vazia vira NULL no banco.
const salvarSchema = z.object({
  razaoSocial: z.string().trim(),
  cpfCnpj: z.string().trim(),
  logradouro: z.string().trim(),
  numero: z.string().trim(),
  complemento: z.string().trim(),
  bairro: z.string().trim(),
  cidade: z.string().trim(),
  uf: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[A-Za-z]{2}$/.test(v), {
      message: "UF deve ter exatamente 2 letras.",
    }),
  cep: z
    .string()
    .trim()
    .refine((v) => v === "" || v.replace(/\D/g, "").length === 8, {
      message: "CEP deve ter 8 dígitos.",
    }),
  emailFinanceiro: z
    .string()
    .trim()
    .refine((v) => v === "" || z.string().email().safeParse(v).success, {
      message: "Informe um e-mail financeiro válido.",
    }),
});

export async function lerDadosClinica(
  ctx: TenantContext,
): Promise<DadosClinica> {
  return withTenant(ctx, async (tx) => {
    const linhas = (await tx.execute(sql`
      SELECT c.nome,
             c.cpf_cnpj,
             c.razao_social,
             c.endereco_logradouro,
             c.endereco_numero,
             c.endereco_complemento,
             c.endereco_bairro,
             c.endereco_cidade,
             c.endereco_uf,
             c.endereco_cep,
             c.email_financeiro,
             (c.cpf_cnpj IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM billing_cycle bc
                 WHERE bc.clinic_id = ${ctx.clinicId}::uuid
                   AND bc.cobranca_emitida_em IS NOT NULL
              )) AS documento_travado
        FROM clinic c
       WHERE c.id = ${ctx.clinicId}::uuid
    `)) as unknown as Array<Record<string, unknown>>;

    const l = linhas[0];
    return {
      nome: (l?.nome as string | null) ?? "",
      cpfCnpj: (l?.cpf_cnpj as string | null) ?? null,
      razaoSocial: (l?.razao_social as string | null) ?? null,
      logradouro: (l?.endereco_logradouro as string | null) ?? null,
      numero: (l?.endereco_numero as string | null) ?? null,
      complemento: (l?.endereco_complemento as string | null) ?? null,
      bairro: (l?.endereco_bairro as string | null) ?? null,
      cidade: (l?.endereco_cidade as string | null) ?? null,
      uf: (l?.endereco_uf as string | null) ?? null,
      cep: (l?.endereco_cep as string | null) ?? null,
      emailFinanceiro: (l?.email_financeiro as string | null) ?? null,
      documentoTravado: Boolean(l?.documento_travado),
    };
  });
}

/** Máscara para o audit_log: só os 4 últimos dígitos do documento. */
function mascararDocumento(doc: string | null): string | null {
  if (!doc) return null;
  const limpo = doc.replace(/\D/g, "");
  return `***${limpo.slice(-4)}`;
}

/** Máscara para o audit_log: primeira letra + domínio do e-mail. */
function mascararEmail(email: string | null): string | null {
  if (!email) return null;
  const arroba = email.indexOf("@");
  if (arroba <= 0) return "***";
  return `${email[0]}***@${email.slice(arroba + 1)}`;
}

/**
 * Grava os dados cadastrais numa transação só, com três camadas:
 *
 * 1. `app_salvar_dados_clinica` (SECURITY DEFINER, 0095) — `clinic` não tem
 *    grant de UPDATE nessas colunas para `app_role` (#212: UPDATE cru afeta 0
 *    linhas em silêncio). O guard interno exige coordenador, valida formato e
 *    trava o CPF/CNPJ quando já existe cobrança emitida.
 * 2. Sincronização com o gateway ANTES do commit: se o PUT no gateway falhar,
 *    a transação inteira volta — banco e gateway nunca divergem em silêncio.
 *    Sem vínculo (`provider_customer_id` NULL) não há o que sincronizar: os
 *    dados entram no gateway na ativação.
 * 3. `audit_log` na mesma transação, com CPF/CNPJ e e-mail mascarados.
 */
export async function salvarDadosClinica(
  ctx: TenantContext,
  input: SalvarDadosClinicaInput,
): Promise<DadosClinicaResult> {
  const p = salvarSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]!.message };

  // Módulo 11 — dígito verificador de verdade, não só contagem de dígitos
  // (a função do banco só valida 11/14 dígitos).
  let cpfCnpjLimpo = "";
  if (p.data.cpfCnpj !== "") {
    const doc = validarEMaterializarCpfCnpj(p.data.cpfCnpj);
    if (!doc.valido) return { error: doc.erro };
    cpfCnpjLimpo = doc.documentoLimpo;
  }

  const d = p.data;
  const uf = d.uf === "" ? null : d.uf.toUpperCase();
  const cep = d.cep === "" ? null : d.cep.replace(/\D/g, "");
  const vazioNulo = (v: string) => (v === "" ? null : v);

  try {
    return await withTenant(ctx, async (tx) => {
      // Estado anterior — base do diff do audit_log.
      const antes = await lerDadosDentroDaTx(tx, ctx.clinicId);

      // Diff calculado ANTES de escrever: bloqueia remoção do documento por
      // payload sem cpfCnpj (o `required` do form é só conveniência de UI) e
      // permite curto-circuitar o no-op sem PUT no gateway nem audit vazio.
      const depois: Record<string, string | null> = {
        razao_social: vazioNulo(d.razaoSocial),
        cpf_cnpj: vazioNulo(cpfCnpjLimpo),
        endereco_logradouro: vazioNulo(d.logradouro),
        endereco_numero: vazioNulo(d.numero),
        endereco_complemento: vazioNulo(d.complemento),
        endereco_bairro: vazioNulo(d.bairro),
        endereco_cidade: vazioNulo(d.cidade),
        endereco_uf: uf,
        endereco_cep: cep,
        email_financeiro: vazioNulo(d.emailFinanceiro),
      };
      const anteriores: Record<string, string | null> = {
        razao_social: antes.razaoSocial,
        cpf_cnpj: antes.cpfCnpj,
        endereco_logradouro: antes.logradouro,
        endereco_numero: antes.numero,
        endereco_complemento: antes.complemento,
        endereco_bairro: antes.bairro,
        endereco_cidade: antes.cidade,
        endereco_uf: antes.uf,
        endereco_cep: antes.cep,
        email_financeiro: antes.emailFinanceiro,
      };

      if (depois.cpf_cnpj === null && antes.cpfCnpj !== null) {
        return {
          error:
            "O CPF/CNPJ não pode ser removido — informe o documento atual ou um novo.",
        };
      }

      const camposAlterados = Object.keys(depois).filter(
        (campo) => depois[campo] !== anteriores[campo],
      );
      if (camposAlterados.length === 0) {
        // Nada mudou: sem UPDATE, sem PUT no gateway, sem linha de audit vazia.
        return { ok: true };
      }

      await tx.execute(sql`
        SELECT app_salvar_dados_clinica(
          ${vazioNulo(d.razaoSocial)},
          ${vazioNulo(cpfCnpjLimpo)},
          ${vazioNulo(d.logradouro)},
          ${vazioNulo(d.numero)},
          ${vazioNulo(d.complemento)},
          ${vazioNulo(d.bairro)},
          ${vazioNulo(d.cidade)},
          ${uf},
          ${cep},
          ${vazioNulo(d.emailFinanceiro)}
        )
      `);

      // Guardrail 3 (#262) — sincroniza o cadastro no gateway ANTES do commit.
      // Provider vem da LINHA (`getProviderPorId`), nunca da env
      // (`getBillingProvider`) — família de bug D25/D26.
      const subs = (await tx.execute(sql`
        SELECT provider, provider_customer_id
          FROM subscription
         WHERE clinic_id = ${ctx.clinicId}::uuid
         ORDER BY criado_em DESC
         LIMIT 1
      `)) as unknown as Array<Record<string, unknown>>;

      const linha = subs[0];
      const providerCustomerId =
        (linha?.provider_customer_id as string | null) ?? null;
      if (linha && providerCustomerId) {
        const provider = getProviderPorId(linha.provider as string);
        if (provider.atualizarCliente) {
          await provider.atualizarCliente({
            providerCustomerId,
            nome: vazioNulo(d.razaoSocial) ?? antes.nome,
            cpfCnpj: vazioNulo(cpfCnpjLimpo),
            email: vazioNulo(d.emailFinanceiro),
            logradouro: vazioNulo(d.logradouro),
            numero: vazioNulo(d.numero),
            complemento: vazioNulo(d.complemento),
            bairro: vazioNulo(d.bairro),
            cep,
          });
        }
      }
      // Sem subscription ou sem customer no gateway: pular em silêncio
      // (trial/free_tier — os dados entram no gateway na ativação).

      // Diff só dos campos que mudaram, com mascaramento dos sensíveis.
      const mascarar = (campo: string, valor: string | null) =>
        campo === "cpf_cnpj"
          ? mascararDocumento(valor)
          : campo === "email_financeiro"
            ? mascararEmail(valor)
            : valor;

      const detalhe: Record<
        string,
        { de: string | null; para: string | null }
      > = {};
      for (const campo of camposAlterados) {
        detalhe[campo] = {
          de: mascarar(campo, anteriores[campo] ?? null),
          para: mascarar(campo, depois[campo] ?? null),
        };
      }

      await tx.execute(sql`
        INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, detalhe)
        VALUES (${ctx.clinicId}::uuid, ${ctx.userId}::uuid,
                'dados_clinica_atualizados', 'clinic', ${ctx.clinicId}::uuid,
                ${JSON.stringify(detalhe)}::jsonb)
      `);

      return { ok: true };
    });
  } catch (err) {
    // Rollback já aconteceu (o throw atravessou a transação). Erro do gateway
    // ou do guard da função viram mensagem amigável; o detalhe fica no log.
    logarErroSemPII("salvarDadosClinica:", err);
    const msg =
      err instanceof Error
        ? ((err.cause as Error | undefined)?.message ?? err.message)
        : "";
    // O gate do documento merece mensagem própria: o coordenador precisa saber
    // que o CPF/CNPJ está travado (cobrança já emitida), não "tente de novo".
    if (msg.includes("documento travado")) {
      return {
        error:
          "CPF/CNPJ com documento travado: já existem cobranças emitidas com o documento atual. Os demais campos seguem editáveis.",
      };
    }
    return {
      error:
        "Não foi possível salvar os dados da clínica. Nada foi alterado — tente novamente em instantes.",
    };
  }
}

/** Leitura do estado atual dentro da transação (base do diff do audit_log). */
async function lerDadosDentroDaTx(
  tx: { execute: (q: ReturnType<typeof sql>) => Promise<unknown> },
  clinicId: string,
): Promise<DadosClinica> {
  const linhas = (await tx.execute(sql`
    SELECT c.nome, c.cpf_cnpj, c.razao_social,
           c.endereco_logradouro, c.endereco_numero, c.endereco_complemento,
           c.endereco_bairro, c.endereco_cidade, c.endereco_uf, c.endereco_cep,
           c.email_financeiro
      FROM clinic c
     WHERE c.id = ${clinicId}::uuid
  `)) as unknown as Array<Record<string, unknown>>;

  const l = linhas[0];
  return {
    nome: (l?.nome as string | null) ?? "",
    cpfCnpj: (l?.cpf_cnpj as string | null) ?? null,
    razaoSocial: (l?.razao_social as string | null) ?? null,
    logradouro: (l?.endereco_logradouro as string | null) ?? null,
    numero: (l?.endereco_numero as string | null) ?? null,
    complemento: (l?.endereco_complemento as string | null) ?? null,
    bairro: (l?.endereco_bairro as string | null) ?? null,
    cidade: (l?.endereco_cidade as string | null) ?? null,
    uf: (l?.endereco_uf as string | null) ?? null,
    cep: (l?.endereco_cep as string | null) ?? null,
    emailFinanceiro: (l?.email_financeiro as string | null) ?? null,
    documentoTravado: false,
  };
}
