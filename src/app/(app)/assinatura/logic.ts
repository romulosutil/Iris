import "server-only";
import { eq } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { appUser, clinic } from "@/db/schema";
import { iniciarAtivacao } from "@/lib/billing/subscription";
import type {
  AutorizacaoPendente,
  MetodoPagamento,
} from "@/lib/billing/provider";

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
};

const METODOS: readonly string[] = ["cartao", "pix"];

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

  const metodoRaw = String(formData.get("metodo") ?? "").trim();
  if (!METODOS.includes(metodoRaw)) {
    return { error: "Escolha a forma de pagamento: cartão ou Pix." };
  }
  const metodo = metodoRaw as MetodoPagamento;

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
    return linha;
  });

  if (!dados?.nome) {
    return { error: "Clínica não encontrada." };
  }
  if (!dados.email) {
    // Sem e-mail o gateway não consegue emitir cobrança nem notificar. Falhar
    // aqui com mensagem acionável é melhor que criar uma assinatura órfã.
    return {
      error:
        "Defina o responsável pela conta (com e-mail) antes de contratar a assinatura.",
    };
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://irisclinica.ia.br";

  try {
    const { autorizacao } = await iniciarAtivacao({
      clinicId: ctx.clinicId,
      nomeClinica: dados.nome,
      emailResponsavel: dados.email,
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
    console.error("[assinatura] falha ao iniciar ativação", {
      clinicId: ctx.clinicId,
      err: e,
    });
    return {
      error:
        "Não foi possível abrir o pagamento agora. Tente de novo em alguns instantes.",
    };
  }
}
