/**
 * Templates HTML e Texto de E-mails Transacionais do Iris.
 * Escrevendo com tom de voz de UX Writer Sênior: direto, empático, seguro e profissional.
 */
import { formatarBRL } from "@/lib/billing/calculator";

interface BaseEmailProps {
  tituloHeader: string;
  conteudoHtml: string;
  rodapeContexto?: string;
}

/**
 * Encapsula o conteúdo em um layout HTML responsivo e com a identidade visual do Iris
 * (barra decorativa de espectro, tipografia limpa e botão de ação destacado).
 */
function renderizarLayoutEmail({
  tituloHeader,
  conteudoHtml,
  rodapeContexto,
}: BaseEmailProps): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${tituloHeader}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8F9FA; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1A1A1A;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background-color: #FFFFFF; border-radius: 8px; border: 2px solid #1A1A1A; overflow: hidden; box-shadow: 4px 4px 0px #1A1A1A;">
          
          <!-- Faixa Espectro Decorativa -->
          <tr>
            <td style="height: 6px; background: linear-gradient(90deg, #E53E3E, #DD6B20, #D69E2E, #38A169, #3182CE, #805AD5);"></td>
          </tr>

          <!-- Cabeçalho com Logo -->
          <tr>
            <td style="padding: 32px 32px 16px 32px; text-align: left; border-bottom: 1px solid #E2E8F0;">
              <span style="font-size: 24px; font-weight: 800; letter-spacing: -0.5px; color: #1A1A1A;">
                IRIS <span style="font-size: 14px; font-weight: 600; color: #718096; text-transform: uppercase; margin-left: 6px;">Governança Clínica</span>
              </span>
            </td>
          </tr>

          <!-- Conteúdo Principal -->
          <tr>
            <td style="padding: 32px; font-size: 16px; line-height: 1.6; color: #2D3748;">
              <h1 style="font-size: 22px; font-weight: 700; color: #1A1A1A; margin-top: 0; margin-bottom: 20px;">
                ${tituloHeader}
              </h1>
              ${conteudoHtml}
            </td>
          </tr>

          <!-- Rodapé Institucional -->
          <tr>
            <td style="padding: 24px 32px; background-color: #F7FAFC; border-top: 1px solid #E2E8F0; font-size: 13px; color: #718096; line-height: 1.5;">
              ${rodapeContexto ? `<p style="margin: 0 0 12px 0;">${rodapeContexto}</p>` : ""}
              <p style="margin: 0;">
                Esta é uma mensagem automática de governança e segurança enviada pela plataforma <strong>Iris</strong>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * E-mail 1: Verificação Inicial de Conta (Pós-cadastro)
 */
export function criarTemplateVerificacaoEmail(linkVerificacao: string) {
  const assunto = "Confirme seu e-mail para ativar sua conta no Iris";
  const texto = `Seja bem-vindo(a) ao Iris!\n\nPara concluir a criação da sua conta e ter acesso à plataforma, confirme seu endereço de e-mail acessando o link a seguir:\n\n${linkVerificacao}\n\nEste link é válido por tempo limitado.\nSe você não realizou este cadastro, por favor desconsidere esta mensagem.`;

  const html = renderizarLayoutEmail({
    tituloHeader: "Confirme seu endereço de e-mail",
    conteudoHtml: `
      <p style="margin-top: 0;">Olá! Seja bem-vindo(a) ao <strong>Iris</strong>.</p>
      <p>Para concluir seu cadastro com segurança e ter acesso ao prontuário de governança clínica, confirme seu e-mail clicando no botão abaixo:</p>
      
      <p style="margin: 32px 0; text-align: center;">
        <a href="${linkVerificacao}" style="background-color: #1A1A1A; color: #FFFFFF; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 2px 2px 0px #718096;">
          Confirmar meu e-mail
        </a>
      </p>

      <p style="font-size: 14px; color: #718096;">
        Se o botão não funcionar, copie e cole o link a seguir no seu navegador:<br>
        <a href="${linkVerificacao}" style="color: #2B6CB0; word-break: break-all;">${linkVerificacao}</a>
      </p>
    `,
    rodapeContexto: "Se você não criou uma conta no Iris, nenhuma ação adicional é necessária.",
  });

  return { assunto, texto, html };
}

/**
 * E-mail 2: Reenvio de Confirmação de E-mail
 */
export function criarTemplateReenvioVerificacao(linkVerificacao: string) {
  const assunto = "Novo link para verificação do seu e-mail — Iris";
  const texto = `Recebemos uma solicitação para reenviar o link de confirmação da sua conta no Iris.\n\nAcesse o link abaixo para validar seu e-mail:\n\n${linkVerificacao}\n\nSe você não solicitou este reenvio, desconsidere esta mensagem.`;

  const html = renderizarLayoutEmail({
    tituloHeader: "Seu novo link de confirmação",
    conteudoHtml: `
      <p style="margin-top: 0;">Recebemos seu pedido para reenviar o e-mail de confirmação da conta.</p>
      <p>Clique no botão abaixo para validar seu endereço de e-mail e prosseguir com o uso da plataforma:</p>
      
      <p style="margin: 32px 0; text-align: center;">
        <a href="${linkVerificacao}" style="background-color: #1A1A1A; color: #FFFFFF; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 2px 2px 0px #718096;">
          Validar meu e-mail agora
        </a>
      </p>

      <p style="font-size: 14px; color: #718096;">
        Link direto:<br>
        <a href="${linkVerificacao}" style="color: #2B6CB0; word-break: break-all;">${linkVerificacao}</a>
      </p>
    `,
    rodapeContexto: "Caso não tenha feito este pedido, sua conta permanece protegida e você pode desconsiderar esta mensagem.",
  });

  return { assunto, texto, html };
}

/**
 * E-mail 3: Redefinição de Senha
 */
export function criarTemplateRedefinicaoSenha(linkReset: string) {
  const assunto = "Instruções para redefinir sua senha no Iris";
  const texto = `Recebemos uma solicitação para redefinir a senha da sua conta no Iris.\n\nPara cadastrar uma nova senha, acesse o link abaixo:\n\n${linkReset}\n\nSe você não fez essa solicitação, sua senha atual permanece segura. Desconsidere este e-mail.`;

  const html = renderizarLayoutEmail({
    tituloHeader: "Redefinição de senha solicitada",
    conteudoHtml: `
      <p style="margin-top: 0;">Recebemos um pedido para redefinir a senha de acesso da sua conta.</p>
      <p>Clique no botão a seguir para cadastrar sua nova senha:</p>
      
      <p style="margin: 32px 0; text-align: center;">
        <a href="${linkReset}" style="background-color: #1A1A1A; color: #FFFFFF; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 2px 2px 0px #718096;">
          Redefinir minha senha
        </a>
      </p>

      <p style="font-size: 14px; color: #718096;">
        Ou utilize o link:<br>
        <a href="${linkReset}" style="color: #2B6CB0; word-break: break-all;">${linkReset}</a>
      </p>
    `,
    rodapeContexto: "Se você não solicitou a alteração de senha, fique tranquilo: nenhuma mudança foi feita na sua conta.",
  });

  return { assunto, texto, html };
}

/**
 * E-mail 3b: Notificação de Tentativa de Cadastro em Conta Existente
 */
export function criarTemplateTentativaCadastroExistente({
  loginUrl,
  esqueciSenhaUrl,
}: {
  loginUrl: string;
  esqueciSenhaUrl: string;
}) {
  const assunto = "Tentativa de cadastro no Iris";
  const texto = `Identificamos uma tentativa de cadastro no Iris utilizando este endereço de e-mail.\n\nComo você já possui uma conta ativa, você pode entrar diretamente em:\n${loginUrl}\n\nCaso tenha esquecido sua senha, redefina em:\n${esqueciSenhaUrl}\n\nSe você não realizou esta tentativa, nenhuma ação é necessária. Sua conta continua segura.`;

  const html = renderizarLayoutEmail({
    tituloHeader: "Tentativa de cadastro no Iris",
    conteudoHtml: `
      <p style="margin-top: 0;">Identificamos uma tentativa de criar uma nova conta no Iris utilizando este e-mail.</p>
      <p>Como você já possui uma conta cadastrada, acesse a plataforma abaixo ou redefina sua senha se necessário:</p>
      
      <p style="margin: 32px 0; text-align: center;">
        <a href="${loginUrl}" style="background-color: #1A1A1A; color: #FFFFFF; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 2px 2px 0px #718096;">
          Acessar minha conta
        </a>
      </p>

      <p style="font-size: 14px; color: #718096;">
        Esqueceu sua senha? <a href="${esqueciSenhaUrl}" style="color: #2B6CB0;">Clique aqui para redefinir</a>.
      </p>
    `,
    rodapeContexto: "Se você não realizou esta tentativa, fique tranquilo: sua conta permanece totalmente protegida.",
  });

  return { assunto, texto, html };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * E-mail 4: Convite de Equipe — Novo Usuário (com senha temporária)
 */
export function criarTemplateConviteNovoUsuario({
  nome,
  senhaTemporaria,
  loginUrl,
}: {
  nome: string;
  senhaTemporaria: string;
  loginUrl: string;
}) {
  const nomeEscapado = escapeHtml(nome);
  const assunto = "Convite para integrar a equipe no Iris";
  const texto = `Olá, ${nome}!\n\nVocê foi convidado(a) para integrar a equipe da sua clínica no Iris.\n\nSua senha temporária de primeiro acesso é: ${senhaTemporaria}\n\nAcesse ${loginUrl} para realizar seu primeiro login.`;

  const html = renderizarLayoutEmail({
    tituloHeader: `Bem-vindo(a) à equipe, ${nomeEscapado}!`,
    conteudoHtml: `
      <p style="margin-top: 0;">Você foi convidado(a) pela coordenação para integrar a equipe clínica na plataforma Iris.</p>
      
      <div style="background-color: #EDF2F7; border-left: 4px solid #1A1A1A; padding: 16px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; font-size: 14px; color: #4A5568;">Sua senha temporária de acesso:</p>
        <p style="margin: 6px 0 0 0; font-family: monospace; font-size: 20px; font-weight: 700; color: #1A1A1A;">
          ${senhaTemporaria}
        </p>
      </div>

      <p style="margin: 32px 0; text-align: center;">
        <a href="${loginUrl}" style="background-color: #1A1A1A; color: #FFFFFF; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 2px 2px 0px #718096;">
          Acessar a plataforma
        </a>
      </p>
    `,
    rodapeContexto: "Por razões de segurança, recomendamos alterar sua senha temporária no primeiro acesso.",
  });

  return { assunto, texto, html };
}

/**
 * E-mail 5: Convite de Equipe — Usuário Já Existente
 */
export function criarTemplateConviteUsuarioExistente({
  nome,
  loginUrl,
}: {
  nome: string;
  loginUrl: string;
}) {
  const nomeEscapado = escapeHtml(nome);
  const assunto = "Convite para integrar nova equipe no Iris";
  const texto = `Olá, ${nome}!\n\nVocê foi adicionado(a) à equipe de uma nova clínica no Iris.\nComo você já tem uma conta ativa, faça login com sua senha atual acessando ${loginUrl}.`;

  const html = renderizarLayoutEmail({
    tituloHeader: "Nova clínica vinculada!",
    conteudoHtml: `
      <p style="margin-top: 0;">Olá, <strong>${nomeEscapado}</strong>.</p>
      <p>Você acaba de ser adicionado(a) à equipe de uma nova clínica na plataforma Iris.</p>
      <p>Como você já possui uma conta ativa, faça login com sua senha atual para acessar a nova clínica:</p>
      
      <p style="margin: 32px 0; text-align: center;">
        <a href="${loginUrl}" style="background-color: #1A1A1A; color: #FFFFFF; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 2px 2px 0px #718096;">
          Entrar na minha conta
        </a>
      </p>
    `,
    rodapeContexto: "Você pode trocar entre as clínicas atribuídas a você no menu superior após fazer login.",
  });

  return { assunto, texto, html };
}

export interface TemplateAvisoCancelamentoProps {
  nomeResponsavel?: string | null;
  nomeClinica: string;
  debitoCentavos: number;
  urlAssinatura: string;
}

/**
 * E-mail 6: Aviso no Cancelamento da Assinatura (#312)
 *
 * Disparado quando a assinatura vai para `canceled`. Informa com transparência:
 * 1. O corte imediato de escrita e passagem para o modo somente-leitura (com consulta e exportação livres);
 * 2. O valor pro-rata em aberto do ciclo interrompido (`billing_cycle` em `devido`), se houver;
 * 3. A necessidade de quitação desse valor para reativação;
 * 4. O link direto para a tela de assinatura caso o cancelamento tenha ocorrido por engano.
 */
export function criarTemplateAvisoCancelamentoAssinatura({
  nomeResponsavel,
  nomeClinica,
  debitoCentavos,
  urlAssinatura,
}: TemplateAvisoCancelamentoProps) {
  const nomeResponsavelEscapado = nomeResponsavel
    ? escapeHtml(nomeResponsavel)
    : null;
  const nomeClinicaEscapado = escapeHtml(nomeClinica);
  const temDebito = debitoCentavos > 0;
  const valorFormatado = temDebito ? formatarBRL(debitoCentavos) : "";

  const assunto =
    "Aviso: sua assinatura do Iris foi cancelada — conta em modo somente-leitura";

  const saudacaoTexto = nomeResponsavel
    ? `Olá, ${nomeResponsavel}!`
    : "Olá!";
  const saudacaoHtml = nomeResponsavelEscapado
    ? `Olá, <strong>${nomeResponsavelEscapado}</strong>!`
    : "Olá!";

  const blocoDebitoTexto = temDebito
    ? `\n\nIdentificamos que há um valor em aberto de ${valorFormatado} referente aos dias utilizados no ciclo interrompido. Para reativar sua assinatura e liberar novos cadastros e edições, será necessário quitar este valor pendente.`
    : "";

  const blocoDebitoHtml = temDebito
    ? `
      <div style="background-color: #FFF5F5; border-left: 4px solid #E53E3E; padding: 16px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; font-size: 14px; color: #742A2A; font-weight: 600;">
          Valor em aberto do ciclo interrompido:
        </p>
        <p style="margin: 6px 0 0 0; font-size: 20px; font-weight: 800; color: #9B2C2C;">
          ${valorFormatado}
        </p>
        <p style="margin: 8px 0 0 0; font-size: 13px; color: #742A2A; line-height: 1.4;">
          Para reativar sua assinatura e liberar novos registros, será necessário quitar este valor pendente.
        </p>
      </div>
    `
    : "";

  const texto = `${saudacaoTexto}

A assinatura da clínica ${nomeClinica} no Iris foi cancelada.

A partir de agora, a conta passou para o modo somente-leitura. Você e sua equipe continuam com acesso completo para consultar, visualizar e exportar todos os dados e prontuários já registrados — nenhuma informação foi perdida.${blocoDebitoTexto}

Se o cancelamento foi realizado por engano ou revogação involuntária no aplicativo do banco, você pode regularizar e reativar sua assinatura a qualquer momento acessando o link:
${urlAssinatura}

Seus dados e históricos permanecem protegidos.`;

  const html = renderizarLayoutEmail({
    tituloHeader: "Sua assinatura foi cancelada",
    conteudoHtml: `
      <p style="margin-top: 0;">${saudacaoHtml}</p>
      <p>A assinatura da clínica <strong>${nomeClinicaEscapado}</strong> na plataforma Iris foi cancelada.</p>
      <p>A partir deste momento, sua conta passou para o modo <strong>somente-leitura</strong>. Você e sua equipe mantêm acesso completo para consultar, visualizar e exportar todos os prontuários, evoluções e relatórios já cadastrados — nenhum dado foi apagado.</p>
      ${blocoDebitoHtml}
      <p>Se o cancelamento ocorreu por engano ou revogação involuntária no aplicativo do banco, você pode regularizar e reativar sua conta a qualquer momento:</p>
      
      <p style="margin: 32px 0; text-align: center;">
        <a href="${urlAssinatura}" style="background-color: #1A1A1A; color: #FFFFFF; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 2px 2px 0px #718096;">
          Reativar assinatura
        </a>
      </p>

      <p style="font-size: 14px; color: #718096;">
        Link direto:<br>
        <a href="${urlAssinatura}" style="color: #2B6CB0; word-break: break-all;">${urlAssinatura}</a>
      </p>
    `,
    rodapeContexto:
      "A exportação e consulta de prontuários continuam liberadas a qualquer momento.",
  });

  return { assunto, texto, html };
}
