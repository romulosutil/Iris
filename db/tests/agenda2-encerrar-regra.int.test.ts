import postgres from "postgres";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";
vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-0000000000d3";
const U_COORD = "00000000-0000-0000-0000-00000000c0d3";
const U_T1 = "00000000-0000-0000-0000-0000000071d3";
const PAC = "00000000-0000-0000-0000-00000000acd3";
const REGRA = "00000000-0000-0000-0000-000000009903";
const ctx = {
  clinicId: CLINIC_A,
  userId: U_COORD,
  role: "coordenador",
} as const;

// Datas relativas ao agora — evita o teste expirar com o tempo (issue #75 Etapa 0).
// `proximaSessaoDaRegra` filtra por `now()`, então as futuras precisam estar de
// fato no futuro em cada execução. Meio-dia UTC (09:00 SP) fica seguro dentro do dia.
function isoMaisDias(dias: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
const VIG_INI = isoMaisDias(-30); // início da vigência da regra (bem no passado)
const PASSADO = isoMaisDias(-14); // sessão realizada (passado)
const HOJE = isoMaisDias(0); // cutoff de encerramento ("hoje fica, amanhã+ sai")
const FUT_1 = isoMaisDias(7); // próxima futura agendada
const FUT_2 = isoMaisDias(14); // futura agendada seguinte

let owner: ReturnType<typeof postgres>;
let q: typeof import("@/app/(app)/agenda/queries");

describe.skipIf(!hasDb)("encerrarRegra / contarFuturas / proximaSessao", () => {
  beforeAll(async () => {
    q = await import("@/app/(app)/agenda/queries");
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
  });
  beforeEach(async () => {
    await owner`TRUNCATE clinic, app_user, user_role, patient, agendamento_recorrente, session RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome, timezone) VALUES (${CLINIC_A}, 'A', 'America/Sao_Paulo')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES (${U_COORD}, 'C', 'c@d3'), (${U_T1}, 'T', 't@d3')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_COORD}, ${CLINIC_A}, 'coordenador'), (${U_T1}, ${CLINIC_A}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC_A}, 'Ana')`;
    await owner`INSERT INTO agendamento_recorrente
      (id, clinic_id, patient_id, terapeuta_id, disciplina, dia_semana, hora_inicio, duracao_min, vigencia_inicio, status)
      VALUES (${REGRA}, ${CLINIC_A}, ${PAC}, ${U_T1}, 'aba', 1, '09:00', 60, ${VIG_INI}, 'ativo')`;
    // passado realizada + duas futuras agendadas (relativas ao agora)
    await owner`INSERT INTO session (clinic_id, patient_id, terapeuta_id, recorrente_id, agendada_para, estado, duracao_min, tipo, disciplina) VALUES
      (${CLINIC_A}, ${PAC}, ${U_T1}, ${REGRA}, ${`${PASSADO}T12:00:00Z`}, 'realizada', 60, 'terapia', 'aba'),
      (${CLINIC_A}, ${PAC}, ${U_T1}, ${REGRA}, ${`${FUT_1}T12:00:00Z`}, 'agendada', 60, 'terapia', 'aba'),
      (${CLINIC_A}, ${PAC}, ${U_T1}, ${REGRA}, ${`${FUT_2}T12:00:00Z`}, 'agendada', 60, 'terapia', 'aba')`;
  });

  test("contarFuturasDaRegra conta só agendadas a partir de amanhã", async () => {
    // encerrar hoje → futuras (FUT_1, FUT_2) = 2
    expect(await q.contarFuturasDaRegra(ctx, REGRA, HOJE)).toBe(2);
  });

  test("encerrarRegra remove futuras agendadas e preserva passado (D-5)", async () => {
    const { removidas } = await q.encerrarRegra(ctx, REGRA, HOJE);
    expect(removidas).toBe(2);
    const rest =
      await owner`SELECT estado FROM session WHERE recorrente_id = ${REGRA} ORDER BY agendada_para`;
    expect(rest.map((r) => r.estado)).toEqual(["realizada"]); // só o passado sobra
    const [regra] =
      await owner`SELECT status, vigencia_fim::text AS vigencia_fim FROM agendamento_recorrente WHERE id = ${REGRA}`;
    expect(regra!.status).toBe("encerrado");
    expect(regra!.vigencia_fim).toBe(HOJE);
  });

  test("proximaSessaoDaRegra devolve a menor futura", async () => {
    const prox = await q.proximaSessaoDaRegra(ctx, REGRA);
    expect(prox).toBe(FUT_1); // o passado já passou
  });
});
