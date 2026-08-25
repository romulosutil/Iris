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
 * #352 — registrar e desfazer ALTA CLÍNICA.
 *
 * Contra Postgres, e não com dublê, porque tudo o que este arquivo afirma é
 * efeito de banco:
 *
 * - `alta_em` é a porta de entrada da fila de expurgo. Antes de #352 nenhum
 *   caminho do app escrevia nessa coluna, e a fila era vazia em produção por
 *   construção — não por falta de vencimentos.
 * - **Registrar alta arquiva o paciente, e quem arquiva é o TRIGGER**
 *   (`patient_alta_arquiva_trg`, `0065`). Um teste em memória não veria esse
 *   efeito e alguém "consertaria" duplicando o `set({arquivadoEm})` no app.
 * - **Desfazer alta NÃO desarquiva** (R352.A7). O trigger só age na transição
 *   `NULL → NOT NULL`; a prova é medir `arquivado_em` na ida-volta-ida.
 * - O terapeuta barrado é o caso caro: sem `requireRole`, o UPDATE não estoura,
 *   ele afeta 0 linhas em silêncio (RLS filtra, não recusa) e a tela diria
 *   "alta registrada" sobre um prontuário cujo relógio de retenção não começou.
 */

const CLINIC_A = "00000000-0000-0000-0000-0000000000a2";
const U_COORD = "00000000-0000-0000-0000-0000000c01a2";
const U_T1 = "00000000-0000-0000-0000-0000000071a2";
const PAC = "00000000-0000-0000-0000-0000000ac1a2";

const ctxCoord = {
  clinicId: CLINIC_A,
  userId: U_COORD,
  role: "coordenador",
} as const;
const ctxT1 = { clinicId: CLINIC_A, userId: U_T1, role: "terapeuta" } as const;
const ctxRecep = {
  clinicId: CLINIC_A,
  userId: U_COORD,
  role: "admin_recepcao",
} as const;

const DATA = "2026-03-10";
const DATA_CORRIGIDA = "2025-03-10";
const MOTIVO = "Encerramento do acompanhamento acordado com a família.";
const MOTIVO_VOLTA = "Data digitada errada no registro anterior.";

let owner: ReturnType<typeof postgres>;
let A: typeof import("./logic");
let appSql: typeof import("@/db/client").sql;

async function estadoDoPaciente(): Promise<{
  alta_em: string | null;
  arquivado_em: Date | null;
}> {
  const [row] = await owner`
    SELECT alta_em::text AS alta_em, arquivado_em FROM patient WHERE id = ${PAC}
  `;
  return row as unknown as {
    alta_em: string | null;
    arquivado_em: Date | null;
  };
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

describe.skipIf(!hasDb)("#352 · registrar e desfazer alta clínica", () => {
  beforeAll(async () => {
    A = await import("./logic");
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, patient, audit_log
      RESTART IDENTITY CASCADE`;
    // `isento_trial` tira o guard de escrita (#163) da equação: o que está sob
    // teste é a alta, não o estado da assinatura. O caso de conta bloqueada tem
    // teste próprio, no fim do arquivo.
    await owner`INSERT INTO clinic (id, nome, isento_trial) VALUES (${CLINIC_A}, 'A352', true)`;
    await owner`INSERT INTO app_user (id, email, name) VALUES
      (${U_COORD}, 'coord+352alta@a.test', 'Coord'),
      (${U_T1}, 'tera+352alta@a.test', 'T1')`;
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
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC_A}, 'P352')`;
  });

  test("registrar grava alta_em com a data escolhida e a trilha na mesma transação", async () => {
    const r = await A.registrarAlta(ctxCoord, PAC, DATA, MOTIVO);
    expect(r.error).toBeUndefined();

    const estado = await estadoDoPaciente();
    expect(estado.alta_em).toBe(DATA);

    const linhas = await trilha();
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.acao).toBe("alta_registrada");
    expect(linhas[0]!.ator_id).toBe(U_COORD);
    expect(linhas[0]!.detalhe).toEqual({ origem: "manual", motivo: MOTIVO });
  });

  test("quem arquiva é o trigger do banco, não o app", async () => {
    // R352.A6. Se o app duplicasse o efeito este teste continuaria verde — por
    // isso o par que discrimina é o de baixo: desfazer NÃO desarquiva.
    await A.registrarAlta(ctxCoord, PAC, DATA, MOTIVO);
    expect((await estadoDoPaciente()).arquivado_em).not.toBeNull();
  });

  test("desfazer zera alta_em, grava trilha e NÃO desarquiva", async () => {
    await A.registrarAlta(ctxCoord, PAC, DATA, MOTIVO);
    const arquivadoNaIda = (await estadoDoPaciente()).arquivado_em;

    const r = await A.desfazerAlta(ctxCoord, PAC, MOTIVO_VOLTA);
    expect(r.error).toBeUndefined();

    const estado = await estadoDoPaciente();
    expect(estado.alta_em).toBeNull();
    // R352.A7: desarquivar é ato próprio. Reverter aqui reescreveria a base de
    // faturamento por causa de uma correção de data clínica.
    expect(estado.arquivado_em?.getTime()).toBe(arquivadoNaIda?.getTime());

    const linhas = await trilha();
    expect(linhas.map((l) => l.acao)).toEqual([
      "alta_registrada",
      "alta_desfeita",
    ]);
    expect(linhas[1]!.detalhe).toEqual({
      origem: "manual",
      motivo: MOTIVO_VOLTA,
    });
  });

  test("ida-volta-ida deixa a SEGUNDA data e mantém o arquivamento", async () => {
    await A.registrarAlta(ctxCoord, PAC, DATA, MOTIVO);
    const arquivadoNaIda = (await estadoDoPaciente()).arquivado_em;

    await A.desfazerAlta(ctxCoord, PAC, MOTIVO_VOLTA);
    const r = await A.registrarAlta(ctxCoord, PAC, DATA_CORRIGIDA, MOTIVO);
    expect(r.error).toBeUndefined();

    const estado = await estadoDoPaciente();
    expect(estado.alta_em).toBe(DATA_CORRIGIDA);
    // O trigger não reage à segunda ida (`arquivado_em` já não era NULL), e
    // isso é o esperado: o carimbo do arquivamento não se reescreve.
    expect(estado.arquivado_em?.getTime()).toBe(arquivadoNaIda?.getTime());
    expect((await trilha()).map((l) => l.acao)).toEqual([
      "alta_registrada",
      "alta_desfeita",
      "alta_registrada",
    ]);
  });

  test("registrar duas vezes é idempotente e não duplica trilha", async () => {
    await A.registrarAlta(ctxCoord, PAC, DATA, MOTIVO);
    const r = await A.registrarAlta(
      ctxCoord,
      PAC,
      DATA_CORRIGIDA,
      "Clique repetido do coordenador.",
    );
    expect(r.error).toBeUndefined();
    // A data NÃO é regravada: regravar moveria o vencimento do prazo de guarda
    // e reabriria o aviso prévio (dedup ancorado em `criado_em > alta_em`).
    expect((await estadoDoPaciente()).alta_em).toBe(DATA);
    expect(await trilha()).toHaveLength(1);
  });

  test("data futura é recusada e nada é gravado", async () => {
    const amanha = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const r = await A.registrarAlta(ctxCoord, PAC, amanha, MOTIVO);
    expect(r.error).toBe("A data da alta não pode ser futura.");
    expect((await estadoDoPaciente()).alta_em).toBeNull();
    expect(await trilha()).toHaveLength(0);
  });

  test("data malformada ou inexistente é recusada", async () => {
    for (const ruim of ["", "10/03/2026", "2026-02-31"]) {
      const r = await A.registrarAlta(ctxCoord, PAC, ruim, MOTIVO);
      expect(r.error).toBeTruthy();
      expect(r.ok).toBeUndefined();
    }
    expect((await estadoDoPaciente()).alta_em).toBeNull();
    expect(await trilha()).toHaveLength(0);
  });

  test("motivo vazio ou curto demais recusa e NÃO dá alta", async () => {
    for (const ruim of ["", "   ", "curto"]) {
      const r = await A.registrarAlta(ctxCoord, PAC, DATA, ruim);
      expect(r.error).toBeTruthy();
    }
    expect((await estadoDoPaciente()).alta_em).toBeNull();
    expect(await trilha()).toHaveLength(0);
  });

  test("o motivo é gravado com trim, não como o usuário digitou", async () => {
    await A.registrarAlta(ctxCoord, PAC, DATA, `   ${MOTIVO}   `);
    const linhas = await trilha();
    expect((linhas[0]!.detalhe as { motivo: string }).motivo).toBe(MOTIVO);
  });

  test("terapeuta e recepção são barrados — alta é ato de coordenador", async () => {
    await expect(A.registrarAlta(ctxT1, PAC, DATA, MOTIVO)).rejects.toThrow();
    // A recepção ARQUIVA (a policy `patient_update` deixa), mas não dá alta:
    // alta abre o relógio de retenção, e quem o dispara é quem responde pelo
    // prontuário.
    await expect(
      A.registrarAlta(ctxRecep, PAC, DATA, MOTIVO),
    ).rejects.toThrow();
    expect((await estadoDoPaciente()).alta_em).toBeNull();
    expect(await trilha()).toHaveLength(0);

    await A.registrarAlta(ctxCoord, PAC, DATA, MOTIVO);
    await expect(A.desfazerAlta(ctxT1, PAC, MOTIVO_VOLTA)).rejects.toThrow();
    expect((await estadoDoPaciente()).alta_em).toBe(DATA);
  });

  test("conta em somente-leitura não registra alta (R352.A5)", async () => {
    // Alta é escrita clínica ordinária — o oposto do expurgo, que roda SEM
    // `comEscrita` porque eliminar dado vencido é obrigação legal da clínica.
    await owner`UPDATE clinic SET isento_trial = false, trial_dias = 7,
      trial_comeco_em = now() - interval '60 days' WHERE id = ${CLINIC_A}`;
    try {
      const r = await A.registrarAlta(ctxCoord, PAC, DATA, MOTIVO);
      expect(r.ok).toBeUndefined();
      expect(r.bloqueioConta).toBeTruthy();
      expect((await estadoDoPaciente()).alta_em).toBeNull();
      expect(await trilha()).toHaveLength(0);
    } finally {
      await owner`UPDATE clinic SET isento_trial = true WHERE id = ${CLINIC_A}`;
    }
  });
});
