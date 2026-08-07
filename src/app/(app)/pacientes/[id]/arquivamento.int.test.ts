import postgres from "postgres";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { hasDb } from "@tests/integration-env";
vi.mock("server-only", () => ({}));

/**
 * #174 — o motivo do arquivamento chega inteiro em `audit_log.detalhe`, e só
 * quem a policy `patient_update` autoriza consegue mexer no estado.
 *
 * Por que contra Postgres e não com dublê: as duas coisas que este arquivo
 * afirma são efeitos de banco. `detalhe` é jsonb — um teste que checasse o
 * objeto em memória passaria mesmo se a coluna não recebesse nada. E o
 * terapeuta barrado é o caso caro: sem `requireRole`, o UPDATE não estoura,
 * ele afeta **0 linhas em silêncio** (RLS filtra, não recusa), e a tela diria
 * "arquivado" sobre um paciente que continua contando na fatura.
 */

const CLINIC_A = "00000000-0000-0000-0000-0000000000a1";
const U_COORD = "00000000-0000-0000-0000-0000000c01a1";
const U_T1 = "00000000-0000-0000-0000-0000000071a1";
const PAC = "00000000-0000-0000-0000-0000000ac1a1";

const ctxCoord = {
  clinicId: CLINIC_A,
  userId: U_COORD,
  role: "coordenador",
} as const;
const ctxT1 = { clinicId: CLINIC_A, userId: U_T1, role: "terapeuta" } as const;

const MOTIVO = "Família encerrou o acompanhamento em dezembro.";
const MOTIVO_VOLTA = "Paciente retomou o acompanhamento nesta semana.";

let owner: ReturnType<typeof postgres>;
let A: typeof import("./logic");
let appSql: typeof import("@/db/client").sql;

async function estadoDoPaciente(): Promise<Date | null> {
  const [row] = await owner`SELECT arquivado_em FROM patient WHERE id = ${PAC}`;
  return (row!.arquivado_em as Date | null) ?? null;
}

async function trilha(): Promise<
  {
    acao: string;
    detalhe: Record<string, unknown> | null;
    ator_id: string | null;
  }[]
> {
  return (await owner`
    SELECT acao, detalhe, ator_id FROM audit_log
    WHERE patient_id = ${PAC} ORDER BY criado_em ASC, acao ASC
  `) as unknown as {
    acao: string;
    detalhe: Record<string, unknown> | null;
    ator_id: string | null;
  }[];
}

describe.skipIf(!hasDb)("#174 · arquivamento comercial com motivo", () => {
  beforeAll(async () => {
    A = await import("./logic");
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, patient, audit_log
      RESTART IDENTITY CASCADE`;
    // `isento_trial` para tirar o guard de escrita (#163) da equação: o que
    // está sob teste aqui é o motivo e o papel, não o estado da assinatura.
    await owner`INSERT INTO clinic (id, nome, isento_trial) VALUES (${CLINIC_A}, 'A', true)`;
    await owner`INSERT INTO app_user (id, email, name) VALUES
      (${U_COORD}, 'c@x.com', 'Coord'), (${U_T1}, 't1@x.com', 'T1')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC_A}, 'coordenador'),
      (${U_T1}, ${CLINIC_A}, 'terapeuta')`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  beforeEach(async () => {
    await owner`DELETE FROM audit_log WHERE patient_id = ${PAC}`;
    await owner`DELETE FROM patient WHERE id = ${PAC}`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC_A}, 'P')`;
  });

  test("arquivar grava o motivo em audit_log.detalhe, junto da origem", async () => {
    const r = await A.arquivarPaciente(ctxCoord, PAC, MOTIVO);
    expect(r.error).toBeUndefined();
    expect(await estadoDoPaciente()).not.toBeNull();

    const linhas = await trilha();
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.acao).toBe("paciente_arquivado");
    expect(linhas[0]!.ator_id).toBe(U_COORD);
    expect(linhas[0]!.detalhe).toEqual({ origem: "manual", motivo: MOTIVO });
  });

  test("desarquivar também exige e grava motivo — a volta muda a fatura igual", async () => {
    await A.arquivarPaciente(ctxCoord, PAC, MOTIVO);
    const r = await A.desarquivarPaciente(ctxCoord, PAC, MOTIVO_VOLTA);
    expect(r.error).toBeUndefined();
    expect(await estadoDoPaciente()).toBeNull();

    const linhas = await trilha();
    expect(linhas.map((l) => l.acao)).toEqual([
      "paciente_arquivado",
      "paciente_desarquivado",
    ]);
    expect(linhas[1]!.detalhe).toEqual({
      origem: "manual",
      motivo: MOTIVO_VOLTA,
    });
  });

  test("o motivo é gravado com trim, não como o usuário digitou", async () => {
    await A.arquivarPaciente(ctxCoord, PAC, `   ${MOTIVO}   `);
    const linhas = await trilha();
    expect((linhas[0]!.detalhe as { motivo: string }).motivo).toBe(MOTIVO);
  });

  test("motivo vazio ou curto demais recusa e NÃO arquiva", async () => {
    for (const ruim of ["", "   ", "curto"]) {
      const r = await A.arquivarPaciente(ctxCoord, PAC, ruim);
      expect(r.error).toBeTruthy();
      expect(r.ok).toBeUndefined();
    }
    // O ponto: antes do #174 estas chamadas arquivariam com sucesso e sem
    // motivo nenhum. O estado do banco é a única prova que discrimina.
    expect(await estadoDoPaciente()).toBeNull();
    expect(await trilha()).toHaveLength(0);
  });

  test("motivo acima do teto de 500 caracteres é recusado", async () => {
    const r = await A.arquivarPaciente(ctxCoord, PAC, "a".repeat(501));
    expect(r.error).toBeTruthy();
    expect(await estadoDoPaciente()).toBeNull();
  });

  test("terapeuta é barrado (requireRole), e o paciente continua contando", async () => {
    await expect(A.arquivarPaciente(ctxT1, PAC, MOTIVO)).rejects.toThrow();
    expect(await estadoDoPaciente()).toBeNull();
    expect(await trilha()).toHaveLength(0);

    // E na volta também: desarquivar é a mesma fronteira de autorização.
    await A.arquivarPaciente(ctxCoord, PAC, MOTIVO);
    await expect(
      A.desarquivarPaciente(ctxT1, PAC, MOTIVO_VOLTA),
    ).rejects.toThrow();
    expect(await estadoDoPaciente()).not.toBeNull();
  });

  test("recepção arquiva (mesmo predicado da policy patient_update)", async () => {
    const ctxRecep = {
      clinicId: CLINIC_A,
      userId: U_COORD,
      role: "admin_recepcao",
    } as const;
    const r = await A.arquivarPaciente(ctxRecep, PAC, MOTIVO);
    expect(r.error).toBeUndefined();
    expect(await estadoDoPaciente()).not.toBeNull();
  });

  test("arquivar duas vezes é idempotente e não duplica trilha", async () => {
    await A.arquivarPaciente(ctxCoord, PAC, MOTIVO);
    const primeiro = await estadoDoPaciente();
    const r = await A.arquivarPaciente(
      ctxCoord,
      PAC,
      "Clique repetido do coordenador.",
    );
    expect(r.error).toBeUndefined();
    expect((await estadoDoPaciente())?.getTime()).toBe(primeiro?.getTime());
    expect(await trilha()).toHaveLength(1);
  });
});
