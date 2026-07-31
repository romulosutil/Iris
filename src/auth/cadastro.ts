import "server-only";
import { and, eq } from "drizzle-orm";
import { authDb } from "@/db/client";
import { appUser, clinic, professionalConsent, userRole } from "@/db/schema";
import { provisionUser } from "@/auth/provisioning";

export type EntradaCadastro = {
  email: string;
  senha: string;
  nome: string;
  nomeClinica: string;
  conselho: string;
  registroNumero: string;
  registroUf: string;
  versaoTermo: string;
  ip?: string;
  userAgent?: string;
};

export type ResultadoCadastro = { userId: string; clinicId: string };

/**
 * Cria conta + clínica no cadastro self-service (#163).
 *
 * NÃO É ATÔMICO, e isso é por limitação real: `provisionUser` chama
 * `auth.api.signUpEmail`, que roda no adapter do Better-Auth, fora de qualquer
 * transação nossa. Em vez de fingir atomicidade, a função é IDEMPOTENTE E
 * RETOMÁVEL: reentrar com o mesmo e-mail conclui o que faltou. Sem isso, uma
 * falha no meio deixaria o usuário sem clínica — beco sem saída em /sem-acesso,
 * com o e-mail do interessado já queimado.
 *
 * Estados parciais alcançáveis e como o retry resolve cada um (ver
 * task-5-report.md para o detalhe dos testes que cobrem cada caso):
 *
 * 1. Crash ANTES de `provisionUser` gravar `user_role` (app_user já existe —
 *    signUpEmail é side-effect do Better-Auth fora da nossa transação — mas o
 *    vínculo ainda não foi gravado): o retry NÃO encontra `vinculo`, então
 *    cria uma clínica NOVA e chama `provisionUser` de novo — que reconhece o
 *    e-mail existente e só grava o `user_role` que faltava. A clínica da
 *    tentativa anterior (se de fato existiu) fica órfã (sem `user_role`, sem
 *    `responsavel_conta_id`) — lixo inofensivo (sem dado de paciente), não
 *    dado privado exposto. Fora do escopo desta tarefa remover órfãs; registrado
 *    no BACKLOG.
 * 2. Crash DEPOIS de `user_role` gravado mas ANTES de completar os dados
 *    declarados (conselho/registro) ou o aceite: o retry ENCONTRA o vínculo,
 *    então NÃO cria clínica nem usuário novos, mas ainda assim roda os passos
 *    de conclusão (update idempotente dos dados declarados + upsert do
 *    aceite) — por isso eles NUNCA ficam dentro do bloco "só roda se for
 *    usuário novo". Um retorno antecipado ali é o bug que este módulo evita
 *    deliberadamente.
 * 3. Reentrada dupla (retry do cliente, ou duplo-clique) com tudo já
 *    completo: todo passo é um upsert idempotente (update com os mesmos
 *    valores, ou um `select` antes do `insert` do aceite) — devolve o mesmo
 *    resultado sem duplicar nada.
 * 4. Duas requisições CONCORRENTES para o mesmo e-mail nunca visto antes: a
 *    unicidade de `app_user.email` decide uma corrida — uma delas pode
 *    receber erro de violação de unicidade do Better-Auth em vez de sucesso.
 *    Não é resolvido por esta função (não há lock); o cliente que recebeu erro
 *    deve reenviar, e o reenvio cai no caminho normal de retomada (item 3).
 */
export async function criarContaEClinica(
  e: EntradaCadastro,
): Promise<ResultadoCadastro> {
  const [existente] = await authDb
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, e.email))
    .limit(1);

  let userId: string;
  let clinicId: string;

  if (existente) {
    const [vinculo] = await authDb
      .select({ clinicId: userRole.clinicId })
      .from(userRole)
      .where(eq(userRole.userId, existente.id))
      .limit(1);

    if (vinculo) {
      userId = existente.id;
      clinicId = vinculo.clinicId;
    } else {
      // app_user existe (signUpEmail já rodou numa tentativa anterior) mas o
      // vínculo não foi gravado — retoma criando o vínculo que faltou.
      // provisionUser é idempotente por e-mail: reconhece o app_user
      // existente e devolve o mesmo id, sem chamar signUpEmail de novo.
      const criado = await criarClinicaEVinculo(e);
      userId = criado.userId;
      clinicId = criado.clinicId;
    }
  } else {
    const criado = await criarClinicaEVinculo(e);
    userId = criado.userId;
    clinicId = criado.clinicId;
  }

  // Passos de conclusão: sempre rodam, mesmo em retomada — idempotentes por
  // construção (update com os mesmos valores; insert do aceite guardado por
  // select prévio). É isto que garante que uma falha ENTRE o vínculo e a
  // conclusão (dados declarados + aceite) seja sanada no próximo retry, em
  // vez de deixar o usuário permanentemente sem aceite registrado.
  await authDb
    .update(appUser)
    .set({
      conselho: e.conselho,
      registroNumero: e.registroNumero,
      registroUf: e.registroUf,
    })
    .where(eq(appUser.id, userId));

  await authDb
    .update(clinic)
    .set({ responsavelContaId: userId })
    .where(eq(clinic.id, clinicId));

  await garantirVinculoParaConsentimento(userId, clinicId);

  const [aceiteExistente] = await authDb
    .select({ id: professionalConsent.id })
    .from(professionalConsent)
    .where(
      and(
        eq(professionalConsent.userId, userId),
        eq(professionalConsent.clinicId, clinicId),
        eq(professionalConsent.versaoTermo, e.versaoTermo),
      ),
    )
    .limit(1);

  if (!aceiteExistente) {
    await authDb.insert(professionalConsent).values({
      userId,
      clinicId,
      versaoTermo: e.versaoTermo,
      ip: e.ip,
      userAgent: e.userAgent,
    });
  }

  return { userId, clinicId };
}

/** Cria a clínica e provisiona (ou reaproveita) o usuário coordenador dela. */
async function criarClinicaEVinculo(
  e: EntradaCadastro,
): Promise<ResultadoCadastro> {
  const [nova] = await authDb
    .insert(clinic)
    .values({ nome: e.nomeClinica })
    .returning({ id: clinic.id });
  const clinicId = nova!.id;

  const { userId } = await provisionUser({
    email: e.email,
    nome: e.nome,
    senha: e.senha,
    clinicId,
    papel: "coordenador",
  });

  return { userId, clinicId };
}

/**
 * Confere que existe vínculo (`user_role`) entre `userId` e `clinicId` antes
 * de permitir a gravação do aceite (`professional_consent`).
 *
 * Necessário porque a policy de INSERT de `professional_consent` para
 * `iris_auth` é `WITH CHECK (true)` (migração 0058, de propósito — ver
 * comentário lá): o banco NÃO valida que `clinic_id`/`user_id` são coerentes
 * entre si. Essa validação é responsabilidade da aplicação — é o que esta
 * função faz, e falha ruidosamente (em vez de gravar um aceite apontando
 * para uma clínica sem relação com o usuário) se a coerência não se sustenta.
 */
export async function garantirVinculoParaConsentimento(
  userId: string,
  clinicId: string,
): Promise<void> {
  const [vinculo] = await authDb
    .select({ userId: userRole.userId })
    .from(userRole)
    .where(and(eq(userRole.userId, userId), eq(userRole.clinicId, clinicId)))
    .limit(1);

  if (!vinculo) {
    throw new Error(
      `cadastro: usuário ${userId} não tem vínculo (user_role) com a clínica ${clinicId} — recusando gravar aceite de termos (professional_consent) para evitar registro incoerente.`,
    );
  }
}
