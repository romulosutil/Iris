import { describe, expect, test, beforeAll, afterAll, vi } from "vitest";
import postgres from "postgres";
import { withTenant } from "@/db/rls";
import { sql as appSql } from "@/db/client";
import {
  carregarTimeline,
  carregarSnapshotAsOf,
  carregarDeltaSessao,
  carregarComparacao,
  carregarEvidenciasPorTrecho,
  carregarRotinas,
} from "./queries";
import { hasDb } from "@tests/integration-env";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-0000000000fa";
const U_COORD_A = "00000000-0000-0000-0000-00000000c0fa";
const U_T1_A = "00000000-0000-0000-0000-0000000071fa";
const PAC_A1 = "00000000-0000-0000-0000-00000000acfa";
const PROTOCOL_FAMILIA = "aba_marcos_desenvolvimento";

const ctxCoordA = {
  clinicId: CLINIC_A,
  userId: U_COORD_A,
  role: "coordenador",
} as const;

let owner: ReturnType<typeof postgres>;
let PROTOCOL_ID: string;
let MARCO_ID: string;
let GOAL_ID: string;
let SESS_A1_ID: string;
let SESS_A2_ID: string;
let EVIDENCIA_ID: string;
let EVIDENCIA_SEM_REVISAO_ID: string;

describe.skipIf(!hasDb)("queries.ts (timeline integrated tests)", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
      session, extraction, evidence, evidence_revision, evidence_query,
      protocol, milestone, goal, goal_candidacy, milestone_candidacy, session_snapshot,
      patient_protocol
      RESTART IDENTITY CASCADE`;

    await owner`INSERT INTO protocol_familia_catalogo (id, nome) VALUES
      (${PROTOCOL_FAMILIA}, 'Marcos de desenvolvimento (ABA)')
      ON CONFLICT (id) DO NOTHING`;

    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES (${CLINIC_A}, 'Clínica A (timeline queries)', false)`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a.time@t.com'),
      (${U_T1_A}, 'Terapeuta 1 A', 't1.a.time@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_T1_A}, ${CLINIC_A}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC_A1}, ${CLINIC_A}, 'Paciente A1 (timeline)')`;
    await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe)
      VALUES (${PAC_A1}, ${U_T1_A}, 'ABA', 'terapeuta_referencia')`;

    const [protocolo] =
      await owner`INSERT INTO protocol (clinic_id, nome, disciplina, familia, taxonomia_ajuda)
      VALUES (${CLINIC_A}, 'VB-MAPP (timeline)', 'ABA', ${PROTOCOL_FAMILIA},
        ${owner.json(["independente", "dica_verbal", "dica_gestual", "modelacao", "dica_fisica"])})
      RETURNING id`;
    PROTOCOL_ID = protocolo!.id as string;

    await owner`INSERT INTO patient_protocol (patient_id, protocol_id, ativado_por)
      VALUES (${PAC_A1}, ${PROTOCOL_ID}, ${U_COORD_A})`;

    const [milestoneRow] =
      await owner`INSERT INTO milestone (protocol_id, dominio_id, nome, tipo_estrutura, estrutura)
      VALUES (${PROTOCOL_ID}, 'mando', 'Mando nível 1', 'marco_simples', ${owner.json({})})
      RETURNING id`;
    MARCO_ID = milestoneRow!.id as string;

    const [goalRow] =
      await owner`INSERT INTO goal (patient_id, clinic_id, descricao, estado, criterio_dominio, criado_por)
      VALUES (${PAC_A1}, ${CLINIC_A}, 'Pedir água de forma independente', 'ativa',
        ${owner.json({ tipo: "sessoes_consecutivas_independente", valor: 2 })}, ${U_COORD_A})
      RETURNING id`;
    GOAL_ID = goalRow!.id as string;

    // O eixo do Espectro vem do MARCO mapeado à meta. Sem esta linha a meta
    // não resolve eixo nenhum e sai do gráfico — que é o comportamento certo,
    // e é justamente o que o cadastro real precisa ter.
    await owner`INSERT INTO goal_milestone_mapping (goal_id, milestone_id)
      VALUES (${GOAL_ID}, ${MARCO_ID})`;

    // Sessão 1 e 2
    SESS_A1_ID = crypto.randomUUID();
    SESS_A2_ID = crypto.randomUUID();
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, numero_sequencial_paciente, disciplina) VALUES
      (${SESS_A1_ID}, ${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, '2026-07-01 10:00:00Z', 'realizada', 1, 'aba'),
      (${SESS_A2_ID}, ${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, '2026-07-02 10:00:00Z', 'realizada', 2, 'aba')`;

    // Snapshot Sessão 1
    await owner`INSERT INTO session_snapshot (patient_id, session_numero, repertorio_state, segmentacao) VALUES
      (${PAC_A1}, 1,
        ${owner.json({ [MARCO_ID]: { nivel_ajuda_recente: 2, contagem: 3, is_candidata: false } })},
        ${owner.json({ [GOAL_ID]: { [PROTOCOL_ID]: { tipo_estrutura: "marco_simples", metrica: { eixo: "nivel_ajuda", ordinalRecente: 2 }, rotulo: "evolucao" } } })}
      )`;

    // Snapshot Sessão 2
    await owner`INSERT INTO session_snapshot (patient_id, session_numero, repertorio_state, segmentacao) VALUES
      (${PAC_A1}, 2,
        ${owner.json({
          [MARCO_ID]: {
            nivel_ajuda_recente: 0,
            contagem: 5,
            is_candidata: true,
          },
          [GOAL_ID]: {
            nivel_ajuda_recente: 0,
            contagem: 4,
            is_candidata: true,
          },
        })},
        ${owner.json({ [GOAL_ID]: { [PROTOCOL_ID]: { tipo_estrutura: "marco_simples", metrica: { eixo: "nivel_ajuda", ordinalRecente: 0 }, rotulo: "evolucao" } } })}
      )`;

    // Evidência na sessão 2 para testar o drill-down
    const [ext] =
      await owner`INSERT INTO extraction (session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload)
      VALUES (${SESS_A2_ID}, ${CLINIC_A}, 'aprovada', 'evidencia', 'falou agua sozinho', 'alta', ${owner.json({})}) RETURNING id`;

    const [evidenciaRow] = await owner`INSERT INTO evidence
      (extraction_id, patient_id, session_id, session_numero, alvo_ordinal, protocol_id, goal_id, milestone_id, classificacao_original, aprovado_por)
      VALUES (${ext!.id}, ${PAC_A1}, ${SESS_A2_ID}, 2, 0, ${PROTOCOL_ID}, ${GOAL_ID}, ${MARCO_ID}, ${owner.json({ descricao: "pediu agua independente", polaridade: "positiva", nivel_ajuda: "independente" })}, ${U_T1_A})
      RETURNING id`;
    EVIDENCIA_ID = evidenciaRow!.id as string;

    await owner`INSERT INTO evidence_revision
      (evidence_id, acao, classificacao_anterior, classificacao_nova, justificativa, autor_id)
      VALUES (${EVIDENCIA_ID}, 'reclassificar',
        ${owner.json({ descricao: "pediu agua independente", polaridade: "positiva", nivel_ajuda: "independente" })},
        ${owner.json({ descricao: "pediu agua independente", polaridade: "positiva", nivel_ajuda: "dica_verbal" })},
        'Reclassificado após revisão do vídeo da sessão', ${U_COORD_A})`;

    // Segunda evidência (alvo distinto, mesma sessão) SEM revisão — garante que
    // o LEFT JOIN não descarta linhas nem fabrica dados quando não há revisão.
    // goal_id proposital NULL: continua casando por milestone_id (MARCO_ID),
    // mas não polui a busca existente por GOAL_ID (mantém toHaveLength(1) lá).
    const [evidenciaSemRevisaoRow] = await owner`INSERT INTO evidence
      (extraction_id, patient_id, session_id, session_numero, alvo_ordinal, protocol_id, goal_id, milestone_id, classificacao_original, aprovado_por)
      VALUES (${ext!.id}, ${PAC_A1}, ${SESS_A2_ID}, 2, 1, ${PROTOCOL_ID}, ${null}, ${MARCO_ID}, ${owner.json({ descricao: "pediu agua com dica", polaridade: "positiva", nivel_ajuda: "dica_gestual" })}, ${U_T1_A})
      RETURNING id`;
    EVIDENCIA_SEM_REVISAO_ID = evidenciaSemRevisaoRow!.id as string;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("carregarTimeline calcula o espectro e retorna metadados ativos", async () => {
    const res = await carregarTimeline(ctxCoordA, PAC_A1);
    expect(res).toBeTruthy();
    expect(res!.snapshots).toHaveLength(2);

    // sessão 2 deve vir primeiro (orderBy sessionNumero desc)
    const snap2 = res!.snapshots[0]!;
    expect(snap2.sessionNumero).toBe(2);
    expect(snap2.espectro.eixos).toHaveLength(6);
    expect(snap2.espectro.naoClassificados).toBe(0);

    const expressiva = snap2.espectro.eixos.find(
      (e) => e.eixo === "comunicacao_expressiva",
    );
    // A meta mapeia o marco 'mando' -> Comunicação Expressiva. Nível de ajuda
    // registrado = 0 (independente) numa taxonomia de 5 itens (ordinal máximo
    // 4) -> 100 de independência documentada.
    expect(expressiva?.valor).toBe(100);
    expect(expressiva?.alvos).toBe(1);
    expect(expressiva?.medidos).toBe(1);

    // Eixo sem alvo continua `null`. Zero significaria "medimos e está no pior
    // nível" — uma afirmação clínica que ninguém fez.
    const social = snap2.espectro.eixos.find(
      (e) => e.eixo === "social_brincar",
    );
    expect(social?.valor).toBeNull();
    expect(social?.alvos).toBe(0);

    expect(res!.metasAtivas).toHaveLength(1);
    expect(res!.metasAtivas[0]!.id).toBe(GOAL_ID);
    expect(res!.protocolosAtivos).toHaveLength(1);
    expect(res!.protocolosAtivos[0]!.id).toBe(PROTOCOL_ID);
  });

  test("carregarDeltaSessao calcula delta comparando com sessão anterior", async () => {
    const res = await carregarDeltaSessao(ctxCoordA, PAC_A1, 2);
    expect(res).toBeTruthy();
    expect(res.delta.evidenciasNovas).toBe(6); // B mando contagem 5 - A contagem 3 = +2; B goal contagem 4 (novo no snap, não tinha em A) = +4. Total = 6.
    expect(res.delta.metasCandidatasNovas).toBe(2); // MARCO_ID virou cand + GOAL_ID virou cand

    const itemMarco = res.delta.itens.find((i) => i.id === MARCO_ID);
    expect(itemMarco?.tipo).toBe("evolucao"); // 2 (gestual) -> 0 (independente)
    expect(itemMarco?.virouCandidata).toBe(true);

    expect(res.metas).toHaveLength(1);
    expect(res.milestones).toHaveLength(1);
  });

  test("carregarComparacao calcula delta de comparação entre 2 pontos e retorna guard G7", async () => {
    // Passamos invertido (2, 1) para provar que a API reordena e garante determinismo cronológico
    const res = await carregarComparacao(ctxCoordA, PAC_A1, 2, 1);
    expect(res).toBeTruthy();
    expect(res!.protocoloMudou).toBe(false); // mesmo protocolo (timeline)
    expect(res!.delta.evidenciasNovas).toBe(6);
    expect(res!.snapAntigo.sessionNumero).toBe(1);
    expect(res!.snapNovo.sessionNumero).toBe(2);
  });

  test("carregarEvidenciasPorTrecho busca evidências e limita quantidade", async () => {
    const res = await carregarEvidenciasPorTrecho(
      ctxCoordA,
      PAC_A1,
      GOAL_ID,
      1,
      2,
    );
    expect(res).toHaveLength(1);
    expect(res[0]!.descricao).toBe("pediu agua independente");
    expect(res[0]!.nivelAjuda).toBe("independente");
  });

  test("carregarEvidenciasPorTrecho expõe a revisão do coordenador (V4 passiva) sem fabricar dados quando ausente", async () => {
    const res = await carregarEvidenciasPorTrecho(
      ctxCoordA,
      PAC_A1,
      MARCO_ID,
      1,
      2,
    );
    expect(res).toHaveLength(2);

    const comRevisao = res.find((r) => r.id === EVIDENCIA_ID);
    expect(comRevisao).toBeTruthy();
    expect(comRevisao!.revisao).toBeTruthy();
    expect(comRevisao!.revisao!.acao).toBe("reclassificar");
    expect(comRevisao!.revisao!.justificativa).toBe(
      "Reclassificado após revisão do vídeo da sessão",
    );
    expect(comRevisao!.revisao!.autorNome).toBe("Coord A");

    const semRevisao = res.find((r) => r.id === EVIDENCIA_SEM_REVISAO_ID);
    expect(semRevisao).toBeTruthy();
    expect(semRevisao!.revisao).toBeNull();
  });

  test("carregarEvidenciasPorTrecho com múltiplas revisões retorna a evidência 1x com a revisão MAIS RECENTE (DISTINCT ON)", async () => {
    // Sessão isolada (numero 3, fora do range 1-2 usado nos testes acima) para
    // não poluir a contagem dos testes anteriores sobre MARCO_ID.
    const sessA3Id = crypto.randomUUID();
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, numero_sequencial_paciente, disciplina)
      VALUES (${sessA3Id}, ${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, '2026-07-03 10:00:00Z', 'realizada', 3, 'aba')`;

    const [extMulti] =
      await owner`INSERT INTO extraction (session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload)
      VALUES (${sessA3Id}, ${CLINIC_A}, 'aprovada', 'evidencia', 'bateu palma pedindo ajuda', 'alta', ${owner.json({})}) RETURNING id`;

    const [evidenciaMultiRow] = await owner`INSERT INTO evidence
      (extraction_id, patient_id, session_id, session_numero, alvo_ordinal, protocol_id, goal_id, milestone_id, classificacao_original, aprovado_por)
      VALUES (${extMulti!.id}, ${PAC_A1}, ${sessA3Id}, 3, 0, ${PROTOCOL_ID}, ${null}, ${MARCO_ID}, ${owner.json({ descricao: "bateu palma pedindo ajuda", polaridade: "positiva", nivel_ajuda: "dica_gestual" })}, ${U_T1_A})
      RETURNING id`;
    const evidenciaMultiId = evidenciaMultiRow!.id as string;

    await owner`INSERT INTO evidence_revision
      (evidence_id, acao, classificacao_anterior, classificacao_nova, justificativa, autor_id, criado_em)
      VALUES (${evidenciaMultiId}, 'reclassificar',
        ${owner.json({ descricao: "bateu palma pedindo ajuda", polaridade: "positiva", nivel_ajuda: "dica_gestual" })},
        ${owner.json({ descricao: "bateu palma pedindo ajuda", polaridade: "positiva", nivel_ajuda: "dica_verbal" })},
        'primeira revisão', ${U_COORD_A}, '2026-07-10 10:00:00Z')`;

    await owner`INSERT INTO evidence_revision
      (evidence_id, acao, classificacao_anterior, classificacao_nova, justificativa, autor_id, criado_em)
      VALUES (${evidenciaMultiId}, 'confirmar',
        ${owner.json({ descricao: "bateu palma pedindo ajuda", polaridade: "positiva", nivel_ajuda: "dica_verbal" })},
        ${null},
        'revisão mais recente', ${U_COORD_A}, '2026-07-11 10:00:00Z')`;

    const res = await carregarEvidenciasPorTrecho(
      ctxCoordA,
      PAC_A1,
      MARCO_ID,
      3,
      3,
    );
    expect(res).toHaveLength(1); // sem fan-out: DISTINCT ON evita duplicar linha por revisão

    const item = res[0]!;
    expect(item.id).toBe(evidenciaMultiId);
    expect(item.revisao).toBeTruthy();
    expect(item.revisao!.acao).toBe("confirmar");
    expect(item.revisao!.justificativa).toBe("revisão mais recente");
  });

  test("carregarDeltaSessao na Sessão 1 sem marco 0 trata itens como novos", async () => {
    // Sem snapshot 0 gravado para PAC_A1, snapA é null
    const res = await carregarDeltaSessao(ctxCoordA, PAC_A1, 1);
    expect(res).toBeTruthy();
    expect(res.delta.evidenciasNovas).toBe(3);
    const item = res.delta.itens.find((i) => i.id === MARCO_ID);
    expect(item?.tipo).toBe("novo");
  });

  test("carregarDeltaSessao no marco 0 (sessionNumero = 0) devolve snapA = null sem erro", async () => {
    // Para paciente sem marco 0, delta do marco 0 é vazio sem erro
    const res = await carregarDeltaSessao(ctxCoordA, PAC_A1, 0);
    expect(res).toBeTruthy();
    expect(res.delta.itens).toHaveLength(0);
    expect(res.delta.evidenciasNovas).toBe(0);
  });

  test("carregarDeltaSessao na Sessão 1 COM marco 0 compara contra o snapshot 0 (T25)", async () => {
    const pacMarcoZero = "00000000-0000-0000-0000-000000000099";
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${pacMarcoZero}, ${CLINIC_A}, 'Paciente com Marco Zero')`;
    await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe)
      VALUES (${pacMarcoZero}, ${U_T1_A}, 'ABA', 'terapeuta_referencia')`;

    // Snapshot 0 (Anamnese)
    await owner`INSERT INTO session_snapshot (patient_id, session_numero, repertorio_state, segmentacao) VALUES
      (${pacMarcoZero}, 0,
        ${owner.json({ [MARCO_ID]: { nivel_ajuda_recente: 4, contagem: 0, is_candidata: false, origem: "anamnese", procedencia: "relatado_responsavel" } })},
        ${owner.json({ [GOAL_ID]: { [PROTOCOL_ID]: { tipo_estrutura: "marco_simples", metrica: { eixo: "nivel_ajuda", ordinalRecente: 4 }, rotulo: "estavel" } } })}
      )`;

    // Snapshot 1
    await owner`INSERT INTO session_snapshot (patient_id, session_numero, repertorio_state, segmentacao) VALUES
      (${pacMarcoZero}, 1,
        ${owner.json({ [MARCO_ID]: { nivel_ajuda_recente: 2, contagem: 3, is_candidata: false } })},
        ${owner.json({ [GOAL_ID]: { [PROTOCOL_ID]: { tipo_estrutura: "marco_simples", metrica: { eixo: "nivel_ajuda", ordinalRecente: 2 }, rotulo: "evolucao" } } })}
      )`;

    const res = await carregarDeltaSessao(ctxCoordA, pacMarcoZero, 1);
    expect(res).toBeTruthy();
    expect(res.delta.evidenciasNovas).toBe(3); // 3 - 0
    const item = res.delta.itens.find((i) => i.id === MARCO_ID);
    expect(item).toBeTruthy();
    expect(item?.tipo).toBe("evolucao"); // 4 -> 2
    expect(item?.nivelAnterior).toBe(4);
    expect(item?.nivelNovo).toBe(2);

    // E no marco 0 do mesmo paciente:
    const res0 = await carregarDeltaSessao(ctxCoordA, pacMarcoZero, 0);
    expect(res0).toBeTruthy();
    expect(res0.delta.evidenciasNovas).toBe(0);
    const item0 = res0.delta.itens.find((i) => i.id === MARCO_ID);
    expect(item0?.tipo).toBe("novo");
  });
  // --- Bloco de rotinas (#558 - T5) ---------------------------------------
  //
  // Fixtures em SESSAO 4, fora dos intervalos (1-2 e 3-3) que os testes de
  // drill-down acima usam: guard novo que muda a contagem de fixture alheia
  // reprova o vizinho sem que nada esteja errado com ele.
  describe("carregarRotinas", () => {
    const CLINIC_B = "00000000-0000-0000-0000-0000000000fb";
    const U_COORD_B = "00000000-0000-0000-0000-00000000c0fb";
    const PAC_B1 = "00000000-0000-0000-0000-00000000acfb";
    let SESS_A4_ID: string;
    let EXT_ANCORADA: string;
    let EXT_SEM_ANCORA: string;

    beforeAll(async () => {
      SESS_A4_ID = crypto.randomUUID();
      await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, numero_sequencial_paciente, disciplina)
        VALUES (${SESS_A4_ID}, ${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, '2026-07-04 10:00:00Z', 'realizada', 4, 'aba')`;

      // Rotina ANCORADA: 3 etapas, uma delas com nivel fora da taxonomia.
      const [extA] =
        await owner`INSERT INTO extraction (session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload)
        VALUES (${SESS_A4_ID}, ${CLINIC_A}, 'aprovada', 'cadeia', 'no lanche abriu a lancheira sozinho', 'alta', ${owner.json({})}) RETURNING id`;
      EXT_ANCORADA = extA!.id as string;

      const etapas = [
        { descricao: "Abrir a lancheira", nivel_ajuda: "independente" },
        { descricao: "Abrir o pote", nivel_ajuda: "dica_fisica" },
        // Nivel LIVRE do agente que a taxonomia do protocolo nao conhece.
        { descricao: "Apontar o suco", nivel_ajuda: "quase sozinho" },
      ];
      for (let i = 0; i < etapas.length; i++) {
        await owner`INSERT INTO evidence
          (extraction_id, patient_id, session_id, session_numero, alvo_ordinal, protocol_id, goal_id, milestone_id, classificacao_original, aprovado_por)
          VALUES (${EXT_ANCORADA}, ${PAC_A1}, ${SESS_A4_ID}, 4, ${i}, ${PROTOCOL_ID}, ${GOAL_ID}, ${MARCO_ID},
            ${owner.json({ subtipo: "cadeia", nome: "Lanche", etapa_ordinal: i, ...etapas[i] })}, ${U_T1_A})`;
      }

      // Rotina SEM ancora: FKs nulas (R2.5) - registro valido, fora do grafico.
      const [extS] =
        await owner`INSERT INTO extraction (session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload)
        VALUES (${SESS_A4_ID}, ${CLINIC_A}, 'aprovada', 'cadeia', 'lavou as maos', 'media', ${owner.json({})}) RETURNING id`;
      EXT_SEM_ANCORA = extS!.id as string;

      await owner`INSERT INTO evidence
        (extraction_id, patient_id, session_id, session_numero, alvo_ordinal, protocol_id, goal_id, milestone_id, classificacao_original, aprovado_por)
        VALUES (${EXT_SEM_ANCORA}, ${PAC_A1}, ${SESS_A4_ID}, 4, 0, ${null}, ${null}, ${null},
          ${owner.json({ subtipo: "cadeia", nome: "Lavar as maos", etapa_ordinal: 0, descricao: "Ensaboar", nivel_ajuda: "dica_verbal" })}, ${U_T1_A})`;

      // Tenant vizinho, com rotina propria - para o teste cross-tenant.
      await owner`INSERT INTO clinic (id, nome, is_demo) VALUES (${CLINIC_B}, 'Clinica B (rotinas)', false)`;
      await owner`INSERT INTO app_user (id, name, email) VALUES (${U_COORD_B}, 'Coord B', 'coord.b.rotinas@t.com')`;
      await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_COORD_B}, ${CLINIC_B}, 'coordenador')`;
      await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC_B1}, ${CLINIC_B}, 'Paciente B1 (rotinas)')`;

      const sessB = crypto.randomUUID();
      await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, numero_sequencial_paciente, disciplina)
        VALUES (${sessB}, ${CLINIC_B}, ${PAC_B1}, ${U_COORD_B}, '2026-07-04 10:00:00Z', 'realizada', 1, 'aba')`;
      const [extB] =
        await owner`INSERT INTO extraction (session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload)
        VALUES (${sessB}, ${CLINIC_B}, 'aprovada', 'cadeia', 'rotina do vizinho', 'alta', ${owner.json({})}) RETURNING id`;
      await owner`INSERT INTO evidence
        (extraction_id, patient_id, session_id, session_numero, alvo_ordinal, protocol_id, goal_id, milestone_id, classificacao_original, aprovado_por)
        VALUES (${extB!.id}, ${PAC_B1}, ${sessB}, 1, 0, ${null}, ${null}, ${null},
          ${owner.json({ subtipo: "cadeia", nome: "Rotina do vizinho", etapa_ordinal: 0, descricao: "Etapa do vizinho", nivel_ajuda: "independente" })}, ${U_COORD_B})`;
    });

    test("agrupa por extracao e devolve as etapas na ordem do array", async () => {
      const res = await carregarRotinas(ctxCoordA, PAC_A1);

      const lanche = res.find((r) => r.extractionId === EXT_ANCORADA);
      expect(lanche).toBeTruthy();
      expect(lanche!.nome).toBe("Lanche");
      expect(lanche!.sessionNumero).toBe(4);
      // As TRES etapas, inteiras: um LIMIT sobre linhas de etapa devolveria
      // uma cadeia truncada com cara de cadeia inteira.
      expect(lanche!.etapas.map((e) => e.ordinal)).toEqual([0, 1, 2]);
      expect(lanche!.etapas.map((e) => e.descricao)).toEqual([
        "Abrir a lancheira",
        "Abrir o pote",
        "Apontar o suco",
      ]);
    });

    test("ancora resolvida vem com a meta; cadeia sem ancora vem marcada", async () => {
      const res = await carregarRotinas(ctxCoordA, PAC_A1);

      const lanche = res.find((r) => r.extractionId === EXT_ANCORADA)!;
      expect(lanche.ancorada).toBe(true);
      expect(lanche.metaDescricao).toBe("Pedir água de forma independente");

      const maos = res.find((r) => r.extractionId === EXT_SEM_ANCORA)!;
      expect(maos.ancorada).toBe(false);
      expect(maos.metaDescricao).toBeNull();
    });

    // G-6 (a): `indexOf` devolve -1 e -1 NUNCA vira 0 (0 = "independente").
    test("nivel fora da taxonomia do protocolo vem como nao classificado", async () => {
      const res = await carregarRotinas(ctxCoordA, PAC_A1);
      const lanche = res.find((r) => r.extractionId === EXT_ANCORADA)!;

      const conhecidos = lanche.etapas.filter((e) => !e.naoClassificado);
      expect(conhecidos.map((e) => e.nivelAjuda)).toEqual([
        "independente",
        "dica_fisica",
      ]);

      const desconhecida = lanche.etapas.filter((e) => e.naoClassificado);
      expect(desconhecida).toHaveLength(1);
      expect(desconhecida[0]!.nivelAjuda).toBe("quase sozinho");
    });

    // O filtro e por `subtipo` dentro do jsonb - e ele que desambigua a dupla
    // semantica de `alvo_ordinal`. Sem ele, as evidencias comuns das sessoes
    // 1-3 entrariam no bloco como se fossem etapas de rotina.
    test("evidencia comum nao vira rotina", async () => {
      const res = await carregarRotinas(ctxCoordA, PAC_A1);
      expect(res.map((r) => r.extractionId).sort()).toEqual(
        [EXT_ANCORADA, EXT_SEM_ANCORA].sort(),
      );
    });

    test("rotina de outra clinica nao aparece", async () => {
      // O oraculo NAO pode codificar "invisivel pela policy = inexistente"
      // (memo R-1): primeiro provamos, como owner, que a linha do vizinho
      // EXISTE - senao o `[]` abaixo ficaria verde num banco vazio.
      const [contagem] = await owner`
        SELECT count(*)::int AS n FROM evidence
        WHERE patient_id = ${PAC_B1}
          AND classificacao_original ->> 'subtipo' = 'cadeia'`;
      expect(contagem!.n).toBe(1);

      const res = await carregarRotinas(ctxCoordA, PAC_B1);
      expect(res).toEqual([]);
    });
  });
});
