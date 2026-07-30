/**
 * #126 — envio de e-mail ao RT no estágio 2, pro motor de escalonamento
 * (`.mjs` puro, sem tsx). Espelho intencional de `src/lib/email/resend.ts`
 * (aquele é o adapter do app Next) — os dois arquivos são pequenos de
 * propósito; qualquer mudança de corpo/campo tem que ir nos dois.
 *
 * Corpo do e-mail é FIXO, sem paciente/categoria/trecho (§4.2.1, regra de
 * ouro) — só um link pro painel autenticado.
 */

export const ASSUNTO_ALERTA_RT =
  "Iris — alerta de risco pendente há mais tempo que o esperado";

/**
 * Corpo do e-mail ao RT. Recebe SÓ a URL do painel — nenhum parâmetro clínico,
 * para que não exista nem a possibilidade de interpolar paciente/categoria/
 * trecho aqui (§4.2.1). Exportada para que o teste do guardrail asserte contra
 * ESTE código, e não contra uma cópia do template.
 */
export function montarCorpoAlertaRt(appUrl) {
  return `<p>Um alerta de risco clínico da sua clínica está aguardando reconhecimento
        da equipe há mais tempo que o prazo interno configurado.</p>
        <p>Acesse o painel para revisar: <a href="${appUrl}">${appUrl}</a></p>
        <p>Consulte o Protocolo de Emergência Interno da clínica para a conduta indicada.</p>`;
}

export async function enviarEmailRt({ apiKey, fromEmail, appUrl, rtEmail }) {
  if (!apiKey) {
    return { ok: false, erro: "email nao configurado (EMAIL_PROVIDER_API_KEY ausente)" };
  }

  // Sem URL do painel o e-mail não cumpre a função dele: o corpo não carrega
  // nada de clínico de propósito, então o link é a única ação possível pro RT.
  // Mandar assim mesmo gravaria `_enviado` na trilha para uma mensagem inútil —
  // canal que consta como entregue sem ter servido é a falha silenciosa da
  // #108. Falha explícita é melhor que e-mail com link vazio.
  if (!appUrl) {
    return { ok: false, erro: "email nao enviado (NEXT_PUBLIC_APP_URL ausente)" };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: rtEmail,
      subject: ASSUNTO_ALERTA_RT,
      html: montarCorpoAlertaRt(appUrl),
    });

    if (error) {
      return { ok: false, erro: error.message ?? "erro desconhecido do provedor" };
    }
    return { ok: true, providerMessageId: data?.id ?? "" };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : String(err) };
  }
}
