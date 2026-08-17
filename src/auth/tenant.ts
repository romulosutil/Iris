import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { authDb } from "@/db/client";
import { userRole, clinic, professionalConsent } from "@/db/schema";
import { auth } from "@/auth/auth";
import { papelAtivo, type Papel } from "@/auth/papel-ativo";
import type { TenantContext } from "@/db/rls";

export const COOKIE_CLINICA = "iris_active_clinic";
export const COOKIE_PAPEL = "iris_active_role";

export type TenantResolution =
  | { status: "unauthenticated" }
  | { status: "no_access" }
  | { status: "cadastro_incompleto"; userId: string }
  | {
      status: "needs_clinic_selection";
      opcoes: { clinicId: string; nome: string }[];
    }
  | { status: "needs_role_selection"; clinicId: string; papeis: Papel[] }
  | { status: "ok"; ctx: TenantContext };

/**
 * Resolve clínica + papel ativos de forma SEGURA (A1): o cookie só indica a
 * SELEÇÃO do usuário; papel e pertencimento são sempre re-derivados de user_role.
 */
export async function resolveTenant(
  reqHeaders: Headers,
  ck: { activeClinic?: string; activeRole?: string },
): Promise<TenantResolution> {
  const session = await auth.api.getSession({ headers: reqHeaders });
  const userId = session?.user?.id;
  if (!userId) return { status: "unauthenticated" };

  // Fase 6.2b: enrollment de MFA vem do usuário do Better-Auth. Uma sessão só
  // existe após o 2º fator (o plugin não cria sessão com desafio pendente), então
  // `twoFactorEnabled` aqui já implica 2º fator satisfeito nesta sessão.
  const mfaEnrolled =
    (session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled === true;

  // Papéis do usuário em TODAS as clínicas (bootstrap via iris_auth, pré-GUC).
  const vinculos = await authDb
    .select({
      clinicId: userRole.clinicId,
      papel: userRole.papel,
      nome: clinic.nome,
    })
    .from(userRole)
    .innerJoin(clinic, eq(clinic.id, userRole.clinicId))
    .where(eq(userRole.userId, userId));

  // Usuário autenticado sem NENHUM vínculo: dois cenários distintos levam aqui,
  // e não podem receber a mesma resposta (review Task 10, achado I-2).
  //
  // 1. Cadastro self-service morreu entre criar a conta e criar a clínica (o
  //    provisionamento não é atômico — ver src/auth/cadastro.ts). Devolver
  //    "sem acesso" aqui seria beco sem saída com o e-mail já queimado.
  // 2. O usuário JÁ teve vínculo, completou o aceite de termos em alguma
  //    clínica, e depois teve TODOS os vínculos revogados (hoje nada em
  //    produção faz isso; é preparo para quando `equipe/` ganhar "remover da
  //    equipe"). Devolver "cadastro_incompleto" aqui seria armar uma
  //    escalação: o botão "Concluir cadastro" leva a `/cadastro`, e o ramo
  //    `existente` sem clínica própria qualificada de `criarContaEClinica`
  //    (`src/auth/cadastro.ts`) cria uma clínica NOVA para ele como
  //    coordenador — uma revogação virando promoção.
  //
  // Distinção usada: `professional_consent` (Task 2) nunca é apagada por
  // nenhum caminho de produção e não tem FK para `user_role` — só para
  // `app_user`/`clinic`, e sempre é escrita DEPOIS de um `user_role` existir
  // (`garantirVinculoParaConsentimento` em cadastro.ts recusa gravar sem
  // vínculo). Logo, um aceite pregresso é prova durável de que este usuário
  // teve vínculo em algum momento — mesmo que hoje esteja zerado. Ausência de
  // qualquer aceite é o caso genuinamente incompleto. Não cobre o caso ainda
  // inexistente de convite (Fase 1c) que crie `user_role` sem jamais passar
  // por `professional_consent` — registrado no BACKLOG.md.
  if (vinculos.length === 0) {
    const [acetePregresso] = await authDb
      .select({ id: professionalConsent.id })
      .from(professionalConsent)
      .where(eq(professionalConsent.userId, userId))
      .limit(1);
    if (acetePregresso) return { status: "no_access" };
    return { status: "cadastro_incompleto", userId };
  }

  const clinicasIds = [...new Set(vinculos.map((v) => v.clinicId))];

  // Escolhe a clínica ativa: cookie SÓ vale se o usuário tem papel nela.
  let clinicId: string | undefined;
  if (ck.activeClinic && clinicasIds.includes(ck.activeClinic)) {
    clinicId = ck.activeClinic;
  } else if (clinicasIds.length === 1) {
    clinicId = clinicasIds[0];
  }
  if (!clinicId) {
    const nomePorId = new Map(vinculos.map((v) => [v.clinicId, v.nome]));
    return {
      status: "needs_clinic_selection",
      opcoes: clinicasIds.map((id) => ({
        clinicId: id,
        nome: nomePorId.get(id)!,
      })),
    };
  }

  // Papéis nessa clínica → papel ativo (A2). Cookie de papel também é só seleção.
  const papeis = vinculos
    .filter((v) => v.clinicId === clinicId)
    .map((v) => v.papel as Papel);
  const resolvido = papelAtivo(papeis);
  if ("needsSelection" in resolvido) {
    if (
      ck.activeRole &&
      (resolvido.needsSelection as string[]).includes(ck.activeRole)
    ) {
      return {
        status: "ok",
        ctx: { clinicId, userId, role: ck.activeRole as Papel, mfaEnrolled },
      };
    }
    return {
      status: "needs_role_selection",
      clinicId,
      papeis: resolvido.needsSelection,
    };
  }
  return {
    status: "ok",
    ctx: { clinicId, userId, role: resolvido.papel, mfaEnrolled },
  };
}

/**
 * Clínicas em que o usuário tem ao menos um papel (dedup por clínica). Usado
 * pelo shell para montar o switcher sem re-derivar papéis. Bootstrap via
 * `iris_auth` (pré-GUC), igual a `resolveTenant`.
 */
export async function listarClinicasDoUsuario(
  userId: string,
): Promise<{ clinicId: string; nome: string }[]> {
  const vinculos = await authDb
    .select({ clinicId: userRole.clinicId, nome: clinic.nome })
    .from(userRole)
    .innerJoin(clinic, eq(clinic.id, userRole.clinicId))
    .where(eq(userRole.userId, userId));
  const nomePorId = new Map(vinculos.map((v) => [v.clinicId, v.nome]));
  return [...nomePorId].map(([clinicId, nome]) => ({ clinicId, nome }));
}

/**
 * Açúcar server-only p/ pages/actions: resolve e redireciona conforme o status.
 * Retorna sempre um TenantContext válido (ou nunca retorna — redireciona).
 */
export async function getTenantContext(): Promise<TenantContext> {
  const ck = await cookies();
  const r = await resolveTenant(await headers(), {
    activeClinic: ck.get(COOKIE_CLINICA)?.value,
    activeRole: ck.get(COOKIE_PAPEL)?.value,
  });
  switch (r.status) {
    case "ok": {
      // Fase 6.2b (R6.2.1, hard enforcement): papel clínico sem MFA cadastrado é
      // mandado ao onboarding. BYPASS_MFA_FOR_DEV pula isto em dev (o boot já
      // impede a flag em produção — src/auth/mfa-gate.ts).
      const bypass = process.env.BYPASS_MFA_FOR_DEV === "true";
      const clinico =
        r.ctx.role === "terapeuta" || r.ctx.role === "coordenador";
      if (clinico && !r.ctx.mfaEnrolled && !bypass) redirect("/mfa/setup");
      return r.ctx;
    }
    case "unauthenticated":
      redirect("/login");
    case "no_access":
      redirect("/sem-acesso");
    case "cadastro_incompleto":
      redirect("/sem-acesso?motivo=cadastro-incompleto");
    case "needs_clinic_selection":
      redirect("/selecionar-clinica");
    case "needs_role_selection":
      redirect("/selecionar-papel");
  }
}
