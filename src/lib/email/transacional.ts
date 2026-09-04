import "server-only";
import { logarErroSemPII } from "@/lib/observabilidade/logar-erro";
import { logger } from "@/lib/observabilidade/logger";

export type EmailTransacionalInput = {
  para: string;
  assunto: string;
  texto: string;
  html: string;
};

/**
 * Canal de e-mail transacional do produto (verificação de conta, recuperação de
 * senha). Separado de propósito do `resend.ts` do alerta de risco, cujo tipo é
 * fechado para não virar canal genérico.
 *
 * Falha de envio NÃO lança: quem chama (cadastro, reset) não pode quebrar por
 * indisponibilidade do provedor. O retorno diz se saiu.
 */
export async function enviarEmailTransacional(
  input: EmailTransacionalInput,
): Promise<{ enviado: boolean }> {
  const apiKey =
    process.env.EMAIL_PROVIDER_API_KEY || process.env.RESEND_API_KEY;
  const remetente =
    process.env.RESEND_FROM_EMAIL ||
    process.env.EMAIL_REMETENTE ||
    "notificacoes@irisclinica.ia.br";

  if (!apiKey || !remetente) {
    // Quais das duas faltam é o diagnóstico; o VALOR de nenhuma pode sair —
    // `apiKey` é credencial (a redaction por chave também a barraria, mas o
    // registro nem a carrega).
    //
    // A chave se chama `credencialConfigurada` e NÃO `temApiKey` porque
    // `redacao.ts` casa a família de credencial por substring (`apikey`): o
    // booleano sairia como `[redigido]` e o log diria nada — o efeito
    // "campo comum some do log" que aquele arquivo documenta. A resposta é
    // renomear a chave, não afrouxar a lista.
    logger.warn("email-transacional.credenciais-ausentes", {
      credencialConfigurada: Boolean(apiKey),
      remetenteConfigurado: Boolean(remetente),
    });
    return { enviado: false };
  }

  try {
    const { Resend } = await import("resend");
    const { error } = await new Resend(apiKey).emails.send({
      from: remetente,
      to: input.para,
      subject: input.assunto,
      text: input.texto,
      html: input.html,
    });
    if (error) {
      logarErroSemPII("enviarEmailTransacional: erro do provedor:", error);
      return { enviado: false };
    }
    return { enviado: true };
  } catch (err) {
    logarErroSemPII("enviarEmailTransacional: exceção capturada:", err);
    return { enviado: false };
  }
}
