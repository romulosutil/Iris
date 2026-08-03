"use server";

import { z } from "zod";
import { authDb } from "@/db/client";
import { authVerification } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { consumirTentativa } from "@/lib/rate-limit";
import { enviarEmailTransacional } from "@/lib/email/transacional";

export type EstadoReenvio = {
  success?: boolean;
  message?: string;
  error?: string;
};

const esquemaEmail = z.string().trim().email("Informe um endereço de e-mail válido.");

/**
 * Reenvia o e-mail de verificação de conta (#168).
 *
 * RESPOSTA UNIFORME ANTI-ENUMERAÇÃO:
 * Independente de o e-mail existir, já estar verificado ou não ser encontrado,
 * o retorno de sucesso exibe sempre a mesma mensagem homogênea:
 * "Se este e-mail estiver cadastrado e pendente de verificação, enviamos um novo link."
 *
 * RATE-LIMITING:
 * Limita a 3 tentativas de reenvio a cada 15 minutos por e-mail para impedir abuso do Resend.
 */
export async function reenviarEmailVerificacao(
  _estadoAnterior: EstadoReenvio,
  formData: FormData,
): Promise<EstadoReenvio> {
  const emailBruto = formData.get("email");
  const parse = esquemaEmail.safeParse(emailBruto);

  if (!parse.success) {
    return {
      error: parse.error.issues[0]?.message ?? "E-mail inválido.",
    };
  }

  const email = parse.data.toLowerCase();

  // Rate-limiting em memória: no máximo 3 solicitações de reenvio por e-mail a cada 15 minutos
  const rateLimitKey = `reenvio:${email}`;
  const rateLimit = consumirTentativa(rateLimitKey, 3, 15 * 60 * 1000);

  if (!rateLimit.permitido) {
    return {
      error: "Muitas solicitações de reenvio. Aguarde alguns minutos antes de tentar novamente.",
    };
  }

  try {
    // Consulta se existe token de verificação pendente e dentro da validade
    const agora = new Date();
    const tokenRecord = await authDb.query.authVerification.findFirst({
      where: and(
        eq(authVerification.identifier, email),
        gt(authVerification.expiresAt, agora),
      ),
    });

    if (tokenRecord?.value) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const linkVerificacao = `${baseUrl}/verificar-email?token=${tokenRecord.value}`;

      void enviarEmailTransacional({
        para: email,
        assunto: "Verifique seu e-mail — Iris",
        texto: `Para concluir seu cadastro no Iris, acesse o link a seguir:\n\n${linkVerificacao}\n\nSe você não solicitou este cadastro, desconsidere esta mensagem.`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Verifique seu e-mail no Iris</h2>
            <p>Clique no botão abaixo para confirmar seu e-mail e continuar o cadastro:</p>
            <p style="margin: 24px 0;">
              <a href="${linkVerificacao}" style="background-color: #1a1a1a; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
                Verificar e-mail
              </a>
            </p>
            <p style="color: #666666; font-size: 14px;">Ou copie o link: <a href="${linkVerificacao}">${linkVerificacao}</a></p>
          </div>
        `,
      }).catch((err) => {
        console.error("reenviarEmailVerificacao: falha ao enviar e-mail transacional:", err);
      });
    }
  } catch (err) {
    console.error("reenviarEmailVerificacao: exceção no banco/processamento:", err);
  }

  // Resposta uniforme estrita (não vaza se o token existia ou não)
  return {
    success: true,
    message: "Se este e-mail estiver cadastrado e pendente de verificação, enviamos um novo link.",
  };
}
