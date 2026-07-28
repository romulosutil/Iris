import "server-only";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import type { AlertaRiscoAgente } from "@/lib/extraction/agent-output-schema";
import {
  assertDestinatariosNoTenant,
  canaisIndisponiveis,
  destinatariosCriacao,
} from "./notificacao";

/**
 * #122 — cria o alerta de risco clínico a partir do sinal transversal do agente
 * (R20 / R5-TC) e dispara a notificação inicial.
 *
 * O INSERT não acontece aqui: `app_role` não tem INSERT nesta tabela. Quem
 * insere é `app_criar_alerta_risco` (SECURITY DEFINER, migração 0049), que
 * confere que sessão e paciente são do tenant corrente e resolve o prazo pela
 * §4.1 no próprio banco. O cliente não consegue forjar severidade nem prazo.
 */
export async function registrarAlertaRisco(
  ctx: TenantContext,
  args: {
    patientId: string;
    sessionId: string;
    risco: AlertaRiscoAgente;
  },
): Promise<{ alertaId: string } | { erro: string }> {
  try {
    return await withTenant(ctx, async (tx) => {
      const criado = (await tx.execute(sql`
        SELECT app_criar_alerta_risco(
          ${args.patientId}::uuid,
          ${args.sessionId}::uuid,
          ${args.risco.categoria}::alerta_risco_categoria,
          ${args.risco.severidade}::alerta_risco_severidade,
          ${args.risco.certeza}::alerta_risco_certeza,
          ${args.risco.trecho_fonte},
          ${args.risco.detalhe}
        ) AS id
      `)) as unknown as Array<{ id: string }>;
      const alertaId = criado[0]!.id;

      // Notificação dupla e SIMULTÂNEA (§4): terapeuta da sessão de origem e
      // coordenador ao mesmo tempo, não em cascata.
      const destinatarios = await destinatariosCriacao(tx, {
        clinicId: ctx.clinicId,
        sessionId: args.sessionId,
      });
      await assertDestinatariosNoTenant(tx, {
        clinicId: ctx.clinicId,
        destinatarios,
      });

      // Trilha de ENVIO. Canal indisponível entra na lista explicitamente — o
      // registro tem que distinguir "não notificou por push" de "não tentou".
      const canais = [
        ...new Set(destinatarios.map((d) => d.canal)),
        ...canaisIndisponiveis(0),
      ];
      await tx.execute(sql`
        UPDATE alerta_risco_clinico
           SET canais_notificados = ${JSON.stringify(canais)}::jsonb
         WHERE id = ${alertaId}::uuid
      `);

      return { alertaId };
    });
  } catch (err) {
    // Falha ao registrar risco NUNCA é silenciosa: quem chama decide o que
    // fazer, mas o erro sai no log com destaque. Um risco perdido em silêncio é
    // o pior modo de falha possível deste sistema.
    console.error("ALERTA DE RISCO NÃO REGISTRADO:", err);
    return { erro: "Não foi possível registrar o alerta de risco." };
  }
}
