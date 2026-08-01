/**
 * Integração — SIMETRIA DE TRABALHO do cadastro self-service (Fatia A, #163,
 * Task 7, rodada de correção 2).
 *
 * Por que este arquivo existe separado de `cadastro.int.test.ts`: o que ele
 * defende não é comportamento funcional, é uma propriedade de CUSTO. A resposta
 * uniforme da rota pública (`src/app/(auth)/cadastro/logic.ts`) normaliza o
 * tempo com um piso, mas piso é curativo — ele só funciona enquanto todos os
 * ramos couberem embaixo dele, e ninguém garante isso em hardware que a gente
 * não mediu. A barreira de verdade é os ramos fazerem o MESMO trabalho caro.
 *
 * O ramo que quebrava essa simetria: `verificarPossePorSenha` saía por
 * `!credencial?.password` ANTES de qualquer scrypt. Conta sem credencial de
 * senha é o estado normal de quem entrou por convite ou por seed — ou seja, um
 * conjunto real de e-mails respondia 20x mais rápido que os demais.
 *
 * Medido contra Postgres real + Better-Auth real, ANTES da correção:
 *   ramo SEM-CREDENCIAL  p50=3ms    ramo SENHA-ERRADA  p50=60ms
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { hasDb } from "@tests/integration-env";

vi.mock("server-only", () => ({}));

const { criarContaEClinica, CredencialInvalida } = await import("./cadastro");
const { authDb, authSql, sql: appSql } = await import("@/db/client");
const { appUser, clinic, userRole } = await import("@/db/schema");

let owner: ReturnType<typeof postgres>;
let criados: string[] = [];

const base = {
  senha: "Senha Forte 123",
  nome: "Simetria Teste",
  nomeClinica: "Clínica Simetria",
  conselho: "crp",
  registroNumero: "06/123456",
  registroUf: "SP",
  versaoTermo: "2026-07-30",
};

function emailUnico(sufixo: string): string {
  const email = `sim${Date.now()}${Math.random().toString(36).slice(2, 8)}${sufixo}@exemplo.com.br`;
  criados.push(email);
  return email;
}

async function limparContaPorEmail(email: string): Promise<void> {
  const [u] = await authDb
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, email))
    .limit(1);
  if (!u) return;
  const clinicIds = new Set<string>();
  for (const v of await authDb
    .select({ clinicId: userRole.clinicId })
    .from(userRole)
    .where(eq(userRole.userId, u.id)))
    clinicIds.add(v.clinicId);
  for (const c of await authDb
    .select({ id: clinic.id })
    .from(clinic)
    .where(eq(clinic.responsavelContaId, u.id)))
    clinicIds.add(c.id);
  await owner`DELETE FROM professional_consent WHERE user_id = ${u.id}`;
  for (const id of clinicIds)
    await owner`UPDATE clinic SET responsavel_conta_id = NULL WHERE id = ${id}`;
  await authDb.delete(userRole).where(eq(userRole.userId, u.id));
  for (const id of clinicIds) await owner`DELETE FROM clinic WHERE id = ${id}`;
  await owner`DELETE FROM auth_account WHERE user_id = ${u.id}`;
  await authDb.delete(appUser).where(eq(appUser.id, u.id));
}

/** Mediana de várias amostras — imune ao pico ocasional de agendamento. */
async function medianaMs(n: number, fn: () => Promise<void>): Promise<number> {
  const xs: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = Date.now();
    await fn();
    xs.push(Date.now() - t);
  }
  return xs.sort((a, b) => a - b)[Math.floor(n / 2)]!;
}

describe.skipIf(!hasDb)(
  "cadastro — simetria de trabalho entre os ramos",
  () => {
    beforeAll(() => {
      owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    });

    afterAll(async () => {
      await owner?.end();
      await authSql.end();
      await appSql.end();
    });

    afterEach(async () => {
      for (const email of criados) await limparContaPorEmail(email);
      criados = [];
    });

    it("conta SEM credencial de senha custa o mesmo que senha errada (scrypt dummy)", async () => {
      const comSenha = emailUnico("comsenha");
      await criarContaEClinica({ ...base, email: comSenha });

      const semSenha = emailUnico("semsenha");
      await criarContaEClinica({ ...base, email: semSenha });
      const [u] = await authDb
        .select({ id: appUser.id })
        .from(appUser)
        .where(eq(appUser.email, semSenha))
        .limit(1);
      // Vira o estado "conta existe, nunca definiu senha" (convite, seed).
      await owner`DELETE FROM auth_account WHERE user_id = ${u!.id}`;

      const tentarErrada = async (email: string) => {
        await criarContaEClinica({
          ...base,
          email,
          senha: "Senha Errada 999",
        }).then(
          () => {
            throw new Error("esperava CredencialInvalida");
          },
          (e) => {
            if (!(e instanceof CredencialInvalida)) throw e;
          },
        );
      };

      // Aquecimento: a primeira chamada do ramo dummy deriva o hash memoizado, e
      // essa derivação é um custo único de processo, não do ramo.
      await tentarErrada(semSenha);
      await tentarErrada(comSenha);

      const msSemSenha = await medianaMs(5, () => tentarErrada(semSenha));
      const msComSenha = await medianaMs(5, () => tentarErrada(comSenha));

      // Antes da correção: 3ms vs 60ms (razão ~0.05). O limite de 0.5 é folgado
      // de propósito — o que se defende é a ORDEM DE GRANDEZA, não um número
      // exato, porque a máquina de CI não é a de produção.
      expect(
        msSemSenha / msComSenha,
        `sem-credencial=${msSemSenha}ms com-credencial=${msComSenha}ms — ` +
          "o ramo sem credencial está saindo antes do scrypt e virou oráculo de tempo",
      ).toBeGreaterThan(0.5);
    }, 120_000);
  },
);
