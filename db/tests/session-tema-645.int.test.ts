import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

/**
 * #645 — `session_tema`: isolamento por tenant, promoção idempotente na
 * aprovação, e o expurgo levando o tema junto.
 *
 * As três coisas que a issue chama de não-opcionais são medidas aqui contra o
 * Postgres real, não deduzidas do DDL: uma policy que parece certa no `.sql` e
 * um `ON DELETE CASCADE` que ninguém exercitou já custaram caro neste repo.
 */

const CLINIC_A = "00000000-0000-0000-0000-00000645a001";
const CLINIC_B = "00000000-0000-0000-0000-00000645b001";
const U_COORD_A = "00000000-0000-0000-0000-0006450000a1";
const U_COORD_B = "00000000-0000-0000-0000-0006450000b1";
const PAC_A = "00000000-0000-0000-0000-000645000a01";
const PAC_B = "00000000-0000-0000-0000-000645000b01";
const SESS_A1 = "00000000-0000-0000-0000-000645001a01";
const SESS_A2 = "00000000-0000-0000-0000-000645001a02";
const SESS_B1 = "00000000-0000-0000-0000-000645001b01";

const ctxA = {
  clinicId: CLINIC_A,
  userId: U_COORD_A,
  role: "coordenador",
} as const;
const ctxB = {
  clinicId: CLINIC_B,
  userId: U_COORD_B,
  role: "coordenador",
} as const;

let owner: ReturnType<typeof postgres>;
let withTenant: typeof import("@/db/rls").withTenant;
let appSql: typeof import("@/db/client").sql;
let schema: typeof import("@/db/schema");
let drizzleOps: typeof import("drizzle-orm");
let loadCanonicalContext: typeof import("@/lib/extraction/context-loader").loadCanonicalContext;
let aprovarExtracao: typeof import("@/app/(app)/revisao/[sessionId]/logic").aprovarExtracao;

/** Semeia clínicas, pacientes e sessões. Não semeia tema — cada teste põe o seu. */
async function semear() {
  await owner`TRUNCATE clinic, app_user, user_role, patient RESTART IDENTITY CASCADE`;
  await owner`INSERT INTO clinic (id, nome, is_demo) VALUES
    (${CLINIC_A}, 'Clínica A (tema 645)', false),
    (${CLINIC_B}, 'Clínica B (tema 645)', false)`;
  await owner`INSERT INTO app_user (id, name, email) VALUES
    (${U_COORD_A}, 'Coord A 645', 'coord.a.tema645@t.com'),
    (${U_COORD_B}, 'Coord B 645', 'coord.b.tema645@t.com')`;
  await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
    (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
    (${U_COORD_B}, ${CLINIC_B}, 'coordenador')`;
  // `clinical_modality = 'conventional'` é o que faz o loader escolher o ramo
  // do modo convencional — sem isso o teste do `historico_relevante` mediria
  // o ramo errado e passaria por acidente.
  await owner`INSERT INTO patient (id, clinic_id, nome, clinical_modality) VALUES
    (${PAC_A}, ${CLINIC_A}, 'Paciente A 645', 'conventional'),
    (${PAC_B}, ${CLINIC_B}, 'Paciente B 645', 'conventional')`;
  await owner`INSERT INTO session
      (id, clinic_id, patient_id, terapeuta_id, agendada_para, disciplina,
       numero_sequencial_paciente, estado)
    VALUES
      (${SESS_A1}, ${CLINIC_A}, ${PAC_A}, ${U_COORD_A}, '2026-09-01T14:00:00Z', 'Psicologia', 1, 'realizada'),
      (${SESS_A2}, ${CLINIC_A}, ${PAC_A}, ${U_COORD_A}, '2026-09-08T14:00:00Z', 'Psicologia', 2, 'realizada'),
      (${SESS_B1}, ${CLINIC_B}, ${PAC_B}, ${U_COORD_B}, '2026-09-01T14:00:00Z', 'Psicologia', 1, 'realizada')`;
}

async function inserirTema(args: {
  clinicId: string;
  sessionId: string;
  patientId: string;
  tema: string;
  temaChave: string;
  estado: "sugerido" | "aprovado";
}) {
  await owner`INSERT INTO session_tema
      (clinic_id, session_id, patient_id, tema, tema_chave, estado)
    VALUES (${args.clinicId}, ${args.sessionId}, ${args.patientId},
            ${args.tema}, ${args.temaChave}, ${args.estado})`;
}

describe.skipIf(!hasDb)("#645 · session_tema", () => {
  beforeAll(async () => {
    ({ withTenant } = await import("@/db/rls"));
    ({ sql: appSql } = await import("@/db/client"));
    schema = await import("@/db/schema");
    drizzleOps = await import("drizzle-orm");
    ({ loadCanonicalContext } =
      await import("@/lib/extraction/context-loader"));
    ({ aprovarExtracao } =
      await import("@/app/(app)/revisao/[sessionId]/logic"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await semear();
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("isolamento por tenant: a clínica B não enxerga o tema da clínica A", async () => {
    await owner`DELETE FROM session_tema`;
    await inserirTema({
      clinicId: CLINIC_A,
      sessionId: SESS_A1,
      patientId: PAC_A,
      tema: "luto do pai",
      temaChave: "luto pai",
      estado: "aprovado",
    });

    const { eq } = drizzleOps;
    const vistoPorA = await withTenant(ctxA, (tx) =>
      tx
        .select({ tema: schema.sessionTema.tema })
        .from(schema.sessionTema)
        .where(eq(schema.sessionTema.patientId, PAC_A)),
    );
    expect(vistoPorA.map((r) => r.tema)).toEqual(["luto do pai"]);

    const vistoPorB = await withTenant(ctxB, (tx) =>
      tx.select({ tema: schema.sessionTema.tema }).from(schema.sessionTema),
    );
    expect(vistoPorB).toEqual([]);
  });

  test("isolamento na ESCRITA: a clínica B não grava tema no paciente da A", async () => {
    await expect(
      withTenant(ctxB, (tx) =>
        tx.insert(schema.sessionTema).values({
          clinicId: CLINIC_A,
          sessionId: SESS_A1,
          patientId: PAC_A,
          tema: "invasao",
          temaChave: "invasao",
          estado: "aprovado",
        }),
      ),
    ).rejects.toThrow();

    const invasoes = await owner<{ total: string }[]>`
      SELECT count(*)::text AS total FROM session_tema WHERE tema = 'invasao'`;
    expect(invasoes[0]!.total).toBe("0");
  });

  test("unicidade por (session_id, tema_chave): a mesma chave não duplica", async () => {
    await owner`DELETE FROM session_tema`;
    await inserirTema({
      clinicId: CLINIC_A,
      sessionId: SESS_A1,
      patientId: PAC_A,
      tema: "luto do pai",
      temaChave: "luto pai",
      estado: "aprovado",
    });
    await expect(
      inserirTema({
        clinicId: CLINIC_A,
        sessionId: SESS_A1,
        patientId: PAC_A,
        // grafia diferente, MESMA chave — é o caso que a #645 usa de exemplo
        tema: "luto pelo pai",
        temaChave: "luto pai",
        estado: "sugerido",
      }),
    ).rejects.toThrow(/uq_session_tema_chave/);
  });

  test("promoção é idempotente: o segundo UPDATE não reescreve revisado_em", async () => {
    await owner`DELETE FROM session_tema`;
    await inserirTema({
      clinicId: CLINIC_A,
      sessionId: SESS_A1,
      patientId: PAC_A,
      tema: "ansiedade",
      temaChave: "ansiedade",
      estado: "sugerido",
    });

    const { and, eq } = drizzleOps;
    const promover = () =>
      withTenant(ctxA, (tx) =>
        tx
          .update(schema.sessionTema)
          .set({ estado: "aprovado", revisadoEm: new Date() })
          .where(
            and(
              eq(schema.sessionTema.sessionId, SESS_A1),
              eq(schema.sessionTema.estado, "sugerido"),
            ),
          )
          .returning({ id: schema.sessionTema.id }),
      );

    const primeira = await promover();
    expect(primeira).toHaveLength(1);
    const [depoisDaPrimeira] = await owner<{ revisado_em: Date }[]>`
      SELECT revisado_em FROM session_tema WHERE tema_chave = 'ansiedade'`;

    const segunda = await promover();
    expect(segunda).toHaveLength(0); // nada a promover — não duplica nem carimba de novo

    const [depoisDaSegunda] = await owner<{ revisado_em: Date }[]>`
      SELECT revisado_em FROM session_tema WHERE tema_chave = 'ansiedade'`;
    expect(depoisDaSegunda!.revisado_em.getTime()).toBe(
      depoisDaPrimeira!.revisado_em.getTime(),
    );

    const ansiedades = await owner<{ total: string }[]>`
      SELECT count(*)::text AS total FROM session_tema WHERE tema_chave = 'ansiedade'`;
    expect(ansiedades[0]!.total).toBe("1");
  });

  test("historico_relevante do modo convencional lê o APROVADO e ignora o sugerido", async () => {
    await owner`DELETE FROM session_tema`;
    await inserirTema({
      clinicId: CLINIC_A,
      sessionId: SESS_A1,
      patientId: PAC_A,
      tema: "luto do pai",
      temaChave: "luto pai",
      estado: "aprovado",
    });
    await inserirTema({
      clinicId: CLINIC_A,
      sessionId: SESS_A2,
      patientId: PAC_A,
      tema: "luto pelo pai",
      temaChave: "luto pai",
      estado: "aprovado",
    });
    await inserirTema({
      clinicId: CLINIC_A,
      sessionId: SESS_A2,
      patientId: PAC_A,
      tema: "insonia",
      temaChave: "insonia",
      estado: "sugerido",
    });

    const contexto = await withTenant(ctxA, (tx) =>
      loadCanonicalContext(tx, {
        sessionId: SESS_A2,
        patientId: PAC_A,
        clinicId: CLINIC_A,
      }),
    );

    const historico = (
      contexto as { historico_relevante?: Array<Record<string, unknown>> }
    ).historico_relevante;
    expect(historico).toEqual([
      {
        tema: "luto pelo pai", // grafia da sessão mais recente
        resumo: expect.stringContaining("presente em 2 sessões das últimas 2"),
      },
    ]);
    // O `sugerido` NÃO entra: sugestão da IA não pode virar o contexto contra o
    // qual a própria IA é conferida (R14).
    expect(JSON.stringify(historico)).not.toContain("insonia");
  });

  test("aprovar uma extração da sessão promove os temas dela (wiring real)", async () => {
    await owner`DELETE FROM session_tema`;
    await owner`DELETE FROM extraction`;
    await inserirTema({
      clinicId: CLINIC_A,
      sessionId: SESS_A1,
      patientId: PAC_A,
      tema: "culpa",
      temaChave: "culpa",
      estado: "sugerido",
    });
    // Tema de OUTRA sessão do mesmo paciente: a promoção é por sessão, não por
    // paciente — se este virar `aprovado` junto, o gesto humano de uma revisão
    // estaria carimbando registro de uma sessão que ninguém revisou.
    await inserirTema({
      clinicId: CLINIC_A,
      sessionId: SESS_A2,
      patientId: PAC_A,
      tema: "outra sessao",
      temaChave: "outra sessao",
      estado: "sugerido",
    });

    // `ausencia_comportamento` não está em SUBTIPOS_COM_EVIDENCE: a aprovação
    // não precisa de alvo mapeado, então o que este teste mede é só a
    // promoção do tema, sem carona de outra maquinaria.
    const [ex] = await owner<{ id: string }[]>`
      INSERT INTO extraction
        (session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload)
      VALUES (${SESS_A1}, ${CLINIC_A}, 'sugerida', 'ausencia_comportamento',
              'trecho', 'alta', '{}'::jsonb)
      RETURNING id`;

    const r = await aprovarExtracao(ctxA, { extractionId: ex!.id, versao: 1 });
    expect(r).toMatchObject({ ok: true });

    const linhas = await owner<{ tema_chave: string; estado: string }[]>`
      SELECT tema_chave, estado FROM session_tema ORDER BY tema_chave`;
    expect(linhas).toEqual([
      { tema_chave: "culpa", estado: "aprovado" },
      { tema_chave: "outra sessao", estado: "sugerido" },
    ]);
  });

  test("expurgo do prontuário leva os temas junto (cascata medida, não presumida)", async () => {
    await owner`DELETE FROM session_tema`;
    await inserirTema({
      clinicId: CLINIC_B,
      sessionId: SESS_B1,
      patientId: PAC_B,
      tema: "tema da clinica B",
      temaChave: "clinica tema b",
      estado: "aprovado",
    });

    const antes = await owner<{ total: string }[]>`
      SELECT count(*)::text AS total FROM session_tema WHERE patient_id = ${PAC_B}`;
    expect(antes[0]!.total).toBe("1");

    // O expurgo real (`app_purgar_paciente_interno`, 0128) apaga `session` e
    // `patient`; o que se mede aqui é que a cascata das FKs de `session_tema`
    // acompanha — é por ela que a tabela nova fica coberta sem
    // `CREATE OR REPLACE` da função de expurgo.
    await owner`DELETE FROM session WHERE patient_id = ${PAC_B}`;
    const depois = await owner<{ total: string }[]>`
      SELECT count(*)::text AS total FROM session_tema WHERE patient_id = ${PAC_B}`;
    expect(depois[0]!.total).toBe("0");
  });
});
