import "server-only";
import { and, eq } from "drizzle-orm";
import { authDb } from "@/db/client";
import { appUser, clinic, userRole } from "@/db/schema";
import { getAppBaseUrl } from "@/lib/app-url";
import { criarTemplateAvisoCancelamentoAssinatura } from "@/lib/email/templates";
import { enviarEmailTransacional } from "@/lib/email/transacional";
import { levantarDebito } from "./debito";
import { logarErroSemPII } from "@/lib/observabilidade/logar-erro";
import { logger } from "@/lib/observabilidade/logger";

export interface ResultadoNotificacaoCancelamento {
  enviado: boolean;
  motivo?: string;
}

/**
 * Notificação transacional por e-mail no cancelamento da assinatura (#312).
 *
 * ## Contexto e Regras Inegociáveis:
 * 1. **Mitigador de engano, não concessão de acesso**:
 *    O corte de escrita no cancelamento é instantâneo e sem carência (#290). O e-mail
 *    informa a passagem para somente-leitura, o débito do ciclo interrompido (`devido`)
 *    e as instruções de reativação caso a revogação no app bancário tenha sido involuntária.
 * 2. **Destinatário e Fallbacks**:
 *    Prioridade 1: `clinic.responsavel_conta_id` → `app_user.email`.
 *    Prioridade 2: `clinic.email_financeiro` (se houver).
 *    Prioridade 3: Usuário com papel `coordenador` em `user_role` daquela clínica.
 *    Se nenhum existir: registra em nível `warn` e degrada graciosamente sem lançar.
 * 3. **Tolerância total a falhas (Zero Impacto no Billing)**:
 *    Toda execução é protegida por `try/catch` e nunca lança exceção para o chamador.
 *    Uma falha no envio do e-mail NUNCA pode derrubar nem reverter o congelamento do ciclo.
 */
export async function notificarCancelamentoAssinatura(
  clinicId: string,
  subscriptionId: string,
): Promise<ResultadoNotificacaoCancelamento> {
  try {
    const [clinica] = await authDb
      .select({
        nome: clinic.nome,
        emailFinanceiro: clinic.emailFinanceiro,
        responsavelContaId: clinic.responsavelContaId,
      })
      .from(clinic)
      .where(eq(clinic.id, clinicId))
      .limit(1);

    if (!clinica) {
      logger.warn("billing-cancelamento.clinica-nao-encontrada", { clinicId });
      return { enviado: false, motivo: "clinica_nao_encontrada" };
    }

    let emailDestino: string | null = null;
    let nomeDestino: string | null = null;

    // Prioridade 1: Responsável pela conta
    if (clinica.responsavelContaId) {
      const [responsavel] = await authDb
        .select({
          name: appUser.name,
          email: appUser.email,
        })
        .from(appUser)
        .where(eq(appUser.id, clinica.responsavelContaId))
        .limit(1);

      if (responsavel?.email) {
        emailDestino = responsavel.email;
        nomeDestino = responsavel.name;
      }
    }

    // Prioridade 2: E-mail financeiro cadastral da clínica
    if (!emailDestino && clinica.emailFinanceiro) {
      emailDestino = clinica.emailFinanceiro;
      nomeDestino = clinica.nome;
    }

    // Prioridade 3: Coordenador ativo da clínica
    if (!emailDestino) {
      const [coordenador] = await authDb
        .select({
          name: appUser.name,
          email: appUser.email,
        })
        .from(userRole)
        .innerJoin(appUser, eq(userRole.userId, appUser.id))
        .where(
          and(
            eq(userRole.clinicId, clinicId),
            eq(userRole.papel, "coordenador"),
          ),
        )
        .limit(1);

      if (coordenador?.email) {
        emailDestino = coordenador.email;
        nomeDestino = coordenador.name;
      }
    }

    if (!emailDestino) {
      // O clinicId é identificador opaco e é o que se filtra. O e-mail que
      // NÃO foi encontrado nunca entrou aqui — e continua fora.
      logger.warn("billing-cancelamento.destinatario-nao-encontrado", {
        clinicId,
      });
      return { enviado: false, motivo: "destinatario_nao_encontrado" };
    }

    // Levanta o débito apurado do ciclo interrompido (ou ciclos em devido acumulados)
    const debito = await levantarDebito(subscriptionId);
    const debitoCentavos = debito.totalCentavos;

    const urlAssinatura = `${getAppBaseUrl()}/assinatura`;
    const template = criarTemplateAvisoCancelamentoAssinatura({
      nomeResponsavel: nomeDestino,
      nomeClinica: clinica.nome,
      debitoCentavos,
      urlAssinatura,
    });

    const resultadoEnvio = await enviarEmailTransacional({
      para: emailDestino,
      assunto: template.assunto,
      texto: template.texto,
      html: template.html,
    });

    return { enviado: resultadoEnvio.enviado };
  } catch (err) {
    logarErroSemPII(
      "[billing-cancelamento] Exceção capturada ao despachar e-mail de cancelamento:",
      err,
    );
    return { enviado: false, motivo: "excecao_capturada" };
  }
}
