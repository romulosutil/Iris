import "server-only";

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
  const apiKey = process.env.RESEND_API_KEY;
  const remetente = process.env.EMAIL_REMETENTE;
  if (!apiKey || !remetente) return { enviado: false };

  try {
    const { Resend } = await import("resend");
    const { error } = await new Resend(apiKey).emails.send({
      from: remetente,
      to: input.para,
      subject: input.assunto,
      text: input.texto,
      html: input.html,
    });
    return { enviado: !error };
  } catch {
    return { enviado: false };
  }
}
