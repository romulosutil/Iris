"use server";

import { z } from "zod";
import { authDb } from "@/db/client";
import { authVerification } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { consumirTentativa } from "@/lib/rate-limit";
import { enviarEmailTransacional } from "@/lib/email/transacional";
import { criarTemplateReenvioVerificacao } from "@/lib/email/templates";

export type EstadoReenvio = {
  success?: boolean;
  message?: string;
  error?: string;
};

const esquemaEmail = z
  .string()
  .trim()
  .email("Informe um endereço de e-mail válido.");

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
import { getAppBaseUrl } from "@/lib/app-url";
import { logarErroSemPII } from "@/lib/observabilidade/logar-erro";

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
      error:
        "Muitas solicitações de reenvio. Aguarde alguns minutos antes de tentar novamente.",
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
      const baseUrl = getAppBaseUrl();
      const linkVerificacao = `${baseUrl}/verificar-email?token=${tokenRecord.value}`;
      const template = criarTemplateReenvioVerificacao(linkVerificacao);

      void enviarEmailTransacional({
        para: email,
        assunto: template.assunto,
        texto: template.texto,
        html: template.html,
      }).catch((err) => {
        logarErroSemPII(
          "reenviarEmailVerificacao: falha ao enviar e-mail transacional:",
          err,
        );
      });
    }
  } catch (err) {
    logarErroSemPII(
      "reenviarEmailVerificacao: exceção no banco/processamento:",
      err,
    );
  }

  // Resposta uniforme estrita (não vaza se o token existia ou não)
  return {
    success: true,
    message:
      "Se este e-mail estiver cadastrado e pendente de verificação, enviamos um novo link.",
  };
}
