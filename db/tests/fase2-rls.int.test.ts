import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;

// IDs fixos do seed — reusados pelas Tasks 4-8.
const CLINIC_A = "00000000-0000-0000-0000-0000000000a1";
const CLINIC_B = "00000000-0000-0000-0000-0000000000b1";
const U_COORD_A = "00000000-0000-0000-0000-00000000c0a1";
const U_T1_A = "00000000-0000-0000-0000-0000000071a1";
const U_T2_A = "00000000-0000-0000-0000-0000000072a1";
const U_RECEP_A = "00000000-0000-0000-0000-0000000052a1";
const U_T1_B = "00000000-0000-0000-0000-0000000071b1";
const PAC_A1 = "00000000-0000-0000-0000-00000000ac1a";
const PROTO_A = "00000000-0000-0000-0000-00000070c0a1";
const PROTO_A2 = "00000000-0000-0000-0000-00000070c0a2"; // usado só p/ J4 (evita choque com uq_session_protocol_scope)
const SESS_A1 = "00000000-0000-0000-0000-00000005e1a1"; // terapeuta = T1
const MILE_A = "00000000-0000-0000-0000-00000000d1a1";
const PAC_B1 = "00000000-0000-0000-0000-00000000ac1b";
const PROTO_B = "00000000-0000-0000-0000-00000070c0b1";
const MILE_B = "00000000-0000-0000-0000-00000000d1b1";
const SESS_B1 = "00000000-0000-0000-0000-00000005e1b1"; // terapeuta = T1B, clínica B
const PROTOCOL_FAMILIA = "aba_marcos_desenvolvimento";

const ctxCoordA = { clinicId: CLINIC_A, userId: U_COORD_A, role: "coordenador" } as const;
const ctxT1A = { clinicId: CLINIC_A, userId: U_T1_A, role: "terapeuta" } as const;
const ctxT2A = { clinicId: CLINIC_A, userId: U_T2_A, role: "terapeuta" } as const;
const ctxRecepA = { clinicId: CLINIC_A, userId: U_RECEP_A, role: "admin_recepcao" } as const;
const ctxT1B = { clinicId: CLINIC_B, userId: U_T1_B, role: "terapeuta" } as const;

let owner: ReturnType<typeof postgres>;
let withTenant: typeof import("@/db/rls").withTenant;
let appSql: typeof import("@/db/client").sql;
let schema: typeof import("@/db/schema");

describe.skipIf(!hasDb)("Fase 2 · RLS das tabelas de metas e diário", () => {
  beforeAll(async () => {
    ({ withTenant } = await import("@/db/rls"));
    ({ sql: appSql } = await import("@/db/client"));
    schema = await import("@/db/schema");
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
      protocol, session, session_note, session_protocol_scope, audio_capture, extraction,
      goal, goal_milestone_mapping, milestone, goal_candidacy, milestone_candidacy
      RESTART IDENTITY CASCADE`;

    // Catálogo de família de protocolo (FK obrigatória de `protocol.familia`) —
    // idempotente pois não é truncado (catálogo global, não por tenant).
    await owner`INSERT INTO protocol_familia_catalogo (id, nome) VALUES
      (${PROTOCOL_FAMILIA}, 'Marcos de desenvolvimento (ABA)')
      ON CONFLICT (id) DO NOTHING`;

    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINIC_A}, 'Clínica A', false), (${CLINIC_B}, 'Clínica B', false)`;
    // app_user usa `name` (tabela `user` do Better-Auth), não `nome`.
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a@t.com'),
      (${U_T1_A}, 'Terapeuta 1 A', 't1.a@t.com'),
      (${U_T2_A}, 'Terapeuta 2 A', 't2.a@t.com'),
      (${U_RECEP_A}, 'Recepção A', 'recep.a@t.com'),
      (${U_T1_B}, 'Terapeuta 1 B', 't1.b@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_T1_A}, ${CLINIC_A}, 'terapeuta'),
      (${U_T2_A}, ${CLINIC_A}, 'terapeuta'),
      (${U_RECEP_A}, ${CLINIC_A}, 'admin_recepcao'),
      (${U_T1_B}, ${CLINIC_B}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC_A1}, ${CLINIC_A}, 'Paciente A1')`;
    await owner`INSERT INTO protocol (id, clinic_id, nome, disciplina, familia) VALUES
      (${PROTO_A}, ${CLINIC_A}, 'VB-MAPP demo', 'ABA', ${PROTOCOL_FAMILIA}),
      (${PROTO_A2}, ${CLINIC_A}, 'VB-MAPP demo 2 (J4)', 'ABA', ${PROTOCOL_FAMILIA})`;
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado) VALUES
      (${SESS_A1}, ${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, now(), 'presente')`;
    // T1 está na equipe do paciente A1 (para app_is_on_team). care_team_membership
    // não tem clinic_id — só patient_id/user_id/disciplina/papel_na_equipe/vigência —
    // e `papel_na_equipe` é restrito por CHECK a terapeuta_referencia|coordenador_referencia|substituto.
    await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe)
      VALUES (${PAC_A1}, ${U_T1_A}, 'ABA', 'terapeuta_referencia')`;

    await owner`INSERT INTO milestone (id, protocol_id, dominio_id, nome, tipo_estrutura, estrutura)
      VALUES (${MILE_A}, ${PROTO_A}, 'mando', 'Pedir item preferido', 'marco_simples', ${owner.json({ escala: [] })})`;

    // Fixtures da clínica B — para testes I1/I2/I3 (cross-tenant / policies novas).
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC_B1}, ${CLINIC_B}, 'Paciente B1')`;
    await owner`INSERT INTO protocol (id, clinic_id, nome, disciplina, familia) VALUES
      (${PROTO_B}, ${CLINIC_B}, 'VB-MAPP demo B', 'ABA', ${PROTOCOL_FAMILIA})`;
    await owner`INSERT INTO milestone (id, protocol_id, dominio_id, nome, tipo_estrutura, estrutura)
      VALUES (${MILE_B}, ${PROTO_B}, 'mando', 'Pedir item preferido (B)', 'marco_simples', ${owner.json({ escala: [] })})`;
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado) VALUES
      (${SESS_B1}, ${CLINIC_B}, ${PAC_B1}, ${U_T1_B}, now(), 'presente')`;
    await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe)
      VALUES (${PAC_B1}, ${U_T1_B}, 'ABA', 'terapeuta_referencia')`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  // ---------- session_note ----------
  test("terapeuta dono escreve e lê a própria nota da sessão", async () => {
    const [nota] = await withTenant(ctxT1A, (tx) =>
      tx.insert(schema.sessionNote).values({
        sessionId: SESS_A1, clinicId: CLINIC_A, tipo: "captura_rapida",
        texto: "Pediu água e apontou", autorId: U_T1_A,
      }).returning({ id: schema.sessionNote.id }),
    );
    expect(nota?.id).toBeTruthy();

    const lidas = await withTenant(ctxT1A, (tx) =>
      tx.select().from(schema.sessionNote),
    );
    expect(lidas.length).toBe(1);
  });

  test("recepção NÃO lê nota clínica (guardrail #1)", async () => {
    const lidas = await withTenant(ctxRecepA, (tx) =>
      tx.select().from(schema.sessionNote),
    );
    expect(lidas.length).toBe(0);
  });

  test("terapeuta de outra clínica não vê a nota (cross-tenant)", async () => {
    const lidas = await withTenant(ctxT1B, (tx) =>
      tx.select().from(schema.sessionNote),
    );
    expect(lidas.length).toBe(0);
  });

  test("terapeuta que não é dono da sessão não escreve a nota", async () => {
    await expect(
      withTenant(ctxT2A, (tx) =>
        tx.insert(schema.sessionNote).values({
          sessionId: SESS_A1, clinicId: CLINIC_A, tipo: "nota_consolidada",
          texto: "tentativa indevida", autorId: U_T2_A,
        }),
      ),
    ).rejects.toThrow();
  });

  // ---------- goal ----------
  test("coordenador cria meta; terapeuta da equipe lê", async () => {
    const [g] = await withTenant(ctxCoordA, (tx) =>
      tx.insert(schema.goal).values({
        patientId: PAC_A1, clinicId: CLINIC_A, descricao: "Pedir água sozinho",
        criterioDominio: { tipo: "sessoes_consecutivas_independente", valor: 3 },
        criadoPor: U_COORD_A,
      }).returning({ id: schema.goal.id }),
    );
    expect(g?.id).toBeTruthy();

    const lidasT1 = await withTenant(ctxT1A, (tx) => tx.select().from(schema.goal));
    expect(lidasT1.length).toBe(1);
  });

  test("recepção não vê meta (dado clínico)", async () => {
    const lidas = await withTenant(ctxRecepA, (tx) => tx.select().from(schema.goal));
    expect(lidas.length).toBe(0);
  });

  test("terapeuta de outra clínica não vê meta (cross-tenant)", async () => {
    const lidas = await withTenant(ctxT1B, (tx) => tx.select().from(schema.goal));
    expect(lidas.length).toBe(0);
  });

  test("insert de meta com criado_por falsificado é barrado pelo WITH CHECK", async () => {
    await expect(
      withTenant(ctxT1A, (tx) =>
        tx.insert(schema.goal).values({
          patientId: PAC_A1, clinicId: CLINIC_A, descricao: "meta forjada",
          criterioDominio: { tipo: "x", valor: 1 }, criadoPor: U_COORD_A, // != app.user_id
        }),
      ),
    ).rejects.toThrow();
  });

  // ---------- J1: goal_insert/goal_update fecham authz de equipe ----------
  test("J1 · terapeuta fora da equipe do paciente NÃO cria meta (write-IDOR intra-tenant)", async () => {
    // ctxT2A é terapeuta da clínica A mas não está na equipe de PAC_A1 (só T1A está).
    await expect(
      withTenant(ctxT2A, (tx) =>
        tx.insert(schema.goal).values({
          patientId: PAC_A1, clinicId: CLINIC_A, descricao: "meta indevida (fora da equipe)",
          criterioDominio: { tipo: "sessoes_consecutivas_independente", valor: 3 },
          criadoPor: U_T2_A,
        }),
      ),
    ).rejects.toThrow();
  });

  test("J1 · terapeuta fora da equipe do paciente NÃO atualiza meta existente", async () => {
    const [g] = await withTenant(ctxCoordA, (tx) =>
      tx.select({ id: schema.goal.id }).from(schema.goal).limit(1),
    );
    // USING já bloqueia a visibilidade da linha para quem está fora da equipe —
    // 0 linhas afetadas prova o mesmo gate de authz (sem exceção do driver).
    const alterados = await withTenant(ctxT2A, (tx) =>
      tx.update(schema.goal)
        .set({ descricao: "alteração indevida" })
        .where(eq(schema.goal.id, g!.id))
        .returning({ id: schema.goal.id }),
    );
    expect(alterados.length).toBe(0);

    const [lida] = await withTenant(ctxCoordA, (tx) =>
      tx.select({ descricao: schema.goal.descricao }).from(schema.goal).where(eq(schema.goal.id, g!.id)),
    );
    expect(lida?.descricao).not.toBe("alteração indevida");
  });

  test("mapear meta a marco e ler o mapeamento", async () => {
    const [g] = await withTenant(ctxCoordA, (tx) =>
      tx.select({ id: schema.goal.id }).from(schema.goal).limit(1),
    );
    await withTenant(ctxCoordA, (tx) =>
      tx.insert(schema.goalMilestoneMapping).values({ goalId: g!.id, milestoneId: MILE_A }),
    );
    const maps = await withTenant(ctxT1A, (tx) => tx.select().from(schema.goalMilestoneMapping));
    expect(maps.length).toBe(1);
  });

  // ---------- session_protocol_scope ----------
  test("terapeuta dono grava e lê escopo de protocolo da sessão", async () => {
    await withTenant(ctxT1A, (tx) =>
      tx.insert(schema.sessionProtocolScope).values({
        sessionId: SESS_A1, protocolId: PROTO_A, origem: "inferido_disciplina",
      }),
    );
    const lidas = await withTenant(ctxT1A, (tx) =>
      tx.select().from(schema.sessionProtocolScope),
    );
    expect(lidas.length).toBe(1);
  });

  test("recepção não vê escopo de protocolo (dado clínico)", async () => {
    const lidas = await withTenant(ctxRecepA, (tx) =>
      tx.select().from(schema.sessionProtocolScope),
    );
    expect(lidas.length).toBe(0);
  });

  // ---------- J4: sps_insert/sps_update travam ajustado_por (anti-forja) ----------
  test("J4 · terapeuta NÃO grava escopo com ajustado_por de outro usuário (forja de auditoria)", async () => {
    await expect(
      withTenant(ctxT1A, (tx) =>
        tx.insert(schema.sessionProtocolScope).values({
          sessionId: SESS_A1, protocolId: PROTO_A2, origem: "ajustado_manualmente",
          ajustadoPor: U_T2_A, // != app.user_id — forja
        }),
      ),
    ).rejects.toThrow();
  });

  test("J4 · terapeuta grava escopo com ajustado_por = próprio id (caso positivo)", async () => {
    const [criado] = await withTenant(ctxT1A, (tx) =>
      tx.insert(schema.sessionProtocolScope).values({
        sessionId: SESS_A1, protocolId: PROTO_A2, origem: "ajustado_manualmente",
        ajustadoPor: U_T1_A,
      }).returning({ id: schema.sessionProtocolScope.id }),
    );
    expect(criado?.id).toBeTruthy();
  });

  // ---------- audio_capture ----------
  test("terapeuta dono grava rascunho local de áudio e lê", async () => {
    await withTenant(ctxT1A, (tx) =>
      tx.insert(schema.audioCapture).values({
        sessionId: SESS_A1, clinicId: CLINIC_A, statusUpload: "rascunho_local",
      }),
    );
    const lidas = await withTenant(ctxT1A, (tx) => tx.select().from(schema.audioCapture));
    expect(lidas.length).toBe(1);
  });

  test("terapeuta de outra clínica não vê áudio (cross-tenant)", async () => {
    const lidas = await withTenant(ctxT1B, (tx) => tx.select().from(schema.audioCapture));
    expect(lidas.length).toBe(0);
  });

  // ---------- extraction ----------
  test("extração gravada no contexto do terapeuta da sessão é lida por ele", async () => {
    await withTenant(ctxT1A, (tx) =>
      tx.insert(schema.extraction).values({
        sessionId: SESS_A1, clinicId: CLINIC_A, estado: "sugerida",
        subtipo: "evidencia", trechoFonte: "falou á sozinho", confianca: "alta",
        payload: { alvos: [] },
      }),
    );
    const lidas = await withTenant(ctxT1A, (tx) => tx.select().from(schema.extraction));
    expect(lidas.length).toBe(1);
  });

  test("recepção não vê extração (dado clínico)", async () => {
    const lidas = await withTenant(ctxRecepA, (tx) => tx.select().from(schema.extraction));
    expect(lidas.length).toBe(0);
  });

  // ---------- milestone (catálogo) ----------
  test("qualquer papel da clínica lê o catálogo de marcos do protocolo", async () => {
    const lidasT1 = await withTenant(ctxT1A, (tx) => tx.select().from(schema.milestone));
    expect(lidasT1.length).toBeGreaterThanOrEqual(1);
  });

  test("terapeuta não insere marco no catálogo (só coordenador)", async () => {
    await expect(
      withTenant(ctxT1A, (tx) =>
        tx.insert(schema.milestone).values({
          protocolId: PROTO_A, dominioId: "tato", nome: "nomear objeto",
          tipoEstrutura: "marco_simples", estrutura: { escala: [] },
        }),
      ),
    ).rejects.toThrow();
  });

  test("marco de protocolo de outra clínica não é visível (cross-tenant)", async () => {
    // ctxT1B enxerga só o marco da própria clínica (MILE_B); MILE_A (clínica A)
    // não aparece — checagem por id em vez de length, pois a clínica B já tem
    // seu próprio marco de catálogo (fixture PROTO_B/MILE_B).
    const lidasB = await withTenant(ctxT1B, (tx) => tx.select().from(schema.milestone));
    expect(lidasB.map((m) => m.id)).not.toContain(MILE_A);
    expect(lidasB.map((m) => m.id)).toContain(MILE_B);
  });

  // ---------- J5: unique de milestone com NULLS NOT DISTINCT ----------
  test("J5 · dois marcos com mesmo (protocol_id, dominio_id) e nivel NULL colidem no unique", async () => {
    await owner`INSERT INTO milestone (protocol_id, dominio_id, nome, tipo_estrutura, estrutura)
      VALUES (${PROTO_A}, 'tato-j5', 'Nomear objeto (J5-1)', 'marco_simples', ${owner.json({ escala: [] })})`;
    await expect(
      owner`INSERT INTO milestone (protocol_id, dominio_id, nome, tipo_estrutura, estrutura)
        VALUES (${PROTO_A}, 'tato-j5', 'Nomear objeto (J5-2 duplicado)', 'marco_simples', ${owner.json({ escala: [] })})`,
    ).rejects.toThrow();
  });

  // ---------- candidatura dormente ----------
  test("tabelas de candidatura existem e respeitam escopo (dormentes)", async () => {
    const [g] = await withTenant(ctxCoordA, (tx) =>
      tx.select({ id: schema.goal.id }).from(schema.goal).limit(1),
    );
    await withTenant(ctxCoordA, (tx) =>
      tx.insert(schema.goalCandidacy).values({ goalId: g!.id, isCandidateDominada: false }),
    );
    const lidas = await withTenant(ctxT1A, (tx) => tx.select().from(schema.goalCandidacy));
    expect(lidas.length).toBe(1);
  });

  // ---------- I2: gmm_insert fecha FK do marco cross-tenant ----------
  test("mapear meta a marco de outra clínica é barrado (fecha FK do marco cross-tenant)", async () => {
    const [g] = await withTenant(ctxCoordA, (tx) =>
      tx.select({ id: schema.goal.id }).from(schema.goal).limit(1),
    );
    await expect(
      withTenant(ctxCoordA, (tx) =>
        tx.insert(schema.goalMilestoneMapping).values({ goalId: g!.id, milestoneId: MILE_B }),
      ),
    ).rejects.toThrow();
  });

  // ---------- I3: extraction_update ----------
  describe("I3 · extraction_update", () => {
    test("terapeuta dono atualiza o estado da própria extração e a mudança persiste", async () => {
      const [ext] = await withTenant(ctxT1A, (tx) =>
        tx.insert(schema.extraction).values({
          sessionId: SESS_A1, clinicId: CLINIC_A, estado: "sugerida",
          subtipo: "evidencia", trechoFonte: "trecho para update", confianca: "alta",
          payload: { alvos: [] },
        }).returning({ id: schema.extraction.id }),
      );
      await withTenant(ctxT1A, (tx) =>
        tx.update(schema.extraction)
          .set({ estado: "pendente_reprocessamento" })
          .where(eq(schema.extraction.id, ext!.id)),
      );
      const [lida] = await withTenant(ctxT1A, (tx) =>
        tx.select({ estado: schema.extraction.estado })
          .from(schema.extraction)
          .where(eq(schema.extraction.id, ext!.id)),
      );
      expect(lida?.estado).toBe("pendente_reprocessamento");
    });

    test("recepção NÃO consegue atualizar extração (USING esconde a linha)", async () => {
      const [ext] = await withTenant(ctxT1A, (tx) =>
        tx.insert(schema.extraction).values({
          sessionId: SESS_A1, clinicId: CLINIC_A, estado: "sugerida",
          subtipo: "evidencia", trechoFonte: "trecho recepção", confianca: "alta",
          payload: { alvos: [] },
        }).returning({ id: schema.extraction.id }),
      );
      const alterados = await withTenant(ctxRecepA, (tx) =>
        tx.update(schema.extraction)
          .set({ estado: "pendente_reprocessamento" })
          .where(eq(schema.extraction.id, ext!.id))
          .returning({ id: schema.extraction.id }),
      );
      expect(alterados.length).toBe(0);

      const [lida] = await withTenant(ctxT1A, (tx) =>
        tx.select({ estado: schema.extraction.estado })
          .from(schema.extraction)
          .where(eq(schema.extraction.id, ext!.id)),
      );
      expect(lida?.estado).toBe("sugerida");
    });

    test("terapeuta dono não pode fazer swap cross-tenant da sessão da extração (WITH CHECK)", async () => {
      const [ext] = await withTenant(ctxT1A, (tx) =>
        tx.insert(schema.extraction).values({
          sessionId: SESS_A1, clinicId: CLINIC_A, estado: "sugerida",
          subtipo: "evidencia", trechoFonte: "trecho swap", confianca: "alta",
          payload: { alvos: [] },
        }).returning({ id: schema.extraction.id }),
      );
      await expect(
        withTenant(ctxT1A, (tx) =>
          tx.update(schema.extraction)
            .set({ sessionId: SESS_B1 })
            .where(eq(schema.extraction.id, ext!.id)),
        ),
      ).rejects.toThrow();
    });

    test("J2 · terapeuta da equipe que NÃO é dono da sessão NÃO atualiza extração (authz apertado ao dono)", async () => {
      // Coloca T2A na equipe de PAC_A1 (papel substituto) só p/ este caso — prova
      // que app_session_clinica_visivel (equipe) já não basta para UPDATE; precisa
      // ser o terapeuta dono (app_session_terapeuta_id).
      await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe)
        VALUES (${PAC_A1}, ${U_T2_A}, 'ABA', 'substituto')`;
      try {
        const [ext] = await withTenant(ctxT1A, (tx) =>
          tx.insert(schema.extraction).values({
            sessionId: SESS_A1, clinicId: CLINIC_A, estado: "sugerida",
            subtipo: "evidencia", trechoFonte: "trecho J2", confianca: "alta",
            payload: { alvos: [] },
          }).returning({ id: schema.extraction.id }),
        );
        const alterados = await withTenant(ctxT2A, (tx) =>
          tx.update(schema.extraction)
            .set({ estado: "pendente_reprocessamento" })
            .where(eq(schema.extraction.id, ext!.id))
            .returning({ id: schema.extraction.id }),
        );
        expect(alterados.length).toBe(0);
      } finally {
        await owner`DELETE FROM care_team_membership WHERE patient_id = ${PAC_A1} AND user_id = ${U_T2_A}`;
      }
    });
  });

  // ---------- I1: milestone_candidacy (dormente, mas policy corrigida) ----------
  describe("I1 · milestone_candidacy", () => {
    test("coordenador insere milestone_candidacy", async () => {
      const inseridos = await withTenant(ctxCoordA, (tx) =>
        tx.insert(schema.milestoneCandidacy).values({
          patientId: PAC_A1, milestoneId: MILE_A, isCandidate: true,
        }).returning({ patientId: schema.milestoneCandidacy.patientId }),
      );
      expect(inseridos.length).toBe(1);
    });

    test("recepção não vê milestone_candidacy (guardrail #1)", async () => {
      const lidas = await withTenant(ctxRecepA, (tx) => tx.select().from(schema.milestoneCandidacy));
      expect(lidas.length).toBe(0);
    });

    test("terapeuta da equipe vê milestone_candidacy do paciente", async () => {
      const lidas = await withTenant(ctxT1A, (tx) => tx.select().from(schema.milestoneCandidacy));
      expect(lidas.length).toBe(1);
    });

    test("terapeuta fora da equipe não vê milestone_candidacy", async () => {
      const lidas = await withTenant(ctxT2A, (tx) => tx.select().from(schema.milestoneCandidacy));
      expect(lidas.length).toBe(0);
    });

    test("terapeuta não insere milestone_candidacy (só coordenador escreve)", async () => {
      await expect(
        withTenant(ctxT1A, (tx) =>
          tx.insert(schema.milestoneCandidacy).values({
            patientId: PAC_A1, milestoneId: MILE_A, isCandidate: true,
          }),
        ),
      ).rejects.toThrow();
    });
  });
});
