/**
 * #126 — envio de e-mail ao RT no estágio 2, pro motor de escalonamento
 * (`.mjs` puro, sem tsx). Espelho intencional de `src/lib/email/resend.ts`
 * (aquele é o adapter do app Next) — os dois arquivos são pequenos de
 * propósito; qualquer mudança de corpo/campo tem que ir nos dois.
 *
 * Corpo do e-mail é FIXO, sem paciente/categoria/trecho (§4.2.1, regra de
 * ouro) — só um link pro painel autenticado.
 */

export async function enviarEmailRt({ apiKey, fromEmail, appUrl, rtEmail }) {
  if (!apiKey) {
    return { ok: false, erro: "email nao configurado (EMAIL_PROVIDER_API_KEY ausente)" };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: rtEmail,
      subject: "Iris — alerta de risco pendente há mais tempo que o esperado",
      html: `<p>Um alerta de risco clínico da sua clínica está aguardando reconhecimento
        da equipe há mais tempo que o prazo interno configurado.</p>
        <p>Acesse o painel para revisar: <a href="${appUrl}">${appUrl}</a></p>
        <p>Consulte o Protocolo de Emergência Interno da clínica para a conduta indicada.</p>`,
    });

    if (error) {
      return { ok: false, erro: error.message ?? "erro desconhecido do provedor" };
    }
    return { ok: true, providerMessageId: data?.id ?? "" };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : String(err) };
  }
}
