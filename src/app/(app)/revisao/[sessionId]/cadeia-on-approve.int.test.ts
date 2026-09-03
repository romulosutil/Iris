/**
 * #558 — cadeia de suporte por etapa na camada `evidence` (T2, T3 e T4).
 *
 * Até aqui `inserirEvidenciasOnApprove` retornava cedo em
 * `logic.ts` (`if (row.subtipo !== "evidencia") return;`) e uma extração
 * `cadeia` aprovada não deixava NENHUM rastro estruturado: vivia só em
 * `extraction.payload` e era renderizada como texto no resumo da revisão.
 *
 * O que este arquivo prova, na ordem em que a spec exige:
 *
 *  - **T2** (R2/R5.1): aprovar uma cadeia com N etapas grava N linhas em
 *    `evidence` (`alvo_ordinal` = índice da etapa), é idempotente sob
 *    reaprovação, lê payload FLAT **e** aninhado pelo mesmo helper, e cadeia
 *    SEM âncora grava com FKs nulas sem lançar (R2.5 — o fluxo que hoje
 *    funciona não vira erro).
 *  - **T3** (R5.2): o MESMO paciente, com e sem cadeia ancorada, produz
 *    `session_snapshot` DIFERENTE. É o teste que decide a feature: sem ele,
 *    T1+T2 podem estar inteiras e a tela não mudar um pixel.
 *  - **T3/R5.3**: cadeia de outra clínica não aparece — e o oráculo NÃO
 *    codifica "invisível pela policy = inexistente" (memo R-1): a linha da
 *    outra clínica é medida como OWNER (existe, com o conteúdo certo) e só
 *    então se afirma que ela não entra no snapshot do paciente desta clínica.
 *  - **T4** (R5.5): etapa com `nivel_ajuda` fora da taxonomia do protocolo não
 *    vira `0` nem progresso — entra como NÃO CLASSIFICADA e é contada.
 *
 * Régua de mutação (R5.7): reverter a remoção do early-return de `logic.ts`
 * derruba todo o bloco T2/T3; reverter o guard de taxonomia (`ordinalDe`
 * devolvendo `idx` em vez de `null` quando `indexOf` dá -1) derruba T4.
 */
import { sql as dsql } from "drizzle-orm";
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

const CLINIC = "00000000-0000-0000-0000-0000000000c5";
const CLINIC_B = "00000000-0000-0000-0000-0000000000c6";
const U_T1 = "00000000-0000-0000-0000-0000000071c5"; // terapeuta dono da sessão
const U_T1_B = "00000000-0000-0000-0000-0000000071c6"; // terapeuta da clínica B
const PAC = "00000000-0000-0000-0000-00000000acc5";
const PAC_B = "00000000-0000-0000-0000-00000000acc6";
const SESS = "00000000-0000-0000-0000-00000005e1c5";
const SESS_B = "00000000-0000-0000-0000-00000005e1c6";
const PROTOCOL = "00000000-0000-0000-0000-0000000c0001";
const PROTOCOL_B = "00000000-0000-0000-0000-0000000c0002";
const GOAL = "00000000-0000-0000-0000-0000000c1001";
const GOAL_B = "00000000-0000-0000-0000-0000000c1002";
// um único marco para (protocolo, "autonomia") → resolve sem ambiguidade
const MILESTONE_AUTONOMIA = "00000000-0000-0000-0000-0000000c2001";
const MILESTONE_AUTONOMIA_B = "00000000-0000-0000-0000-0000000c2002";

// Taxonomia do protocolo: ordinal 0 = mais independente.
const TAXONOMIA = [
  "independente",
  "dica_verbal",
  "dica_gestual",
  "ajuda_fisica_parcial",
  "ajuda_fisica_total",
];

const ctxT1 = { clinicId: CLINIC, userId: U_T1, role: "terapeuta" } as const;
const ctxT1B = {
  clinicId: CLINIC_B,
  userId: U_T1_B,
  role: "terapeuta",
} as const;

const EX_CADEIA = "00000000-0000-0000-0000-00000cad0001"; // ancorada, 3 etapas
const EX_CADEIA_SEM_ANCORA = "00000000-0000-0000-0000-00000cad0002";
const EX_CADEIA_ANINHADA = "00000000-0000-0000-0000-00000cad0003";
const EX_CADEIA_NIVEL_DESCONHECIDO = "00000000-0000-0000-0000-00000cad0004";
const EX_EVIDENCIA = "00000000-0000-0000-0000-00000cad0005"; // controle: não regride
const EX_CADEIA_B = "00000000-0000-0000-0000-00000cad0006"; // clínica B

let owner: ReturnType<typeof postgres>;
let appSql: typeof import("@/db/client").sql;
let A: typeof import("./logic");

/** As 3 etapas da rotina de lanche — a 2ª sai com ajuda física parcial. */
const ETAPAS = [
  { descricao: "abrir a lancheira", nivel_ajuda: "independente" },
  { descricao: "abrir o pote", nivel_ajuda: "ajuda_fisica_parcial" },
  { descricao: "apontar o suco", nivel_ajuda: "dica_gestual" },
];

const ALVO = {
  goal_id: GOAL,
  protocol_id: "vbmapp",
  dominio_id: "autonomia",
};

async function seed() {
  await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
    session, extraction, evidence, session_snapshot, goal_candidacy,
    protocol, patient_protocol, goal, milestone
    RESTART IDENTITY CASCADE`;

  await owner`INSERT INTO protocol_familia_catalogo (id, nome) VALUES
    ('vbmapp', 'VB-MAPP') ON CONFLICT (id) DO NOTHING`;

  await owner`INSERT INTO clinic (id, nome) VALUES
    (${CLINIC}, 'Clínica cadeia A'), (${CLINIC_B}, 'Clínica cadeia B')`;
  await owner`INSERT INTO app_user (id, email, name) VALUES
    (${U_T1}, 't1.cadeia@t.com', 'T1'), (${U_T1_B}, 't1b.cadeia@t.com', 'T1B')`;
  await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
    (${U_T1}, ${CLINIC}, 'terapeuta'), (${U_T1_B}, ${CLINIC_B}, 'terapeuta')`;
  await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
    (${PAC}, ${CLINIC}, 'Paciente cadeia'), (${PAC_B}, ${CLINIC_B}, 'Paciente B')`;
  await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe) VALUES
    (${PAC}, ${U_T1}, 'ABA', 'terapeuta_referencia'),
    (${PAC_B}, ${U_T1_B}, 'ABA', 'terapeuta_referencia')`;
  await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, numero_sequencial_paciente, disciplina) VALUES
    (${SESS}, ${CLINIC}, ${PAC}, ${U_T1}, now(), 'realizada', 1, 'aba'),
    (${SESS_B}, ${CLINIC_B}, ${PAC_B}, ${U_T1_B}, now(), 'realizada', 1, 'aba')`;

  await owner`INSERT INTO protocol (id, clinic_id, nome, disciplina, familia, taxonomia_ajuda) VALUES
    (${PROTOCOL}, ${CLINIC}, 'VB-MAPP', 'ABA', 'vbmapp', ${owner.json(TAXONOMIA)}),
    (${PROTOCOL_B}, ${CLINIC_B}, 'VB-MAPP', 'ABA', 'vbmapp', ${owner.json(TAXONOMIA)})`;
  await owner`INSERT INTO patient_protocol (patient_id, protocol_id, ativado_por) VALUES
    (${PAC}, ${PROTOCOL}, ${U_T1}), (${PAC_B}, ${PROTOCOL_B}, ${U_T1_B})`;
  await owner`INSERT INTO goal (id, patient_id, clinic_id, descricao, estado, criterio_dominio, criado_por) VALUES
    (${GOAL}, ${PAC}, ${CLINIC}, 'Rotina de lanche com autonomia', 'ativa',
      ${owner.json({ tipo: "percentual", valor: 80 })}, ${U_T1}),
    (${GOAL_B}, ${PAC_B}, ${CLINIC_B}, 'Rotina de lanche (B)', 'ativa',
      ${owner.json({ tipo: "percentual", valor: 80 })}, ${U_T1_B})`;
  await owner`INSERT INTO milestone (id, protocol_id, dominio_id, nome, nivel, tipo_estrutura, estrutura) VALUES
    (${MILESTONE_AUTONOMIA}, ${PROTOCOL}, 'autonomia', 'Autonomia nível 1', '1', 'marco_simples', '{}'),
    (${MILESTONE_AUTONOMIA_B}, ${PROTOCOL_B}, 'autonomia', 'Autonomia nível 1', '1', 'marco_simples', '{}')`;

  await owner`INSERT INTO extraction
      (id, session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload) VALUES
    (${EX_CADEIA}, ${SESS}, ${CLINIC}, 'sugerida', 'cadeia',
      'abriu a lancheira sozinho, precisou de ajuda para o pote e apontou o suco', 'alta',
      ${owner.json({ nome: "Lanche", alvo: ALVO, etapas: ETAPAS })}),
    (${EX_CADEIA_SEM_ANCORA}, ${SESS}, ${CLINIC}, 'sugerida', 'cadeia',
      'lavou as mãos com ajuda', 'media',
      ${owner.json({ nome: "Lavar as mãos", etapas: ETAPAS.slice(0, 2) })}),
    (${EX_CADEIA_ANINHADA}, ${SESS}, ${CLINIC}, 'sugerida', 'cadeia',
      'vestiu o casaco', 'media',
      ${owner.json({ cadeia: { nome: "Vestir", alvo: ALVO, etapas: [ETAPAS[0]!, ETAPAS[2]!] } })}),
    (${EX_CADEIA_NIVEL_DESCONHECIDO}, ${SESS}, ${CLINIC}, 'sugerida', 'cadeia',
      'escovou os dentes com um apoio que o terapeuta descreveu à sua maneira', 'baixa',
      ${owner.json({
        nome: "Escovar os dentes",
        alvo: ALVO,
        etapas: [
          {
            descricao: "pegar a escova",
            nivel_ajuda: "apoio moderado do adulto",
          },
        ],
      })}),
    (${EX_EVIDENCIA}, ${SESS}, ${CLINIC}, 'sugerida', 'evidencia',
      'pediu suco', 'alta',
      ${owner.json({
        descricao: "pediu suco",
        polaridade: "positiva",
        nivel_ajuda: "independente",
        alvos: [ALVO],
      })}),
    (${EX_CADEIA_B}, ${SESS_B}, ${CLINIC_B}, 'sugerida', 'cadeia',
      'rotina da clínica B', 'alta',
      ${owner.json({
        nome: "Lanche (B)",
        alvo: {
          goal_id: GOAL_B,
          protocol_id: "vbmapp",
          dominio_id: "autonomia",
        },
        etapas: ETAPAS,
      })})`;
}

async function snapshotDoPaciente(patientId: string) {
  const rows = await owner`
    SELECT session_numero, repertorio_state, segmentacao
    FROM session_snapshot WHERE patient_id = ${patientId}
    ORDER BY session_numero`;
  return rows.map((r) => ({
    sessionNumero: r.session_numero as number,
    repertorio: r.repertorio_state as Record<string, Record<string, unknown>>,
    segmentacao: r.segmentacao as Record<string, unknown>,
  }));
}

describe.skipIf(!hasDb)("cadeia on-approve (#558)", () => {
  beforeAll(async () => {
    A = await import("./logic");
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
  });
  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });
  beforeEach(seed);

  // ─── T2 · persistência ────────────────────────────────────────────────────

  test("N etapas → N linhas em evidence, alvo_ordinal = índice da etapa (hoje: ZERO)", async () => {
    const r = await A.aprovarExtracao(ctxT1, {
      extractionId: EX_CADEIA,
      versao: 1,
    });
    expect(r.ok).toBe(true);

    const rows = await owner`
      SELECT * FROM evidence WHERE extraction_id = ${EX_CADEIA}
      ORDER BY alvo_ordinal`;
    expect(rows.length).toBe(ETAPAS.length);

    expect(rows.map((e) => e.alvo_ordinal)).toEqual([0, 1, 2]);
    for (const ev of rows) {
      expect(ev.patient_id).toBe(PAC);
      expect(ev.session_numero).toBe(1);
      expect(ev.aprovado_por).toBe(U_T1);
      // âncora única da cadeia, resolvida uma vez e replicada por etapa
      expect(ev.goal_id).toBe(GOAL);
      expect(ev.protocol_id).toBe(PROTOCOL);
      expect(ev.milestone_id).toBe(MILESTONE_AUTONOMIA);
      expect(ev.protocol_slug).toBe("vbmapp");
      expect(ev.dominio_id).toBe("autonomia");
    }

    // `classificacao_original` carrega a etapa, com `nivel_ajuda` no nível que
    // a materialização lê (`rowParaObservacao`), e o subtipo desambiguando a
    // dupla semântica de `alvo_ordinal` (alvo de evidência × etapa de rotina).
    const primeira = rows[0]!.classificacao_original as Record<string, unknown>;
    expect(primeira).toMatchObject({
      subtipo: "cadeia",
      nome: "Lanche",
      etapa_ordinal: 0,
      descricao: "abrir a lancheira",
      nivel_ajuda: "independente",
      alvo: { goal_id: GOAL, dominio_id: "autonomia" },
    });
    expect(
      (rows[1]!.classificacao_original as Record<string, unknown>).nivel_ajuda,
    ).toBe("ajuda_fisica_parcial");
    // o array inteiro de etapas NÃO é copiado em cada linha
    expect(primeira.etapas).toBeUndefined();
  });

  test("reaprovar não duplica etapa (uq_evidence_alvo)", async () => {
    expect(
      (await A.aprovarExtracao(ctxT1, { extractionId: EX_CADEIA, versao: 1 }))
        .ok,
    ).toBe(true);
    // 2ª chamada: a extração já não está `sugerida` — a transição não acha a
    // linha e a inserção não reexecuta.
    expect(
      (await A.aprovarExtracao(ctxT1, { extractionId: EX_CADEIA, versao: 1 }))
        .ok,
    ).toBe(false);

    const rows =
      await owner`SELECT id FROM evidence WHERE extraction_id = ${EX_CADEIA}`;
    expect(rows.length).toBe(ETAPAS.length);
  });

  test("payload ANINHADO produz o mesmo resultado que o FLAT (helper conteudoDoSubtipo)", async () => {
    const r = await A.aprovarExtracao(ctxT1, {
      extractionId: EX_CADEIA_ANINHADA,
      versao: 1,
    });
    expect(r.ok).toBe(true);

    const rows = await owner`
      SELECT alvo_ordinal, goal_id, classificacao_original FROM evidence
      WHERE extraction_id = ${EX_CADEIA_ANINHADA} ORDER BY alvo_ordinal`;
    expect(rows.length).toBe(2);
    expect(rows.map((e) => e.alvo_ordinal)).toEqual([0, 1]);
    expect(rows[0]!.goal_id).toBe(GOAL);
    expect(
      (rows[0]!.classificacao_original as Record<string, unknown>).nome,
    ).toBe("Vestir");
  });

  test("cadeia SEM âncora: grava com FKs nulas, sem lançar, e fica fora da evolução (R2.5)", async () => {
    const r = await A.aprovarExtracao(ctxT1, {
      extractionId: EX_CADEIA_SEM_ANCORA,
      versao: 1,
    });
    expect(r.ok).toBe(true);

    const rows = await owner`
      SELECT * FROM evidence WHERE extraction_id = ${EX_CADEIA_SEM_ANCORA}
      ORDER BY alvo_ordinal`;
    expect(rows.length).toBe(2);
    for (const ev of rows) {
      expect(ev.goal_id).toBeNull();
      expect(ev.milestone_id).toBeNull();
      expect(ev.protocol_id).toBeNull();
      expect(ev.dominio_id).toBeNull();
    }

    // Sem `goal_id` a materialização descarta a etapa (`materializar.ts`:
    // `if (!e.goalId) continue;`). A linha de `session_snapshot` da sessão
    // ainda nasce — isso é comportamento pré-existente, igual ao de uma
    // `evidencia` cujo alvo não resolve meta —, mas ela chega VAZIA: a rotina
    // sem âncora não entra na leitura de evolução, e nada é inventado no
    // lugar dela.
    const snaps = await snapshotDoPaciente(PAC);
    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.repertorio).toEqual({});
    expect(snaps[0]!.segmentacao).toEqual({});
  });

  // ─── T3 · a task que decide a feature ─────────────────────────────────────

  test("R5.2 — o MESMO paciente, com e sem cadeia ancorada, produz session_snapshot DIFERENTE", async () => {
    // Arm A — o MESMO paciente, na MESMA sessão, com uma cadeia SEM âncora.
    // O snapshot nasce, mas vazio: nenhuma rotina alcança a evolução.
    expect(
      (
        await A.aprovarExtracao(ctxT1, {
          extractionId: EX_CADEIA_SEM_ANCORA,
          versao: 1,
        })
      ).ok,
    ).toBe(true);
    const semAncora = await snapshotDoPaciente(PAC);
    expect(semAncora).toHaveLength(1);
    expect(semAncora[0]!.repertorio).toEqual({});

    // Arm B — mesmo paciente, mesma sessão, agora com a cadeia ANCORADA.
    await seed();
    const r = await A.aprovarExtracao(ctxT1, {
      extractionId: EX_CADEIA,
      versao: 1,
    });
    expect(r.ok).toBe(true);

    const comCadeia = await snapshotDoPaciente(PAC);
    // A afirmação que decide a feature: o snapshot MUDOU.
    expect(comCadeia).not.toEqual(semAncora);
    expect(comCadeia).toHaveLength(1);

    const entrada = comCadeia[0]!.repertorio[GOAL] as
      Record<string, unknown> | undefined;
    expect(entrada).toBeDefined();
    // 3 etapas computadas; o nível mais recente é o da ÚLTIMA etapa da rotina
    // ("dica_gestual" → ordinal 2 na taxonomia do protocolo). Não é 0, e não é
    // um número inventado: é o índice real na taxonomia.
    expect(entrada!.contagem).toBe(3);
    expect(entrada!.nivel_ajuda_recente).toBe(
      TAXONOMIA.indexOf("dica_gestual"),
    );
    // a segmentação também passou a enxergar a meta
    expect(Object.keys(comCadeia[0]!.segmentacao)).toContain(GOAL);
  });

  test("R5.3 cross-tenant — a cadeia da clínica B EXISTE, e mesmo assim não entra no snapshot de A", async () => {
    // Aprova nas DUAS clínicas, cada uma com o seu próprio contexto.
    expect(
      (await A.aprovarExtracao(ctxT1, { extractionId: EX_CADEIA, versao: 1 }))
        .ok,
    ).toBe(true);
    expect(
      (
        await A.aprovarExtracao(ctxT1B, {
          extractionId: EX_CADEIA_B,
          versao: 1,
        })
      ).ok,
    ).toBe(true);

    // Oráculo POSITIVO primeiro (memo R-1): medido como OWNER, a linha da
    // clínica B existe de verdade e com o conteúdo certo. Sem esta asserção,
    // "não aparece em A" seria satisfeito por a feature simplesmente não ter
    // gravado nada.
    const deB = await owner`
      SELECT patient_id, goal_id FROM evidence
      WHERE extraction_id = ${EX_CADEIA_B} ORDER BY alvo_ordinal`;
    expect(deB.length).toBe(ETAPAS.length);
    for (const ev of deB) {
      expect(ev.patient_id).toBe(PAC_B);
      expect(ev.goal_id).toBe(GOAL_B);
    }

    // E o snapshot de cada paciente só conhece a própria meta.
    const snapA = await snapshotDoPaciente(PAC);
    const snapB = await snapshotDoPaciente(PAC_B);
    expect(Object.keys(snapA[0]!.repertorio)).toEqual([GOAL]);
    expect(Object.keys(snapB[0]!.repertorio)).toEqual([GOAL_B]);

    // E a leitura sob o tenant A, com RLS aplicado, não alcança a linha de B.
    const { withTenant } = await import("@/db/rls");
    const visiveisDeA = await withTenant(ctxT1, (tx) =>
      tx.execute(
        dsql`SELECT id FROM evidence WHERE extraction_id = ${EX_CADEIA_B}`,
      ),
    );
    expect((visiveisDeA as unknown as unknown[]).length).toBe(0);
  });

  test("subtipo sem destino continua sem gravar evidence (o early-return não virou passe livre)", async () => {
    const EX_ABC = "00000000-0000-0000-0000-00000cad0007";
    await owner`INSERT INTO extraction
        (id, session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload) VALUES
      (${EX_ABC}, ${SESS}, ${CLINIC}, 'sugerida', 'registro_abc', 'chorou na transição', 'alta',
        ${owner.json({ antecedente: "fim do brinquedo", comportamento: "choro", severidade: "leve" })})`;

    const r = await A.aprovarExtracao(ctxT1, {
      extractionId: EX_ABC,
      versao: 1,
    });
    expect(r.ok).toBe(true);
    const rows =
      await owner`SELECT id FROM evidence WHERE extraction_id = ${EX_ABC}`;
    expect(rows.length).toBe(0);
  });

  // ─── T4 · nível de ajuda fora da taxonomia ────────────────────────────────

  test("R5.5 — nível fora da taxonomia não vira 0 nem progresso: entra como NÃO CLASSIFICADO e é contado", async () => {
    const r = await A.aprovarExtracao(ctxT1, {
      extractionId: EX_CADEIA_NIVEL_DESCONHECIDO,
      versao: 1,
    });
    expect(r.ok).toBe(true);

    // a linha existe, com a string crua preservada
    const [ev] = await owner`
      SELECT classificacao_original FROM evidence
      WHERE extraction_id = ${EX_CADEIA_NIVEL_DESCONHECIDO}`;
    expect(
      (ev!.classificacao_original as Record<string, unknown>).nivel_ajuda,
    ).toBe("apoio moderado do adulto");

    const [snap] = await snapshotDoPaciente(PAC);
    const entrada = snap!.repertorio[GOAL] as Record<string, unknown>;
    // NÃO é 0 (que significaria "independente"), é ausência de medida.
    expect(entrada.nivel_ajuda_recente).toBeNull();
    // ... e a ausência é CONTADA, não engolida em silêncio.
    expect(entrada.niveis_nao_classificados).toBe(1);
  });

  test("nível conhecido não é contado como não classificado (o guard não conta demais)", async () => {
    expect(
      (await A.aprovarExtracao(ctxT1, { extractionId: EX_CADEIA, versao: 1 }))
        .ok,
    ).toBe(true);
    const [snap] = await snapshotDoPaciente(PAC);
    const entrada = snap!.repertorio[GOAL] as Record<string, unknown>;
    expect(entrada.niveis_nao_classificados).toBe(0);
  });

  test("controle: extração `evidencia` continua gravando como antes (sem regressão)", async () => {
    const r = await A.aprovarExtracao(ctxT1, {
      extractionId: EX_EVIDENCIA,
      versao: 1,
    });
    expect(r.ok).toBe(true);
    const rows =
      await owner`SELECT alvo_ordinal, goal_id FROM evidence WHERE extraction_id = ${EX_EVIDENCIA}`;
    expect(rows.length).toBe(1);
    expect(rows[0]!.goal_id).toBe(GOAL);
  });
});
