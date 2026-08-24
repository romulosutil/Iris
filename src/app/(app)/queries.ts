import "server-only";
import { eq } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import { clinic } from "@/db/schema";
import type { DadosTrialClinica } from "@/lib/trial";
import {
  avaliarSituacaoConta,
  type SituacaoConta,
} from "@/lib/billing/estado-conta";
import { obterRecusaAtiva } from "@/lib/billing/recusa-ativa";
import { montarAvisoRecusa, type AvisoRecusa } from "@/lib/billing/recusa-ui";

/**
 * Variante fora de transação de `avaliarSituacaoConta`, para uso em Server
 * Components (layout do app, layout do paciente, telas de cadastro).
 *
 * Mesma disciplina do `obterDadosTrialDaClinica` logo abaixo: quem lê para
 * RENDERIZAR abre a própria transação; quem lê para DECIDIR uma escrita usa a
 * versão que recebe `tx` e enxerga a mesma imagem do banco que o INSERT.
 */
export async function obterSituacaoConta(
  ctx: TenantContext,
): Promise<SituacaoConta> {
  return withTenant(ctx, (tx) => avaliarSituacaoConta(tx, ctx.clinicId));
}

/**
 * D36 — o aviso de cobrança recusada da faixa do layout. `null` quando o ciclo
 * mais recente não está em `falhou`, que é o caso da esmagadora maioria.
 *
 * Mesma disciplina de `obterSituacaoConta`: quem lê para RENDERIZAR abre a
 * própria transação de tenant.
 */
export async function obterAvisoRecusa(
  ctx: TenantContext,
): Promise<AvisoRecusa | null> {
  const recusa = await withTenant(ctx, (tx) =>
    obterRecusaAtiva(tx, ctx.clinicId),
  );
  return recusa
    ? montarAvisoRecusa({
        ...recusa,
        // I1 — só coordenador acessa `/clinica/dados` (`requireRole`); em G4,
        // `montarAvisoRecusa` usa este sinal para não mandar terapeuta a um
        // CTA que dá 404.
        podeEditarDadosDaClinica: ctx.role === "coordenador",
      })
    : null;
}

async function obterDadosTrialDaClinica(
  ctx: TenantContext,
): Promise<DadosTrialClinica> {
  return withTenant(ctx, async (tx) => {
    // Query direta do clinic para obter dados de trial e timezone.
    // RLS aplica-se automaticamente via withTenant (set_config já feito por
    // withTenant nesta mesma transação `tx`).
    //
    // Finding 3 da review da PR #166: antes usava `sql` bruto com
    // `as unknown as Array<...>`, escapando da tipagem do Drizzle. A
    // migração 0057 já declara essas colunas em src/db/schema.ts (commit
    // 0a5116b), então a API builder expressa a mesma query 1:1 — sem
    // set_config/CTE/definer nesse trecho, então não há nada perdido na
    // troca.
    const [row] = await tx
      .select({
        criadoEm: clinic.criadoEm,
        trialComecoEm: clinic.trialComecoEm,
        trialDias: clinic.trialDias,
        isentoTrial: clinic.isentoTrial,
        timezone: clinic.timezone,
      })
      .from(clinic)
      .where(eq(clinic.id, ctx.clinicId))
      .limit(1);

    // Sem linha (não deveria acontecer — a RLS já limita à própria clínica) o
    // fallback é `isentoTrial: true`: na dúvida, não inventar um relógio de
    // trial em cima de dados que não conseguimos ler.
    return {
      criadoEm: row?.criadoEm ?? new Date(),
      trialComecoEm: row?.trialComecoEm ?? null,
      trialDias: row?.trialDias ?? null,
      isentoTrial: row?.isentoTrial ?? true,
      timezone: row?.timezone ?? "America/Sao_Paulo",
    };
  });
}
