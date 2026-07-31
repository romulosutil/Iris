/**
 * Integração — criarContaEClinica (Fatia A, #163, Task 5).
 *
 * Núcleo do cadastro self-service: idempotente e retomável. Reentrar com o
 * mesmo e-mail conclui o que faltou em vez de duplicar ou travar — ver
 * docstring de src/auth/cadastro.ts para o porquê (provisionUser roda fora de
 * qualquer transação nossa).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

describe.skipIf(!hasDb)("criarContaEClinica — núcleo do cadastro self-service", () => {
  beforeAll(() => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
  });

  afterAll(async () => {
    await owner?.end();
    await authSql.end();
    await appSql.end();
  });

  beforeEach(async () => {
    await owner`TRUNCATE clinic, app_user, user_role, auth_account, professional_consent RESTART IDENTITY CASCADE`;
  });

  it("cria usuário coordenador da clínica nova, com aceite registrado", async () => {
    const email = `t${Date.now()}@exemplo.com.br`;
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
    const email = `t${Date.now()}b@exemplo.com.br`;
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

  it("inicia o trial no momento do cadastro", async () => {
    const email = `t${Date.now()}c@exemplo.com.br`;
    const { clinicId } = await criarContaEClinica({ ...base, email });
    const [c] = await authDb.select().from(clinic).where(eq(clinic.id, clinicId));
    expect(c!.trialDias).toBe(7);
    expect(Date.now() - new Date(c!.trialComecoEm).getTime()).toBeLessThan(60_000);
  });

  it("retomada completa o que faltou: conta criada mas aceite/dados pendentes é concluído no retry", async () => {
    const email = `t${Date.now()}d@exemplo.com.br`;
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

  it("não duplica clínica quando o e-mail já existe mas ainda não tem vínculo (retomada da janela entre signUpEmail e user_role)", async () => {
    const email = `t${Date.now()}e@exemplo.com.br`;
    const primeira = await criarContaEClinica({ ...base, email });

    // Simula crash ANTES do user_role ter sido gravado (janela dentro de
    // provisionUser, entre signUpEmail e o insert de user_role): o app_user
    // existe, mas o vínculo não.
    await authDb.delete(userRole).where(eq(userRole.userId, primeira.userId));

    const retry = await criarContaEClinica({ ...base, email });
    expect(retry.userId).toBe(primeira.userId);

    const papeis = await authDb
      .select()
      .from(userRole)
      .where(eq(userRole.userId, primeira.userId));
    expect(papeis).toHaveLength(1);
  });

  it("recusa gravar aceite apontando para clínica sem vínculo com o usuário (professional_consent WITH CHECK(true) não valida isso — a aplicação precisa)", async () => {
    const email = `t${Date.now()}f@exemplo.com.br`;
    const { userId } = await criarContaEClinica({ ...base, email });

    const [outra] = await authDb
      .insert(clinic)
      .values({ nome: "Clínica Alheia" })
      .returning({ id: clinic.id });

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
});
