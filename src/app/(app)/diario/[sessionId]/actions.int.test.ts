import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "@tests/integration-env";
vi.mock("server-only", () => ({}));
// #391 R3 — permite injetar drafts de extração controlados (subtipo
// `aplicacao_escala_relatada` + `item_risco_positivo`) sem depender do
// DemoStubProvider (que nunca produz esse subtipo) nem de um LLM real.
// `importOriginal` preserva o comportamento padrão (DemoStubProvider em
// clínica demo) para todos os testes que não usam `mockReturnValueOnce`.
vi.mock("@/lib/extraction/provider", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/extraction/provider")>();
  return { ...actual, resolveProvider: vi.fn(actual.resolveProvider) };
});

const CLINIC_A = "00000000-0000-0000-0000-0000000000a1";
const U_T1 = "00000000-0000-0000-0000-0000000071a1";
const U_T2 = "00000000-0000-0000-0000-0000000072a1";
const U_COBERTURA = "00000000-0000-0000-0000-0000000073a1";
const PAC = "00000000-0000-0000-0000-0000000ac1a1";
const PAC2 = "00000000-0000-0000-0000-0000000ac2a1";
const PROTO = "00000000-0000-0000-0000-00000070c0a1";
const SESS = "00000000-0000-0000-0000-00000005e1a1"; // terapeuta = U_T1
const SESS_COBERTURA = "00000000-0000-0000-0000-00000005e2a1"; // terapeuta = U_COBERTURA
const GOAL_PAC = "00000000-0000-0000-0000-00000006a1a1";
const GOAL_PAC2 = "00000000-0000-0000-0000-00000006a2a1";
const ctxT1 = { clinicId: CLINIC_A, userId: U_T1, role: "terapeuta" } as const;
const ctxT2 = { clinicId: CLINIC_A, userId: U_T2, role: "terapeuta" } as const;
const ctxCobertura = {
  clinicId: CLINIC_A,
  userId: U_COBERTURA,
  role: "terapeuta",
} as const;

let owner: ReturnType<typeof postgres>;
let capturarDiario: typeof import("./logic").capturarDiario;
let corrigirEscopoProtocolo: typeof import("./logic").corrigirEscopoProtocolo;
let registrarAudioLocal: typeof import("./logic").registrarAudioLocal;
let appSql: typeof import("@/db/client").sql;

describe.skipIf(!hasDb)("diário · captura", () => {
  beforeAll(async () => {
    ({ capturarDiario, corrigirEscopoProtocolo, registrarAudioLocal } =
      await import("./logic"));
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, patient, protocol, session,
      session_note, session_protocol_scope, audio_capture, care_team_membership, goal
      RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO protocol_familia_catalogo (id, nome) VALUES ('aba_marcos_desenvolvimento', 'Marcos de desenvolvimento (ABA)') ON CONFLICT DO NOTHING`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'A')`;
    await owner`INSERT INTO app_user (id, email, name) VALUES
      (${U_T1}, 't1@x.com', 'T1'), (${U_T2}, 't2@x.com', 'T2'),
      (${U_COBERTURA}, 'cob@x.com', 'Cobertura')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_T1}, ${CLINIC_A}, 'terapeuta'), (${U_T2}, ${CLINIC_A}, 'terapeuta'),
      (${U_COBERTURA}, ${CLINIC_A}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC}, ${CLINIC_A}, 'P'), (${PAC2}, ${CLINIC_A}, 'P2')`;
    await owner`INSERT INTO protocol (id, clinic_id, nome, disciplina, familia) VALUES
      (${PROTO}, ${CLINIC_A}, 'VB-MAPP', 'ABA', 'aba_marcos_desenvolvimento')`;
    // SESS: de U_T1 (na equipe de PAC). SESS_COBERTURA: mesmo paciente PAC,
    // mas de U_COBERTURA, que NÃO está na care team — é o cenário do bug de
    // numeração sob RLS.
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina) VALUES
      (${SESS}, ${CLINIC_A}, ${PAC}, ${U_T1}, now(), 'realizada', 'aba'),
      (${SESS_COBERTURA}, ${CLINIC_A}, ${PAC}, ${U_COBERTURA}, now(), 'realizada', 'aba')`;
    await owner`INSERT INTO care_team_membership (patient_id, user_id, papel_na_equipe, disciplina)
      VALUES (${PAC}, ${U_T1}, 'terapeuta_referencia', 'ABA')`;
  });
  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("terapeuta dono grava captura rápida", async () => {
    const r = await capturarDiario(ctxT1, {
      sessionId: SESS,
      texto: "Pediu água apontando",
    });
    expect(r.error).toBeUndefined();
    expect(r.id).toBeTruthy();
  });

  test("terapeuta que não é dono da sessão é barrado", async () => {
    const r = await capturarDiario(ctxT2, {
      sessionId: SESS,
      texto: "indevido",
    });
    expect(r.error).toBeTruthy(); // RLS WITH CHECK bloqueia
  });

  test("corrigir escopo grava protocolo com origem ajustada", async () => {
    const r = await corrigirEscopoProtocolo(ctxT1, {
      sessionId: SESS,
      protocolIds: [PROTO],
    });
    expect(r.error).toBeUndefined();
    const rows =
      await owner`SELECT origem, ajustado_por FROM session_protocol_scope WHERE session_id = ${SESS}`;
    expect(rows[0]!.origem).toBe("ajustado_manualmente");
    expect(rows[0]!.ajustado_por).toBe(U_T1);
  });

  test("consolidar grava nota, popula numero_sequencial e é idempotente", async () => {
    const { consolidarSessao } = await import("./logic");
    const r1 = await consolidarSessao(ctxT1, {
      sessionId: SESS,
      texto: "Nota final revisada da sessão.",
    });
    expect(r1.error).toBeUndefined();
    expect(r1.numeroSequencial).toBe(1);
    // reconsolidar NÃO incrementa o sequencial
    const r2 = await consolidarSessao(ctxT1, {
      sessionId: SESS,
      texto: "Nota final corrigida.",
    });
    expect(r2.numeroSequencial).toBe(1);
    const s =
      await owner`SELECT numero_sequencial_paciente FROM session WHERE id = ${SESS}`;
    expect(s[0]!.numero_sequencial_paciente).toBe(1);
  });

  test("clínica demo gera extrações sugeridas ao consolidar", async () => {
    await owner`UPDATE clinic SET is_demo = true WHERE id = ${CLINIC_A}`;
    const { consolidarSessao } = await import("./logic");
    await consolidarSessao(ctxT1, {
      sessionId: SESS,
      texto: "Pediu água. Falou 'á' sozinho. Não respondeu depois.",
    });
    const ex =
      await owner`SELECT estado FROM extraction WHERE session_id = ${SESS}`;
    expect(ex.length).toBeGreaterThanOrEqual(1);
    expect(ex.every((e) => e.estado === "sugerida")).toBe(true);
    await owner`UPDATE clinic SET is_demo = false WHERE id = ${CLINIC_A}`;
  });

  test("consolidar anexa apenas metas ativas do paciente da sessão", async () => {
    await owner`DELETE FROM extraction WHERE session_id = ${SESS}`;
    await owner`DELETE FROM goal`;
    await owner`INSERT INTO goal (id, patient_id, clinic_id, descricao, criterio_dominio, criado_por) VALUES
      (${GOAL_PAC}, ${PAC}, ${CLINIC_A}, 'Pedir água sozinho', '{"tipo":"frequencia","valor":3}', ${U_T1}),
      (${GOAL_PAC2}, ${PAC2}, ${CLINIC_A}, 'Meta de outro paciente', '{"tipo":"frequencia","valor":3}', ${U_T1})`;
    await owner`UPDATE goal SET estado = 'ativa' WHERE id IN (${GOAL_PAC}, ${GOAL_PAC2})`;

    await owner`UPDATE clinic SET is_demo = true WHERE id = ${CLINIC_A}`;
    const { consolidarSessao } = await import("./logic");
    await consolidarSessao(ctxT1, {
      sessionId: SESS,
      texto: "Pediu água. Falou 'á' sozinho.",
    });
    const ex =
      await owner`SELECT payload FROM extraction WHERE session_id = ${SESS}`;
    expect(ex.length).toBeGreaterThanOrEqual(1);
    const goalIdsReferenciados = ex.flatMap(
      (e) =>
        (e.payload as { alvos?: Array<{ goal_id: string }> }).alvos?.map(
          (a) => a.goal_id,
        ) ?? [],
    );
    expect(goalIdsReferenciados.length).toBeGreaterThan(0);
    expect(goalIdsReferenciados.every((id) => id === GOAL_PAC)).toBe(true);
    expect(goalIdsReferenciados).not.toContain(GOAL_PAC2);
    await owner`UPDATE clinic SET is_demo = false WHERE id = ${CLINIC_A}`;
  });

  test("clínica de produção fica pendente de reprocessamento (sem LLM)", async () => {
    // limpa extrações da sessão do caso anterior
    await owner`DELETE FROM extraction WHERE session_id = ${SESS}`;
    const { consolidarSessao } = await import("./logic");
    await consolidarSessao(ctxT1, {
      sessionId: SESS,
      texto: "Nota de produção.",
    });
    const ex =
      await owner`SELECT estado FROM extraction WHERE session_id = ${SESS}`;
    expect(ex.some((e) => e.estado === "pendente_reprocessamento")).toBe(true);
  });

  test("terapeuta de cobertura (fora da equipe) recebe o próximo número correto, não duplica", async () => {
    // SESS (de U_T1, na equipe) já foi consolidada com numero 1 nos testes acima
    // e permanece 1 (idempotente). U_COBERTURA é dono de SESS_COBERTURA do MESMO
    // paciente, mas NÃO está na care team: sob a RLS antiga o MAX() só veria as
    // sessões visíveis a ele (subestimado → daria 1, duplicando). O helper
    // SECURITY DEFINER enxerga todas as sessões do paciente → deve dar 2.
    await owner`DELETE FROM extraction WHERE session_id = ${SESS_COBERTURA}`;
    const { consolidarSessao } = await import("./logic");
    const r = await consolidarSessao(ctxCobertura, {
      sessionId: SESS_COBERTURA,
      texto: "Sessão de cobertura consolidada.",
    });
    expect(r.error).toBeUndefined();
    expect(r.numeroSequencial).toBe(2);
    const s =
      await owner`SELECT numero_sequencial_paciente FROM session WHERE id = ${SESS_COBERTURA}`;
    expect(s[0]!.numero_sequencial_paciente).toBe(2);
  });

  // ─── #174 regra 6: gravar registro clínico desarquiva o paciente ──────────
  const ACAO = "paciente_desarquivado_automaticamente";
  const arquivar = () =>
    owner`UPDATE patient SET arquivado_em = now() WHERE id = ${PAC}`;
  const trilha = async () => {
    const [r] = await owner`SELECT count(*)::int AS n FROM audit_log
      WHERE acao = ${ACAO} AND patient_id = ${PAC}`;
    return r!.n as number;
  };
  const arquivadoEm = async () => {
    const [r] = await owner`SELECT arquivado_em FROM patient WHERE id = ${PAC}`;
    return r!.arquivado_em as Date | null;
  };

  test("regra 6 · captura de diário desarquiva o paciente e grava 1 linha de trilha", async () => {
    await owner`DELETE FROM audit_log WHERE patient_id = ${PAC}`;
    await arquivar();
    expect(await arquivadoEm()).not.toBeNull(); // pré-condição real

    const r = await capturarDiario(ctxT1, {
      sessionId: SESS,
      texto: "Voltou a atender depois de meses.",
    });
    expect(r.error).toBeUndefined();
    expect(await arquivadoEm()).toBeNull(); // saiu do arquivo comercial
    expect(await trilha()).toBe(1);
  });

  test("regra 6 · segunda nota na sequência NÃO gera 2ª linha de trilha", async () => {
    // Paciente já ativo (teste anterior). `audit_log` é append-only para
    // `app_role`: uma duplicata aqui não teria como ser apagada depois.
    await capturarDiario(ctxT1, { sessionId: SESS, texto: "Segunda nota." });
    const { consolidarSessao } = await import("./logic");
    await consolidarSessao(ctxT1, { sessionId: SESS, texto: "Consolidada." });
    expect(await trilha()).toBe(1);
  });

  test("regra 6 · nota de paciente NÃO arquivado não gera trilha nenhuma", async () => {
    await owner`DELETE FROM audit_log WHERE patient_id = ${PAC}`;
    expect(await arquivadoEm()).toBeNull();
    await capturarDiario(ctxT1, { sessionId: SESS, texto: "Sessão normal." });
    expect(await trilha()).toBe(0);
  });

  test("regra 6 · registrarAudioLocal para paciente arquivado desarquiva e grava trilha com audio_local", async () => {
    await owner`DELETE FROM audit_log WHERE patient_id = ${PAC}`;
    await arquivar();
    expect(await arquivadoEm()).not.toBeNull();

    const r = await registrarAudioLocal(ctxT1, {
      sessionId: SESS,
      duracaoSegundos: 45,
    });
    expect(r.error).toBeUndefined();
    expect(r.id).toBeTruthy();
    expect(await arquivadoEm()).toBeNull();

    const [log] =
      await owner`SELECT acao, detalhe FROM audit_log WHERE patient_id = ${PAC}`;
    expect(log!.acao).toBe("paciente_desarquivado_automaticamente");
    expect(log!.detalhe).toEqual({ origem: "audio_local" });
  });

  test("regra 6 · corrigirEscopoProtocolo para paciente arquivado desarquiva e grava trilha com escopo_protocolo", async () => {
    await owner`DELETE FROM audit_log WHERE patient_id = ${PAC}`;
    await arquivar();
    expect(await arquivadoEm()).not.toBeNull();

    const r = await corrigirEscopoProtocolo(ctxT1, {
      sessionId: SESS,
      protocolIds: [PROTO],
    });
    expect(r.error).toBeUndefined();
    expect(await arquivadoEm()).toBeNull();

    const [log] =
      await owner`SELECT acao, detalhe FROM audit_log WHERE patient_id = ${PAC}`;
    expect(log!.acao).toBe("paciente_desarquivado_automaticamente");
    expect(log!.detalhe).toEqual({ origem: "escopo_protocolo" });
  });

  test("regra 6 (D8) · terapeuta de cobertura (fora da equipe) salva diário E desarquiva o paciente", async () => {
    // D8: Terapeuta de cobertura agora desarquiva o paciente ao registrar o diário,
    // emitindo audit_log com ator_id do terapeuta de cobertura.
    await owner`DELETE FROM audit_log WHERE patient_id = ${PAC}`;
    await arquivar();
    expect(await arquivadoEm()).not.toBeNull();

    const r = await capturarDiario(ctxCobertura, {
      sessionId: SESS_COBERTURA,
      texto: "Cobertura registrou a sessão.",
    });
    expect(r.error).toBeUndefined();
    expect(r.id).toBeTruthy();
    expect(await arquivadoEm()).toBeNull(); // Desarquivado automaticamente (D8)
    expect(await trilha()).toBe(1);

    const [log] =
      await owner`SELECT acao, ator_id, detalhe FROM audit_log WHERE patient_id = ${PAC}`;
    expect(log!.acao).toBe("paciente_desarquivado_automaticamente");
    expect(log!.ator_id).toBe(U_COBERTURA);
    expect(log!.detalhe).toEqual({ origem: "registro_clinico" });

    await owner`UPDATE patient SET arquivado_em = NULL WHERE id = ${PAC}`;
  });

  // ─── #391 R3 — alerta de risco de INSTRUMENTO FORMAL ──────────────────────
  // Determinístico: lê `item_risco_positivo` do payload já persistido na
  // extração `aplicacao_escala_relatada`, sem chamar LLM nessa decisão (o
  // provider é um fake síncrono, nenhum invoker de modelo é exercitado aqui).
  describe("instrumento formal (#391)", () => {
    const limpar = async () => {
      await owner`DELETE FROM alerta_risco_clinico WHERE patient_id = ${PAC}`;
      await owner`DELETE FROM extraction WHERE session_id = ${SESS}`;
    };

    const alertasInstrumento = () =>
      owner`SELECT origem, categoria, severidade, certeza, origem_extraction_id
              FROM alerta_risco_clinico
             WHERE patient_id = ${PAC} AND origem = 'instrumento_formal'`;

    const mockarProvider = async (drafts: unknown[]) => {
      const { resolveProvider } = await import("@/lib/extraction/provider");
      vi.mocked(resolveProvider).mockReturnValueOnce({
        extrair: async () => ({ drafts: drafts as never, alertaRisco: null }),
      });
    };

    test("item_risco_positivo=true cria alerta com origem instrumento_formal e certeza explicito", async () => {
      await limpar();
      await mockarProvider([
        {
          subtipo: "aplicacao_escala_relatada",
          trechoFonte: "Respondeu 'sim' ao item de ideação da escala.",
          confianca: "alta",
          inconsistenteComHistorico: false,
          parContrasteId: null,
          payload: { item_risco_positivo: true },
          estado: "sugerida",
        },
      ]);
      const { consolidarSessao } = await import("./logic");
      const r = await consolidarSessao(ctxT1, {
        sessionId: SESS,
        texto: "Aplicação de escala nesta sessão.",
      });
      expect(r.error).toBeUndefined();

      const ex =
        await owner`SELECT id FROM extraction WHERE session_id = ${SESS} AND subtipo = 'aplicacao_escala_relatada'`;
      expect(ex.length).toBe(1);

      const alertas = await alertasInstrumento();
      expect(alertas.length).toBe(1);
      expect(alertas[0]!.certeza).toBe("explicito");
      expect(alertas[0]!.categoria).toBe("ideacao_suicida");
      expect(alertas[0]!.severidade).toBe("ideacao_ativa_sem_plano");
      expect(alertas[0]!.origem_extraction_id).toBe(ex[0]!.id);
    });

    test("item_risco_positivo=null (recusa) cria alerta com certeza ambiguo_citado", async () => {
      await limpar();
      await mockarProvider([
        {
          subtipo: "aplicacao_escala_relatada",
          trechoFonte: "Paciente não quis responder ao item de risco.",
          confianca: "media",
          inconsistenteComHistorico: false,
          parContrasteId: null,
          payload: { item_risco_positivo: null },
          estado: "sugerida",
        },
      ]);
      const { consolidarSessao } = await import("./logic");
      const r = await consolidarSessao(ctxT1, {
        sessionId: SESS,
        texto: "Aplicação de escala com recusa de item.",
      });
      expect(r.error).toBeUndefined();

      const alertas = await alertasInstrumento();
      expect(alertas.length).toBe(1);
      expect(alertas[0]!.certeza).toBe("ambiguo_citado");
    });

    test("item_risco_positivo=false NÃO cria alerta", async () => {
      await limpar();
      await mockarProvider([
        {
          subtipo: "aplicacao_escala_relatada",
          trechoFonte: "Respondeu 'não' ao item de ideação da escala.",
          confianca: "alta",
          inconsistenteComHistorico: false,
          parContrasteId: null,
          payload: { item_risco_positivo: false },
          estado: "sugerida",
        },
      ]);
      const { consolidarSessao } = await import("./logic");
      const r = await consolidarSessao(ctxT1, {
        sessionId: SESS,
        texto: "Aplicação de escala sem sinal de risco.",
      });
      expect(r.error).toBeUndefined();

      const alertas = await alertasInstrumento();
      expect(alertas.length).toBe(0);
    });

    test("subtipo diferente de aplicacao_escala_relatada NÃO cria alerta, mesmo com campo parecido no payload", async () => {
      await limpar();
      await mockarProvider([
        {
          subtipo: "evidencia",
          trechoFonte: "Trecho de evidência qualquer.",
          confianca: "alta",
          inconsistenteComHistorico: false,
          parContrasteId: null,
          // campo homônimo de propósito: a regra é restrita ao subtipo, não ao
          // formato do payload.
          payload: { item_risco_positivo: true },
          estado: "sugerida",
        },
      ]);
      const { consolidarSessao } = await import("./logic");
      const r = await consolidarSessao(ctxT1, {
        sessionId: SESS,
        texto: "Sessão comum, sem instrumento.",
      });
      expect(r.error).toBeUndefined();

      const alertas = await alertasInstrumento();
      expect(alertas.length).toBe(0);
    });
  });
});
