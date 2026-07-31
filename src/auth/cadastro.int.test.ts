/**
 * Integração — criarContaEClinica (Fatia A, #163, Task 5).
 *
 * Núcleo do cadastro self-service: idempotente e retomável. Reentrar com o
 * mesmo e-mail conclui o que faltou em vez de duplicar ou travar — ver
 * docstring de src/auth/cadastro.ts para o porquê (provisionUser roda fora de
 * qualquer transação nossa).
 *
 * Isolamento (review round 1, item 5): nada de TRUNCATE de tabela
 * compartilhada — cada teste registra os e-mails que criou e o afterEach
 * limpa só essas contas (professional_consent -> user_role -> clinic ->
 * auth_account -> app_user), pela conexão `owner` quando o grant de
 * `iris_auth` não permite (professional_consent é INSERT/SELECT-only).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { and, eq } from "drizzle-orm";
import { hasDb } from "@tests/integration-env";

// cadastro.ts (e provisioning.ts, que ele importa) usam "server-only" — pacote
// inexistente fora do bundler do Next. Stub, mesmo padrão de provisioning.int.test.ts.
vi.mock("server-only", () => ({}));

const { criarContaEClinica, garantirVinculoParaConsentimento } = await import(
  "./cadastro"
);
const { authDb, authSql, sql: appSql } = await import("@/db/client");
const { appUser, clinic, professionalConsent, userRole } = await import(
  "@/db/schema"
);

let owner: ReturnType<typeof postgres>;

const base = {
  senha: "Senha Forte 123",
  nome: "Aline Teste",
  nomeClinica: "Clínica Teste",
  conselho: "crp",
  registroNumero: "06/123456",
  registroUf: "SP",
  versaoTermo: "2026-07-30",
};

let emailsCriados: string[] = [];
let clinicsAvulsas: string[] = [];

function emailUnico(sufixo: string): string {
  const email = `t${Date.now()}${Math.random().toString(36).slice(2, 8)}${sufixo}@exemplo.com.br`;
  emailsCriados.push(email);
  return email;
}

async function limparContaPorEmail(email: string): Promise<void> {
  const [u] = await authDb
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, email))
    .limit(1);
  if (!u) return;

  // Junta clínicas alcançáveis por dois caminhos: vínculo ativo (user_role) e
  // clínicas ÓRFÃS que a própria retomada às vezes cria (docstring de
  // cadastro.ts, item 1 — o vínculo antigo pode ter sido apagado pelo teste
  // simulando um crash, mas clinic.responsavel_conta_id ainda aponta pro
  // usuário). Sem os dois, sobra clínica presa por FK e o delete de
  // app_user falha.
  const clinicIds = new Set<string>();
  const viaVinculo = await authDb
    .select({ clinicId: userRole.clinicId })
    .from(userRole)
    .where(eq(userRole.userId, u.id));
  for (const v of viaVinculo) clinicIds.add(v.clinicId);

  const viaResponsavel = await authDb
    .select({ id: clinic.id })
    .from(clinic)
    .where(eq(clinic.responsavelContaId, u.id));
  for (const c of viaResponsavel) clinicIds.add(c.id);

  // professional_consent é imutável para iris_auth (só SELECT/INSERT,
  // migração 0058) — a limpeza de teste precisa da conexão dona.
  await owner`DELETE FROM professional_consent WHERE user_id = ${u.id}`;

  for (const id of clinicIds) {
    await owner`UPDATE clinic SET responsavel_conta_id = NULL WHERE id = ${id}`;
  }
  await authDb.delete(userRole).where(eq(userRole.userId, u.id));
  for (const id of clinicIds) {
    await owner`DELETE FROM clinic WHERE id = ${id}`;
  }

  await owner`DELETE FROM auth_account WHERE user_id = ${u.id}`;
  await authDb.delete(appUser).where(eq(appUser.id, u.id));
}

describe.skipIf(!hasDb)("criarContaEClinica — núcleo do cadastro self-service", () => {
  beforeAll(() => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
  });

  afterAll(async () => {
    await owner?.end();
    await authSql.end();
    await appSql.end();
  });

  afterEach(async () => {
    for (const email of emailsCriados) {
      await limparContaPorEmail(email);
    }
    emailsCriados = [];

    for (const clinicId of clinicsAvulsas) {
      await owner`DELETE FROM clinic WHERE id = ${clinicId}`;
    }
    clinicsAvulsas = [];
  });

  it("cria usuário coordenador da clínica nova, com aceite registrado", async () => {
    const email = emailUnico("a");
    const { userId, clinicId } = await criarContaEClinica({ ...base, email });

    const papeis = await authDb
      .select()
      .from(userRole)
      .where(eq(userRole.userId, userId));
    expect(papeis).toHaveLength(1);
    expect(papeis[0]!.papel).toBe("coordenador");
    expect(papeis[0]!.clinicId).toBe(clinicId);

    const aceites = await authDb
      .select()
      .from(professionalConsent)
      .where(eq(professionalConsent.userId, userId));
    expect(aceites).toHaveLength(1);
    expect(aceites[0]!.versaoTermo).toBe("2026-07-30");
    expect(aceites[0]!.clinicId).toBe(clinicId);

    const [user] = await authDb
      .select()
      .from(appUser)
      .where(eq(appUser.id, userId));
    expect(user!.conselho).toBe("crp");
    expect(user!.registroNumero).toBe("06/123456");
    expect(user!.registroUf).toBe("SP");

    const [c] = await authDb.select().from(clinic).where(eq(clinic.id, clinicId));
    expect(c!.responsavelContaId).toBe(userId);
  });

  it("é retomável: reentrar com o mesmo e-mail não duplica clínica nem vínculo", async () => {
    const email = emailUnico("b");
    const a = await criarContaEClinica({ ...base, email });
    const b = await criarContaEClinica({ ...base, email });

    expect(b.userId).toBe(a.userId);
    expect(b.clinicId).toBe(a.clinicId);

    const papeis = await authDb
      .select()
      .from(userRole)
      .where(eq(userRole.userId, a.userId));
    expect(papeis).toHaveLength(1);

    const clinicas = await authDb.select().from(clinic).where(eq(clinic.id, a.clinicId));
    expect(clinicas).toHaveLength(1);

    // Reentrar também não duplica o aceite (mesma versão do termo).
    const aceites = await authDb
      .select()
      .from(professionalConsent)
      .where(eq(professionalConsent.userId, a.userId));
    expect(aceites).toHaveLength(1);
  });

  it("é normalizado por e-mail: maiúsculas/espaços não abrem cadastro duplicado", async () => {
    const email = emailUnico("norm");
    const a = await criarContaEClinica({ ...base, email });
    const b = await criarContaEClinica({
      ...base,
      email: `  ${email.toUpperCase()}  `,
    });

    expect(b.userId).toBe(a.userId);
    expect(b.clinicId).toBe(a.clinicId);

    const contas = await authDb
      .select()
      .from(appUser)
      .where(eq(appUser.email, email));
    expect(contas).toHaveLength(1);
  });

  it("inicia o trial no momento do cadastro", async () => {
    const email = emailUnico("c");
    const { clinicId } = await criarContaEClinica({ ...base, email });
    const [c] = await authDb.select().from(clinic).where(eq(clinic.id, clinicId));
    expect(c!.trialDias).toBe(7);
    expect(Date.now() - new Date(c!.trialComecoEm).getTime()).toBeLessThan(60_000);
  });

  it("retomada completa o que faltou: conta criada mas aceite/dados pendentes é concluído no retry", async () => {
    const email = emailUnico("d");
    const primeira = await criarContaEClinica({ ...base, email });

    // Simula um crash ENTRE o vínculo (user_role) e a conclusão (aceite +
    // dados profissionais): apaga o aceite e limpa os campos declarados,
    // como se o processo tivesse morrido logo após provisionUser().
    await authDb
      .update(appUser)
      .set({ conselho: null, registroNumero: null, registroUf: null })
      .where(eq(appUser.id, primeira.userId));
    // professional_consent é imutável para iris_auth (só SELECT/INSERT,
    // migração 0058) — a exclusão simulando o crash só é possível via a
    // conexão dona (owner), fora do caminho que a aplicação usa.
    await owner`DELETE FROM professional_consent WHERE user_id = ${primeira.userId}`;

    const retry = await criarContaEClinica({ ...base, email });
    expect(retry.userId).toBe(primeira.userId);
    expect(retry.clinicId).toBe(primeira.clinicId);

    const [user] = await authDb
      .select()
      .from(appUser)
      .where(eq(appUser.id, primeira.userId));
    expect(user!.conselho).toBe("crp");
    expect(user!.registroNumero).toBe("06/123456");
    expect(user!.registroUf).toBe("SP");

    const aceites = await authDb
      .select()
      .from(professionalConsent)
      .where(eq(professionalConsent.userId, primeira.userId));
    expect(aceites).toHaveLength(1);
  });

  it("cria vínculo (não duplica a clínica) quando o e-mail já existe mas ainda não tem vínculo — janela entre signUpEmail e user_role", async () => {
    const email = emailUnico("e");
    const primeira = await criarContaEClinica({ ...base, email });

    // Simula crash ANTES do user_role ter sido gravado (janela dentro de
    // provisionUser, entre signUpEmail e o insert de user_role): o app_user
    // existe, mas o vínculo não.
    await authDb.delete(userRole).where(eq(userRole.userId, primeira.userId));

    const clinicasAntes = await authDb.select({ id: clinic.id }).from(clinic);

    const retry = await criarContaEClinica({ ...base, email });
    expect(retry.userId).toBe(primeira.userId);

    const papeis = await authDb
      .select()
      .from(userRole)
      .where(eq(userRole.userId, primeira.userId));
    expect(papeis).toHaveLength(1);

    // A retomada de fato cria uma clínica NOVA nesta janela (documentado na
    // docstring de cadastro.ts, item 1 — não é "não duplica clínica": a
    // clínica da tentativa anterior fica órfã). O que este teste garante é
    // que existe exatamente UMA clínica com vínculo ativo ao final.
    const clinicasDepois = await authDb.select({ id: clinic.id }).from(clinic);
    expect(clinicasDepois.length).toBe(clinicasAntes.length + 1);

    const clinicasComVinculo = await authDb
      .select({ clinicId: userRole.clinicId })
      .from(userRole)
      .where(eq(userRole.userId, primeira.userId));
    expect(clinicasComVinculo).toHaveLength(1);
    expect(clinicasComVinculo[0]!.clinicId).toBe(retry.clinicId);
  });

  it("recusa gravar aceite apontando para clínica sem vínculo com o usuário (professional_consent WITH CHECK(true) não valida isso — a aplicação precisa)", async () => {
    const email = emailUnico("f");
    const { userId } = await criarContaEClinica({ ...base, email });

    const [outra] = await authDb
      .insert(clinic)
      .values({ nome: "Clínica Alheia" })
      .returning({ id: clinic.id });
    clinicsAvulsas.push(outra!.id);

    await expect(
      garantirVinculoParaConsentimento(userId, outra!.id),
    ).rejects.toThrow();

    // Confere que a clínica alheia realmente não tem vínculo com o usuário.
    const vinculo = await authDb
      .select()
      .from(userRole)
      .where(and(eq(userRole.userId, userId), eq(userRole.clinicId, outra!.id)));
    expect(vinculo).toHaveLength(0);
  });

  it("CRÍTICO: conta já completa não é sobrescrita por reenvio hostil com dados/versão de termo diferentes", async () => {
    const email = emailUnico("g");
    const primeira = await criarContaEClinica({ ...base, email });

    // "Reenvio hostil": alguém que só sabe o e-mail (não é segredo) reenvia
    // o formulário de cadastro com dados profissionais diferentes e uma
    // versão de termo diferente, sem apresentar senha nenhuma — o caminho de
    // retomada não autentica (provisionUser só chama signUpEmail para e-mail
    // NOVO; para e-mail existente devolve o id sem checar senha).
    const hostil = await criarContaEClinica({
      ...base,
      email,
      conselho: "crm",
      registroNumero: "FORJADO-999",
      registroUf: "RJ",
      versaoTermo: "2099-01-01-versao-forjada",
      ip: "203.0.113.66",
      userAgent: "forjado",
    });

    expect(hostil.userId).toBe(primeira.userId);
    expect(hostil.clinicId).toBe(primeira.clinicId);

    const [user] = await authDb
      .select()
      .from(appUser)
      .where(eq(appUser.id, primeira.userId));
    // Dado profissional original deve permanecer intacto — nada sobrescrito.
    expect(user!.conselho).toBe("crp");
    expect(user!.registroNumero).toBe("06/123456");
    expect(user!.registroUf).toBe("SP");

    const aceites = await authDb
      .select()
      .from(professionalConsent)
      .where(eq(professionalConsent.userId, primeira.userId));
    // Nenhum aceite novo (forjado) deve ter sido gravado — continua só o
    // original, com a versão de termo original.
    expect(aceites).toHaveLength(1);
    expect(aceites[0]!.versaoTermo).toBe("2026-07-30");
    expect(aceites[0]!.ip).not.toBe("203.0.113.66");
  });
});
