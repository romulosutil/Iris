/**
 * #294 — envio do e-mail de alarme automático de parada de job de infra.
 * Espelho de scripts/lib/resend-rt.mjs (mesma razão: `.mjs` puro, sem tsx,
 * roda no detector sem depender do app Next).
 *
 * Corpo do e-mail é operacional, nunca clínico — nenhum paciente, categoria
 * ou trecho de risco entra aqui (§4.2.1, regra de ouro). As funções
 * SECURITY DEFINER da 0129 já garantem isso na origem: elas só devolvem
 * contagem, clinic_id e timestamp.
 */

export function montarAssuntoAlarme(motivo) {
  return `Iris — alarme: ${motivo} parece parado`;
}

export function montarCorpoAlarme(motivo, detalhe) {
  return `<p>O detector automático de jobs de infra encontrou um problema em <b>${motivo}</b>.</p>
        <p>${detalhe}</p>
        <p>Consulte a seção "Alarme automático de jobs de infra" em infra/README.md para o runbook de diagnóstico.</p>`;
}

export async function enviarEmailAlarme({
  apiKey,
  fromEmail,
  destino,
  motivo,
  detalhe,
}) {
  if (!apiKey) {
    return {
      ok: false,
      erro: "email nao configurado (EMAIL_PROVIDER_API_KEY ausente)",
    };
  }
  if (!destino) {
    return {
      ok: false,
      erro: "email nao enviado (ALARME_EMAIL_DESTINO ausente)",
    };
  }

  try {
    // `await import()` dinâmico: mesma forma do resend-rt.mjs. ATENÇÃO — o
    // catch abaixo transforma um `resend` ausente na imagem em "falha de
    // envio" silenciosa, e a carga de imagem (Task 8) é o único lugar que
    // pega isso (memória: carga-nao-cobre-import-dinamico).
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: destino,
      subject: montarAssuntoAlarme(motivo),
      html: montarCorpoAlarme(motivo, detalhe),
    });

    if (error) {
      return {
        ok: false,
        erro: error.message ?? "erro desconhecido do provedor",
      };
    }
    return { ok: true, providerMessageId: data?.id ?? "" };
  } catch (err) {
    return {
      ok: false,
      erro: err instanceof Error ? err.message : String(err),
    };
  }
}
