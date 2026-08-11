import "server-only";
import { eq, sql } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { appUser, clinic } from "@/db/schema";
import { validarEMaterializarCpfCnpj } from "@/lib/documento";
import { iniciarAtivacao } from "@/lib/billing/subscription";
import { BillingProviderError } from "@/lib/billing/provider";
import type {
  AutorizacaoPendente,
  MetodoPagamento,
} from "@/lib/billing/provider";

/**
 * Achata o corpo de erro do gateway em texto para o log. `JSON.stringify` pode
 * lançar (referência circular) — e um throw DENTRO do handler de erro trocaria
 * a falha real por outra, apagando o diagnóstico que esta função existe para
 * preservar.
 */
function serializar(valor: unknown): string {
  if (valor === undefined) return "";
  try {
    return JSON.stringify(valor) ?? String(valor);
  } catch {
    return String(valor);
  }
}

export type AtivacaoState = {
  error?: string;
  /**
   * Como a clínica termina de autorizar o vínculo: redirect para o checkout do
   * gateway OU BR Code do Pix para copiar/ler no app do banco (D21). Não é uma
   * URL: tratar o copia-e-cola como link foi exatamente o bug que a porta de
   * billing passou a impedir por tipo.
   *
   * Ausente quando o provedor não devolveu forma alguma (vínculo pendente
   * antigo, cuja forma não ficou guardada) — a tela então não oferece link nem
   * QR, em vez de renderizar um `href` vazio.
   */
  autorizacao?: AutorizacaoPendente;
  /**
   * O documento como a clínica digitou, devolvido para repopular o campo. Sem
   * isto, todo erro (documento inválido, gateway fora do ar) apaga o que foi
   * digitado — e o formulário não é controlado, então não há outro caminho de
   * volta. Vai o texto BRUTO, não os dígitos: quem digitou com máscara vê a
   * máscara de novo.
   */
  documento?: string;
  /**
   * O mesmo texto de `error`, mas só quando a recusa é do CAMPO de documento.
   * Existe para a tela renderizar a mensagem JUNTO do input (o `<Field>` liga o
   * `aria-describedby` sozinho) em vez de só num alerta no topo, que obriga
   * quem usa leitor de tela a caçar qual campo errou. Falha de gateway continua
   * vindo só em `error`: ela não pertence a campo nenhum.
   */
  erroDocumento?: string;
};

/**
 * Núcleo testável da ativação da assinatura (#36).
 *
 * Recebe `ctx` como parâmetro e NÃO é exportado por `actions.ts` — só via
 * wrapper que deriva o tenant do servidor (convenção anti-"ctx forjável",
 * issue #55, verificada por `src/security/ctx-forjavel-guard.test.ts`).
 *
 * Só coordenador contrata. Recepção cadastra paciente, mas não assume
 * obrigação financeira em nome da clínica.
 */
export async function iniciarAtivacaoAssinatura(
  ctx: TenantContext,
  formData: FormData,
): Promise<AtivacaoState> {
  requireRole(ctx, "coordenador");

  // Fixo, não vindo do formulário: a escolha cartão/Pix saiu da tela porque
  // nenhum adapter lê `NovoVinculo.metodo` (o do Asaas sempre emite Pix
  // Automático, o do Mercado Pago sempre `preapproval`). Ler um campo do corpo
  // para depois ignorá-lo deixaria a mentira viva um nível abaixo — e o valor
  // ainda é persistido em `subscription.metodo_pagamento`, então precisa ser
  // verdadeiro. Volta a ser escolha quando algum adapter honrar o campo.
  const metodo: MetodoPagamento = "pix";

  // O documento do titular é exigência do gateway, não capricho de cadastro: o
  // Asaas recusa `POST /customers` sem `cpfCnpj` (400). Validar ANTES de
  // qualquer chamada é o que evita gastar um round-trip para receber de volta
  // um erro que a gente já sabia dar em pt-BR.
  const documentoBruto = String(formData.get("cpfCnpj") ?? "").trim();
  const documento = validarEMaterializarCpfCnpj(documentoBruto);
  if (!documento.valido) {
    return {
      error: documento.erro,
      erroDocumento: documento.erro,
      documento: documentoBruto,
    };
  }

  // Nome da clínica e e-mail do responsável saem por `withTenant` (role
  // `app_role`, RLS ativa) — é dado do tenant. A criação da assinatura, logo
  // abaixo, sai por `authDb`: são planos de privilégio distintos de propósito.
  const dados = await withTenant(ctx, async (tx) => {
    const [linha] = await tx
      .select({
        nome: clinic.nome,
        email: appUser.email,
      })
      .from(clinic)
      .leftJoin(appUser, eq(appUser.id, clinic.responsavelContaId))
      .where(eq(clinic.id, ctx.clinicId))
      .limit(1);

    if (linha?.nome) {
      // Grava ANTES do gateway, de propósito: se o Asaas cair no meio, o
      // documento já está na clínica e a próxima tentativa não pede de novo.
      // A ordem inversa (gateway primeiro) perderia o dado exatamente no caso
      // em que ele mais importa — o da retentativa.
      //
      // `UPDATE clinic` cru NÃO funciona aqui: a 0079 revogou UPDATE em
      // `clinic` para `app_role` e um update barrado afeta 0 linhas em
      // silêncio (#212). A escrita é a função SECURITY DEFINER da 0090, que
      // resolve o tenant pelo GUC da própria transação — clínica não entra por
      // parâmetro, então não há caminho de forjar tenant.
      await tx.execute(
        sql`SELECT app_salvar_cpf_cnpj_clinica(${documento.documentoLimpo})`,
      );
    }
    return linha;
  });

  if (!dados?.nome) {
    return { error: "Clínica não encontrada.", documento: documentoBruto };
  }
  if (!dados.email) {
    // Sem e-mail o gateway não consegue emitir cobrança nem notificar. Falhar
    // aqui com mensagem acionável é melhor que criar uma assinatura órfã.
    return {
      error:
        "Defina o responsável pela conta (com e-mail) antes de contratar a assinatura.",
      documento: documentoBruto,
    };
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://irisclinica.ia.br";

  try {
    const { autorizacao } = await iniciarAtivacao({
      clinicId: ctx.clinicId,
      nomeClinica: dados.nome,
      emailResponsavel: dados.email,
      cpfCnpj: documento.documentoLimpo,
      metodo,
      urlRetorno: `${base}/assinatura/retorno`,
    });
    // `null` (forma não guardada) vira campo ausente: o state é serializado
    // para o cliente e `undefined` some — deixar `null` obrigaria a UI a
    // distinguir dois "vazios" que significam a mesma coisa.
    return autorizacao ? { autorizacao } : {};
  } catch (e) {
    // O texto real do gateway vai para o log, não para a tela: pode conter
    // identificador de conta. O usuário recebe orientação acionável.
    // O corpo do gateway vai SERIALIZADO: `console.error` de objeto aninhado
    // imprime `{ errors: [Array] }` (o `depth` default do Node), que é
    // exatamente onde mora a mensagem do Asaas/MP. Um 400 logado assim não
    // diagnostica nada — foi o que custou uma sessão inteira de investigação.
    console.error("[assinatura] falha ao iniciar ativação", {
      clinicId: ctx.clinicId,
      err: e,
      corpoGateway:
        e instanceof BillingProviderError ? serializar(e.corpo) : undefined,
    });
    return {
      error:
        "Não foi possível abrir o pagamento agora. Tente de novo em alguns instantes.",
      documento: documentoBruto,
    };
  }
}
