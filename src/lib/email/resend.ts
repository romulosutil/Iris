// #126 — adapter de e-mail transacional para o app Next (RT no estágio 2 do
// alerta de risco; uso futuro: /equipe/convidar). Duplicação intencional com
// `scripts/lib/resend-rt.mjs`: aquele arquivo roda via `node` puro (sem tsx)
// no motor de escalonamento e não pode importar `.ts` de `src/lib/`.

export type RtAlertaEmailInput = {
  rtEmail: string;
  appUrl: string;
};
// Sem campo clínico nenhum de propósito — impossível interpolar paciente/
// categoria/trecho por construção do tipo (§4.2.1, regra de ouro).

export type EmailSendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; erro: string };

export const ASSUNTO_ALERTA_RT =
  "Iris — alerta de risco pendente há mais tempo que o esperado";

/**
 * Corpo do e-mail ao RT. Recebe SÓ a URL do painel — nenhum parâmetro clínico,
 * para que não exista nem a possibilidade de interpolar paciente/categoria/
 * trecho aqui (§4.2.1). Exportada para que o teste do guardrail asserte contra
 * ESTE código, e não contra uma cópia do template.
 */
export function montarCorpoAlertaRt(appUrl: string): string {
  return `<p>Um alerta de risco clínico da sua clínica está aguardando reconhecimento
        da equipe há mais tempo que o prazo interno configurado.</p>
        <p>Acesse o painel para revisar: <a href="${appUrl}">${appUrl}</a></p>
        <p>Consulte o Protocolo de Emergência Interno da clínica para a conduta indicada.</p>`;
}

export interface EmailProvider {
  enviarAlertaRiscoRt(input: RtAlertaEmailInput): Promise<EmailSendResult>;
}

export class NullEmailProvider implements EmailProvider {
  async enviarAlertaRiscoRt(): Promise<EmailSendResult> {
    return { ok: false, erro: "email nao configurado (EMAIL_PROVIDER_API_KEY ausente)" };
  }
}

export class ResendEmailProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fromEmail: string,
  ) {}

  async enviarAlertaRiscoRt(input: RtAlertaEmailInput): Promise<EmailSendResult> {
    // Sem URL do painel o e-mail não cumpre a função dele: o corpo não carrega
    // nada de clínico de propósito, então o link é a única ação possível pro
    // RT. Falha explícita é melhor que e-mail com link vazio registrado como
    // entregue na trilha (#108).
    if (!input.appUrl) {
      return { ok: false, erro: "email nao enviado (NEXT_PUBLIC_APP_URL ausente)" };
    }

    const { Resend } = await import("resend");
    const resend = new Resend(this.apiKey);
    const { data, error } = await resend.emails.send({
      from: this.fromEmail,
      to: input.rtEmail,
      subject: ASSUNTO_ALERTA_RT,
      html: montarCorpoAlertaRt(input.appUrl),
    });

    if (error) {
      return { ok: false, erro: error.message ?? "erro desconhecido do provedor" };
    }
    return { ok: true, providerMessageId: data?.id ?? "" };
  }
}

// Checado em tempo de CHAMADA (não em module-load) — convenção do repo
// (mesma de src/lib/extraction/provider.ts), pra testes poderem flipar o env
// livremente sem reimportar o módulo.
export function resolveEmailProvider(): EmailProvider {
  const key = process.env.EMAIL_PROVIDER_API_KEY;
  if (!key) return new NullEmailProvider();
  return new ResendEmailProvider(key, process.env.RESEND_FROM_EMAIL ?? "notificacoes@irisclinica.ia.br");
}
