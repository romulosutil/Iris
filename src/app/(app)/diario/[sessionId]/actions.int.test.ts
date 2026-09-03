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
// T09 — o upload real (S3/MinIO) já é coberto por src/lib/asr/storage.test.ts;
// aqui o dublê isola o comportamento de banco (linhas, idempotência, gate)
// do serviço de rede externo.
const guardarMock = vi.fn(
  async (_chave: string, _dados: Uint8Array, _contentType?: string) =>
    undefined,
);
vi.mock("@/lib/asr/storage", () => ({
  guardar: (chave: string, dados: Uint8Array, contentType?: string) =>
    guardarMock(chave, dados, contentType),
}));

const CLINIC_A = "00000000-0000-0000-0000-0000000000a1";
const U_T1 = "00000000-0000-0000-0000-0000000071a1";
const U_T2 = "00000000-0000-0000-0000-0000000072a1";
const U_COBERTURA = "00000000-0000-0000-0000-0000000073a1";
const PAC = "00000000-0000-0000-0000-0000000ac1a1";
const PAC2 = "00000000-0000-0000-0000-0000000ac2a1";
const PROTO = "00000000-0000-0000-0000-00000070c0a1";
const SESS = "00000000-0000-0000-0000-00000005e1a1"; // terapeuta = U_T1
const SESS_COBERTURA = "00000000-0000-0000-0000-00000005e2a1"; // terapeuta = U_COBERTURA
// #506 — clínica solo: o fundador só tem papel `coordenador` (é o que
// `criarClinicaEVinculo` grava), e é ele mesmo quem atende as sessões.
const U_SOLO = "00000000-0000-0000-0000-0000000074a1";
// ⚠ `...05e3a1` já é o SESS_B do describe de obterEstadoLote — não reusar.
const SESS_SOLO = "00000000-0000-0000-0000-00000005e4a1"; // terapeuta = U_SOLO
const GOAL_PAC = "00000000-0000-0000-0000-00000006a1a1";
const GOAL_PAC2 = "00000000-0000-0000-0000-00000006a2a1";
const ctxT1 = { clinicId: CLINIC_A, userId: U_T1, role: "terapeuta" } as const;
const ctxT2 = { clinicId: CLINIC_A, userId: U_T2, role: "terapeuta" } as const;
const ctxCobertura = {
  clinicId: CLINIC_A,
  userId: U_COBERTURA,
  role: "terapeuta",
} as const;
const ctxSolo = {
  clinicId: CLINIC_A,
  userId: U_SOLO,
  role: "coordenador",
} as const;

let owner: ReturnType<typeof postgres>;
let capturarDiario: typeof import("./logic").capturarDiario;
let corrigirEscopoProtocolo: typeof import("./logic").corrigirEscopoProtocolo;
let registrarAudioLocal: typeof import("./logic").registrarAudioLocal;
let enviarLoteAsr: typeof import("./logic").enviarLoteAsr;
let appSql: typeof import("@/db/client").sql;

describe.skipIf(!hasDb)("diário · captura", () => {
  beforeAll(async () => {
    ({
      capturarDiario,
      corrigirEscopoProtocolo,
      registrarAudioLocal,
      enviarLoteAsr,
    } = await import("./logic"));
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, patient, protocol, session,
      session_note, session_protocol_scope, audio_capture, care_team_membership, goal,
      patient_protocol
      RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO protocol_familia_catalogo (id, nome) VALUES ('aba_marcos_desenvolvimento', 'Marcos de desenvolvimento (ABA)') ON CONFLICT DO NOTHING`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'A')`;
    await owner`INSERT INTO app_user (id, email, name) VALUES
      (${U_T1}, 't1@x.com', 'T1'), (${U_T2}, 't2@x.com', 'T2'),
      (${U_COBERTURA}, 'cob@x.com', 'Cobertura'),
      (${U_SOLO}, 'solo@x.com', 'Solo')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_T1}, ${CLINIC_A}, 'terapeuta'), (${U_T2}, ${CLINIC_A}, 'terapeuta'),
      (${U_COBERTURA}, ${CLINIC_A}, 'terapeuta'),
      (${U_SOLO}, ${CLINIC_A}, 'coordenador')`;
    // Modalidade padrão do schema é `protocol_driven` (nenhuma foi passada
    // aqui) — degraus bloqueantes: protocolo E meta (modalidade.ts). T07b
    // fecha o gate de escrita nesta régua, então todo paciente com sessão
    // usada em `capturarDiario`/`consolidarSessao` abaixo precisa dos dois
    // desde o início, senão a PRIMEIRA chamada do arquivo já recusa.
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC}, ${CLINIC_A}, 'P'), (${PAC2}, ${CLINIC_A}, 'P2')`;
    await owner`INSERT INTO protocol (id, clinic_id, nome, disciplina, familia) VALUES
      (${PROTO}, ${CLINIC_A}, 'VB-MAPP', 'ABA', 'aba_marcos_desenvolvimento')`;
    // SESS: de U_T1 (na equipe de PAC). SESS_COBERTURA: mesmo paciente PAC,
    // mas de U_COBERTURA, que NÃO está na care team — é o cenário do bug de
    // numeração sob RLS.
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina) VALUES
      (${SESS}, ${CLINIC_A}, ${PAC}, ${U_T1}, now(), 'realizada', 'aba'),
      (${SESS_COBERTURA}, ${CLINIC_A}, ${PAC}, ${U_COBERTURA}, now(), 'realizada', 'aba'),
      (${SESS_SOLO}, ${CLINIC_A}, ${PAC2}, ${U_SOLO}, now(), 'realizada', 'aba')`;
    await owner`INSERT INTO care_team_membership (patient_id, user_id, papel_na_equipe, disciplina)
      VALUES (${PAC}, ${U_T1}, 'terapeuta_referencia', 'ABA')`;
    // U_COBERTURA propositalmente FORA da care team: `app_fatos_prontidao`
    // (migração `0149`, Task 7c) autoriza a leitura clínica pelo recorte de
    // cobertura (`session.terapeuta_id = app.user_id`), não por vínculo de
    // equipe. Uma linha de `care_team_membership` aqui mascararia a própria
    // coisa que este describe prova.
    await owner`INSERT INTO patient_protocol (patient_id, protocol_id, ativado_por, ativado_em, desativado_em) VALUES
      (${PAC}, ${PROTO}, ${U_T1}, now()::date, NULL),
      (${PAC2}, ${PROTO}, ${U_SOLO}, now()::date, NULL)`;
    await owner`INSERT INTO goal (id, patient_id, clinic_id, descricao, estado, criterio_dominio, criado_por) VALUES
      (${GOAL_PAC}, ${PAC}, ${CLINIC_A}, 'Pedir água sozinho', 'ativa', '{"tipo":"frequencia","valor":3}', ${U_T1}),
      (${GOAL_PAC2}, ${PAC2}, ${CLINIC_A}, 'Meta de outro paciente', 'ativa', '{"tipo":"frequencia","valor":3}', ${U_T1})`;
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

  // T16 cenário 3 (#72) — R23: recusa/ausência de consentimento de ASR (aqui
  // representada pela flag desligada, já que não existe ainda um consentimento
  // ASR dedicado no schema) nunca pode bloquear o Modo 1 (digitação). O core
  // de `capturarDiario` não referencia `asrHabilitado`/ASR em nenhum ponto —
  // este teste é o cheque de que essa independência não regride: se alguém
  // introduzir um gate compartilhado, a asserção abaixo cai.
  test("R23 · flag de ASR desligada não bloqueia captura de diário por digitação (Modo 1)", async () => {
    const original = process.env.FEATURE_FLAG_ASR_ENABLED;
    delete process.env.FEATURE_FLAG_ASR_ENABLED;
    try {
      const r = await capturarDiario(ctxT1, {
        sessionId: SESS,
        texto: "Digitado normalmente, ASR indisponível",
      });
      expect(r.error).toBeUndefined();
      expect(r.id).toBeTruthy();
    } finally {
      if (original === undefined) delete process.env.FEATURE_FLAG_ASR_ENABLED;
      else process.env.FEATURE_FLAG_ASR_ENABLED = original;
    }
  });

  test("terapeuta que não é dono da sessão é barrado", async () => {
    const r = await capturarDiario(ctxT2, {
      sessionId: SESS,
      texto: "indevido",
    });
    expect(r.error).toBeTruthy(); // RLS WITH CHECK bloqueia
  });

  // #506 — o bug reportado: clínica de um terapeuta só. O fundador tem apenas
  // papel `coordenador` (`criarClinicaEVinculo`) e `papelAtivo` faz coordenador
  // vencer sempre, então `requireRole(ctx, "terapeuta")` deixava a clínica solo
  // sem NENHUM caminho de escrita no diário. Agora passa — e escreve de fato,
  // não só atravessa a guarda de papel.
  test("#506 · coordenador dono da sessão (clínica solo) grava captura rápida", async () => {
    const r = await capturarDiario(ctxSolo, {
      sessionId: SESS_SOLO,
      texto: "Sessão da clínica solo",
    });
    expect(r.error).toBeUndefined();
    const rows =
      await owner`SELECT texto, autor_id FROM session_note WHERE session_id = ${SESS_SOLO} AND tipo = 'captura_rapida'`;
    expect(rows.length).toBe(1);
    expect(rows[0]!.texto).toBe("Sessão da clínica solo");
    expect(rows[0]!.autor_id).toBe(U_SOLO);
  });

  // Contrapartida do teste acima: aceitar `coordenador` na guarda de papel NÃO
  // abre o diário alheio. Quem restringe é a RLS (`session_note_insert` exige
  // `app_session_profissional_responsavel(session_id)` — titular ou substituto
  // designado, #539), não a guarda.
  test("#506 · coordenador que NÃO é o terapeuta da sessão continua barrado", async () => {
    const r = await capturarDiario(ctxSolo, {
      sessionId: SESS,
      texto: "diário de outro terapeuta",
    });
    expect(r.error).toBeTruthy();
    const rows =
      await owner`SELECT texto FROM session_note WHERE session_id = ${SESS} AND texto = 'diário de outro terapeuta'`;
    expect(rows.length).toBe(0);
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

  test("capturarDiario persiste visibilityLevel 'discipline_only'", async () => {
    const r = await capturarDiario(ctxT1, {
      sessionId: SESS,
      texto: "Nota confidencial da disciplina",
      visibilityLevel: "discipline_only",
    });
    expect(r.error).toBeUndefined();
    const rows =
      await owner`SELECT visibility_level FROM session_note WHERE session_id = ${SESS} AND tipo = 'captura_rapida'`;
    expect(rows[0]!.visibility_level).toBe("discipline_only");
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

  // Bug de 31/08/2026: o `gemini-2.5-flash` chumbado foi aposentado pelo Google
  // (404 NOT_FOUND) e TODA extração de produção caiu no catch da Fase B. Como o
  // catch só fazia `console.error`, a action devolvia `{ ok: true }` e a UI
  // pintava "Sessão consolidada" em verde: falha invisível para o terapeuta.
  test("extração que falha devolve AVISO (não passa por sucesso limpo)", async () => {
    await owner`DELETE FROM extraction WHERE session_id = ${SESS}`;
    const { resolveProvider } = await import("@/lib/extraction/provider");
    vi.mocked(resolveProvider).mockReturnValueOnce({
      extrair: async () => {
        throw new Error("404 NOT_FOUND: modelo aposentado");
      },
    });

    const { consolidarSessao, AVISO_EXTRACAO_FALHOU } = await import("./logic");
    const r = await consolidarSessao(ctxT1, {
      sessionId: SESS,
      texto: "Nota que o LLM não conseguiu analisar.",
    });

    // A nota é registro clínico: nunca se perde por falha do provider.
    expect(r.error).toBeUndefined();
    expect(r.aviso).toBe(AVISO_EXTRACAO_FALHOU);
    const notas =
      await owner`SELECT texto FROM session_note WHERE session_id = ${SESS} AND tipo = 'nota_consolidada'`;
    expect(notas[0]!.texto).toBe("Nota que o LLM não conseguiu analisar.");
    const ex =
      await owner`SELECT estado FROM extraction WHERE session_id = ${SESS}`;
    expect(ex.length).toBe(1);
    expect(ex[0]!.estado).toBe("pendente_reprocessamento");
  });

  test("extração bem-sucedida NÃO devolve aviso", async () => {
    await owner`DELETE FROM extraction WHERE session_id = ${SESS}`;
    const { resolveProvider } = await import("@/lib/extraction/provider");
    vi.mocked(resolveProvider).mockReturnValueOnce({
      extrair: async () => ({ drafts: [], alertaRisco: null }),
    });
    const { consolidarSessao } = await import("./logic");
    const r = await consolidarSessao(ctxT1, {
      sessionId: SESS,
      texto: "Nota analisada com sucesso pelo provider.",
    });
    expect(r.error).toBeUndefined();
    expect(r.aviso).toBeUndefined();
  });

  // ── DA-02 (#535): rastreio da chamada de IA chega ao banco ──────────────
  test("DA-02 · consolidar grava modelo, prompt_versao, latencia_ms e tokens do provider", async () => {
    await owner`DELETE FROM extraction WHERE session_id = ${SESS}`;
    const { resolveProvider } = await import("@/lib/extraction/provider");
    vi.mocked(resolveProvider).mockReturnValueOnce({
      modelo: "gemini-fake",
      extrair: async () => ({
        drafts: [
          {
            subtipo: "evidencia",
            trechoFonte: "Pediu água apontando",
            confianca: "alta",
            inconsistenteComHistorico: false,
            parContrasteId: null,
            payload: { alvos: [], polaridade: "positiva" },
            estado: "sugerida",
          },
        ],
        alertaRisco: null,
        meta: {
          modelo: "gemini-fake",
          promptVersao: "abc123def456",
          latenciaMs: 1234,
          tokensEntrada: 500,
          tokensSaida: 40,
        },
      }),
    });
    const { consolidarSessao } = await import("./logic");
    const r = await consolidarSessao(ctxT1, {
      sessionId: SESS,
      texto: "Pediu água apontando. Rastreio DA-02.",
    });
    expect(r.error).toBeUndefined();
    const ex =
      await owner`SELECT estado, modelo, prompt_versao, latencia_ms, tokens_entrada, tokens_saida FROM extraction WHERE session_id = ${SESS}`;
    expect(ex).toHaveLength(1);
    expect(ex[0]).toMatchObject({
      estado: "sugerida",
      modelo: "gemini-fake",
      prompt_versao: "abc123def456",
      latencia_ms: 1234,
      tokens_entrada: 500,
      tokens_saida: 40,
    });
  });

  test("DA-02/A-03 · provider que falha grava latencia_ms e modelo na linha pendente_reprocessamento", async () => {
    await owner`DELETE FROM extraction WHERE session_id = ${SESS}`;
    const { resolveProvider } = await import("@/lib/extraction/provider");
    vi.mocked(resolveProvider).mockReturnValueOnce({
      modelo: "gemini-fake",
      extrair: async () => {
        await new Promise((r) => setTimeout(r, 30));
        throw Object.assign(new Error("503 overloaded"), { status: 503 });
      },
    });
    const { consolidarSessao, AVISO_EXTRACAO_FALHOU } = await import("./logic");
    const r = await consolidarSessao(ctxT1, {
      sessionId: SESS,
      texto: "Nota cuja extração falhou — latência ainda assim medida.",
    });
    expect(r.aviso).toBe(AVISO_EXTRACAO_FALHOU);
    const ex =
      await owner`SELECT estado, modelo, prompt_versao, latencia_ms, tokens_entrada FROM extraction WHERE session_id = ${SESS}`;
    expect(ex).toHaveLength(1);
    expect(ex[0]!.estado).toBe("pendente_reprocessamento");
    expect(ex[0]!.modelo).toBe("gemini-fake");
    // O que este teste prova é que a latência é REGISTRADA no caminho de
    // falha — não quanto tempo o `setTimeout` do dublê dormiu. Amarrar o piso
    // aos 30ms do timer mede o relógio, não a feature: `setTimeout(30)` e o
    // relógio da latência são fontes diferentes, e o CI já observou 29
    // (`expected 29 to be greater than or equal to 30`, run 33695343538),
    // avermelhando uma PR que não tocava em extração. `> 0` continua matando
    // o mutante que interessa: a linha `pendente_reprocessamento` gravada sem
    // latência nenhuma.
    expect(ex[0]!.latencia_ms).toBeGreaterThan(0);
    // não houve resposta: sem prompt/tokens — `null`, não zero
    expect(ex[0]!.prompt_versao).toBeNull();
    expect(ex[0]!.tokens_entrada).toBeNull();
  });

  test("clínica demo gera extrações sugeridas ao consolidar", async () => {
    await owner`UPDATE clinic SET is_demo = true WHERE id = ${CLINIC_A}`;
    const { consolidarSessao } = await import("./logic");
    await consolidarSessao(ctxT1, {
      sessionId: SESS,
      texto: "Pediu água. Falou 'á' sozinho. Não respondeu depois.",
    });
    const ex =
      await owner`SELECT estado, modelo, latencia_ms FROM extraction WHERE session_id = ${SESS}`;
    expect(ex.length).toBeGreaterThanOrEqual(1);
    expect(ex.every((e) => e.estado === "sugerida")).toBe(true);
    // DA-02: dado de demonstração nunca se confunde com modelo real
    expect(ex.every((e) => e.modelo === "stub")).toBe(true);
    expect(ex.every((e) => typeof e.latencia_ms === "number")).toBe(true);
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

  // ─── #392 — alerta de risco em RPD SUGERIDO (Fase F) ──────────────────────
  // Varredura determinística (#391, `detectarSinaisDeRiscoRPD`) sobre os
  // campos de texto livre do payload de uma extração `subtipo =
  // 'registro_pensamento'` recém-persistida, ANTES de qualquer aprovação
  // humana. Ancorado em `origem_extraction_id` (a sugestão ainda não tem
  // `tcc_rpd_entry`), nunca em `rpd_entry_id`.
  describe("RPD sugerido (#392)", () => {
    const limpar = async () => {
      await owner`DELETE FROM alerta_risco_clinico WHERE patient_id = ${PAC}`;
      await owner`DELETE FROM extraction WHERE session_id = ${SESS}`;
    };

    const alertasRPDSugerido = () =>
      owner`SELECT origem, categoria, severidade, certeza, origem_extraction_id, rpd_entry_id
              FROM alerta_risco_clinico
             WHERE patient_id = ${PAC} AND origem = 'registro_pensamento'`;

    const mockarProvider = async (drafts: unknown[]) => {
      const { resolveProvider } = await import("@/lib/extraction/provider");
      vi.mocked(resolveProvider).mockReturnValueOnce({
        extrair: async () => ({ drafts: drafts as never, alertaRisco: null }),
      });
    };

    test("registro_pensamento sem sinal de risco não cria alerta", async () => {
      await limpar();
      await mockarProvider([
        {
          subtipo: "registro_pensamento",
          trechoFonte: "Achei que ninguém ia me ouvir na reunião.",
          confianca: "media",
          inconsistenteComHistorico: false,
          parContrasteId: null,
          payload: {
            evidencias_favor: "Ninguém falou comigo na reunião inteira.",
            evidencias_contra: "Duas pessoas me chamaram depois para falar.",
            comportamento_resultante: "Ficou calado pelo resto da reunião.",
          },
          estado: "sugerida",
        },
      ]);
      const { consolidarSessao } = await import("./logic");
      const r = await consolidarSessao(ctxT1, {
        sessionId: SESS,
        texto: "RPD sugerido sem sinal de risco.",
      });
      expect(r.error).toBeUndefined();

      const alertas = await alertasRPDSugerido();
      expect(alertas.length).toBe(0);
    });

    test("registro_pensamento com ideação cria alerta ancorado na extração, sem rpd_entry_id", async () => {
      await limpar();
      await mockarProvider([
        {
          subtipo: "registro_pensamento",
          trechoFonte: "Às vezes penso em me matar quando fico assim.",
          confianca: "alta",
          inconsistenteComHistorico: false,
          parContrasteId: null,
          payload: {
            evidencias_favor: "Às vezes penso em me matar quando fico assim.",
            evidencias_contra: null,
            comportamento_resultante: "Ficou isolado no quarto.",
          },
          estado: "sugerida",
        },
      ]);
      const { consolidarSessao } = await import("./logic");
      const r = await consolidarSessao(ctxT1, {
        sessionId: SESS,
        texto: "RPD sugerido com ideação.",
      });
      expect(r.error).toBeUndefined();

      const ex =
        await owner`SELECT id FROM extraction WHERE session_id = ${SESS} AND subtipo = 'registro_pensamento'`;
      expect(ex.length).toBe(1);

      const alertas = await alertasRPDSugerido();
      expect(alertas.length).toBe(1);
      expect(alertas[0]!.categoria).toBe("ideacao_suicida");
      expect(alertas[0]!.certeza).toBe("ambiguo_citado");
      expect(alertas[0]!.origem_extraction_id).toBe(ex[0]!.id);
      expect(alertas[0]!.rpd_entry_id).toBeNull();
    });

    test("registro_pensamento com ideação apenas no trechoFonte (pensamento automático) cria alerta", async () => {
      await limpar();
      await mockarProvider([
        {
          subtipo: "registro_pensamento",
          trechoFonte: "Às vezes penso em me matar quando fico assim.",
          confianca: "alta",
          inconsistenteComHistorico: false,
          parContrasteId: null,
          payload: {
            evidencias_favor: "Nenhum amigo me respondeu hoje.",
            evidencias_contra: null,
            comportamento_resultante: "Ficou isolado no quarto.",
          },
          estado: "sugerida",
        },
      ]);
      const { consolidarSessao } = await import("./logic");
      const r = await consolidarSessao(ctxT1, {
        sessionId: SESS,
        texto: "RPD sugerido com ideação no trecho fonte.",
      });
      expect(r.error).toBeUndefined();

      const ex =
        await owner`SELECT id FROM extraction WHERE session_id = ${SESS} AND subtipo = 'registro_pensamento'`;
      expect(ex.length).toBe(1);

      const alertas = await alertasRPDSugerido();
      expect(alertas.length).toBe(1);
      expect(alertas[0]!.categoria).toBe("ideacao_suicida");
      expect(alertas[0]!.origem_extraction_id).toBe(ex[0]!.id);
      expect(alertas[0]!.rpd_entry_id).toBeNull();
    });
  });

  // ─── #72 T09 — enviarLoteAsr ───────────────────────────────────────────────
  describe("enviarLoteAsr (#72, T09)", () => {
    const clipe = (ordem: number, texto = "x") => ({
      ordem,
      dados: new TextEncoder().encode(texto),
      contentType: "audio/webm",
    });

    beforeAll(() => {
      process.env.FEATURE_FLAG_ASR_ENABLED = "true";
    });
    afterAll(async () => {
      delete process.env.FEATURE_FLAG_ASR_ENABLED;
      // `app_asr_reservar` (T02) varre `audio_capture` INTEIRA, sem predicado
      // de escopo: uma linha `na_fila` esquecida aqui entra na janela do LIMIT
      // do worker em OUTRO arquivo de teste e desloca a ordem que ele espera
      // (memória `int-test-vermelho-por-fixture-compartilhada`). A limpeza é
      // por `DELETE` escopado nesta sessão, nunca `TRUNCATE`.
      await limpar();
    });

    const limpar = () =>
      owner`DELETE FROM audio_capture WHERE session_id = ${SESS}`;

    test("cria N linhas com ordem preservada e sobe cada clipe", async () => {
      await limpar();
      guardarMock.mockClear();
      const loteId = "00000000-0000-0000-0000-0000000a0001";
      const r = await enviarLoteAsr(ctxT1, {
        sessionId: SESS,
        loteId,
        clipes: [clipe(0, "um"), clipe(1, "dois"), clipe(2, "tres")],
      });
      expect(r.error).toBeUndefined();
      expect(r.loteId).toBe(loteId);

      const rows =
        await owner`SELECT ordem, asr_status, objeto_ref FROM audio_capture
                     WHERE lote_id = ${loteId} ORDER BY ordem`;
      expect(rows.length).toBe(3);
      expect(rows.map((r) => r.ordem)).toEqual([0, 1, 2]);
      expect(rows.every((r) => r.asr_status === "na_fila")).toBe(true);
      expect(rows.every((r) => typeof r.objeto_ref === "string")).toBe(true);
      expect(guardarMock).toHaveBeenCalledTimes(3);
    });

    test("flag desligada recusa sem inserir nenhuma linha", async () => {
      await limpar();
      delete process.env.FEATURE_FLAG_ASR_ENABLED;
      guardarMock.mockClear();
      const loteId = "00000000-0000-0000-0000-0000000a0002";
      const r = await enviarLoteAsr(ctxT1, {
        sessionId: SESS,
        loteId,
        clipes: [clipe(0)],
      });
      expect(r.error).toBeTruthy();
      process.env.FEATURE_FLAG_ASR_ENABLED = "true";

      const rows =
        await owner`SELECT id FROM audio_capture WHERE lote_id = ${loteId}`;
      expect(rows.length).toBe(0);
      expect(guardarMock).not.toHaveBeenCalled();
    });

    // #506: `coordenador` deixou de ser papel errado aqui (é o papel do dono de
    // clínica solo). O papel que segue barrado é `admin_recepcao` —
    // administrativo, não atende paciente, não escreve no diário.
    test("papel errado (admin_recepcao) é barrado antes de qualquer escrita", async () => {
      await limpar();
      const ctxErrado = {
        clinicId: CLINIC_A,
        userId: U_T1,
        role: "admin_recepcao",
      } as const;
      const loteId = "00000000-0000-0000-0000-0000000a0003";
      await expect(
        enviarLoteAsr(ctxErrado, {
          sessionId: SESS,
          loteId,
          clipes: [clipe(0)],
        }),
      ).rejects.toThrow();

      const rows =
        await owner`SELECT id FROM audio_capture WHERE lote_id = ${loteId}`;
      expect(rows.length).toBe(0);
    });

    test("reenvio do MESMO loteId não duplica as linhas (retry de rede)", async () => {
      await limpar();
      guardarMock.mockClear();
      const loteId = "00000000-0000-0000-0000-0000000a0004";
      const r1 = await enviarLoteAsr(ctxT1, {
        sessionId: SESS,
        loteId,
        clipes: [clipe(0), clipe(1)],
      });
      expect(r1.error).toBeUndefined();
      expect(guardarMock).toHaveBeenCalledTimes(2);

      guardarMock.mockClear();
      const r2 = await enviarLoteAsr(ctxT1, {
        sessionId: SESS,
        loteId,
        clipes: [clipe(0), clipe(1)],
      });
      expect(r2.error).toBeUndefined();
      expect(r2.loteId).toBe(loteId);
      // idempotente: NÃO insere de novo nem re-sobe os blobs
      expect(guardarMock).not.toHaveBeenCalled();

      const rows =
        await owner`SELECT id FROM audio_capture WHERE lote_id = ${loteId}`;
      expect(rows.length).toBe(2);
    });

    // Review pós-PR (#72/T09): o teste sequencial acima (`await` entre as
    // duas chamadas) não prova nada sobre a janela de corrida — a segunda
    // chamada só começa depois que a primeira já commitou. Este teste
    // dispara as DUAS com `Promise.all` (sem `await` entre elas), então as
    // duas SELECT de idempotência rodam ANTES de qualquer uma inserir —
    // exatamente o cenário de duplo clique / duas abas que o `UNIQUE
    // (lote_id, ordem)` (migração 0137) existe para fechar.
    test("duas chamadas CONCORRENTES com o MESMO loteId não duplicam (UNIQUE backstop, R24)", async () => {
      await limpar();
      guardarMock.mockClear();
      const loteId = "00000000-0000-0000-0000-0000000a0005";
      const chamada = () =>
        enviarLoteAsr(ctxT1, {
          sessionId: SESS,
          loteId,
          clipes: [clipe(0), clipe(1)],
        });

      const [r1, r2] = await Promise.all([chamada(), chamada()]);
      expect(r1.error).toBeUndefined();
      expect(r2.error).toBeUndefined();
      expect(r1.loteId).toBe(loteId);
      expect(r2.loteId).toBe(loteId);

      const rows =
        await owner`SELECT ordem, asr_status::text AS asr_status, objeto_ref
                      FROM audio_capture WHERE lote_id = ${loteId} ORDER BY ordem`;
      // só 1 conjunto de N linhas — não 2N — mesmo com as duas chamadas
      // tendo passado pela checagem de idempotência ao mesmo tempo.
      expect(rows.length).toBe(2);
      expect(rows.map((r) => r.ordem)).toEqual([0, 1]);
      // e o lote termina INTEIRO na fila, com objeto: nenhuma linha ficou
      // presa em `nao_solicitado` nem foi carimbada `falhou` pelo perdedor.
      expect(rows.map((r) => r.asr_status)).toEqual(["na_fila", "na_fila"]);
      expect(rows.map((r) => r.objeto_ref)).toEqual([
        `${loteId}:0`,
        `${loteId}:1`,
      ]);

      // POR QUE A CONTAGEM DE UPLOADS NÃO É MAIS O ORÁCULO (#494/T20):
      // desde que o predicado de idempotência virou `loteJaResolvido` ("nenhuma
      // linha em `nao_solicitado`", para que um reenvio pós-queda RETOME o que
      // ficou pelo caminho), o perdedor que chega DEPOIS do commit do vencedor
      // e ANTES da promoção a `na_fila` lê o lote como "não resolvido" e re-sobe
      // os blobs. Não dá para distinguir "outra chamada está subindo agora" de
      // "a chamada anterior morreu no meio" sem serializar o laço de upload
      // dentro de uma transação — e o upload é de propósito FORA dela (não
      // segurar conexão do Postgres durante rede; mesmo princípio da Fase B de
      // `consolidarSessao`). Um `pg_advisory_xact_lock` no SELECT de
      // idempotência NÃO fecharia a janela: ele solta no commit do INSERT, com
      // o vencedor ainda uploadando.
      // O re-upload é INOFENSIVO e isso é medido, não presumido:
      //  - mesma chave: `chaveClipe` é pura (`loteId:ordem`) — asserção de
      //    `objeto_ref` acima e do conjunto de chaves abaixo;
      //  - escrita idempotente: `guardar` é um PutObject por chave (overwrite
      //    total, nunca merge parcial);
      //  - nenhum clipe terminal revertido: os UPDATEs de promoção e de
      //    `falhou` são CAS em `nao_solicitado` — coberto deterministicamente
      //    pelo teste "clipe promovido por outra chamada NÃO é revertido".
      // Sobrou o que de fato importa: nenhuma chave FORA do lote foi escrita.
      const chaves = guardarMock.mock.calls.map((c) => c[0]).sort();
      expect(new Set(chaves)).toEqual(new Set([`${loteId}:0`, `${loteId}:1`]));
      expect(guardarMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    // Guarda do CAS de estado (#494/T20). Sem `AND asr_status =
    // 'nao_solicitado'` nos UPDATEs, o upload atrasado de uma chamada
    // concorrente (ou de um retry) reverte para `na_fila` um clipe que o worker
    // já reservou/transcreveu — transcrição duplicada e sobrescrita da nota que
    // a terapeuta já tem na tela. Aqui a corrida é FORÇADA: o dublê de
    // `guardar` promove a linha a `transcrito` durante o upload, exatamente na
    // janela entre o `guardar` e o UPDATE.
    test("clipe promovido por outra chamada NÃO é revertido pela promoção atrasada (CAS)", async () => {
      await limpar();
      guardarMock.mockClear();
      const loteId = "00000000-0000-0000-0000-0000000a0009";
      guardarMock.mockImplementationOnce(async () => {
        await owner`UPDATE audio_capture
                       SET asr_status = 'transcrito', objeto_ref = ${`${loteId}:0`}
                     WHERE lote_id = ${loteId} AND ordem = 0`;
        return undefined;
      });

      const r = await enviarLoteAsr(ctxT1, {
        sessionId: SESS,
        loteId,
        clipes: [clipe(0)],
      });
      expect(r.error).toBeUndefined();

      const rows =
        await owner`SELECT asr_status::text AS asr_status FROM audio_capture
                      WHERE lote_id = ${loteId} AND ordem = 0`;
      expect(rows.length).toBe(1);
      expect(rows[0]!.asr_status).toBe("transcrito");
    });

    // O teste de `Promise.all` acima é timing-dependent: se a segunda chamada
    // só alcançar o SELECT de idempotência DEPOIS de a primeira ter commitado,
    // ela passa verde pelo caminho do SELECT sem nunca exercitar o `23505` —
    // foi assim que o catch lendo `.code` na RAIZ (e não via `codigoPg`, que
    // desembrulha o `DrizzleQueryError`) conviveu com CI verde e só quebrou
    // intermitente. Este teste força a colisão DETERMINISTICAMENTE: as linhas
    // do lote já existem em OUTRA sessão, então o SELECT (escopado por
    // `sessionId`) não as vê e o INSERT bate no `uq_audio_capture_lote_ordem`.
    test("colisão do UNIQUE (23505) é idempotente, não erro genérico (R24)", async () => {
      await limpar();
      guardarMock.mockClear();
      const loteId = "00000000-0000-0000-0000-0000000a0006";
      await owner`DELETE FROM audio_capture WHERE lote_id = ${loteId}`;
      await owner`INSERT INTO audio_capture (clinic_id, session_id, lote_id, ordem, asr_status) VALUES
        (${CLINIC_A}, ${SESS_COBERTURA}, ${loteId}, 0, 'nao_solicitado'),
        (${CLINIC_A}, ${SESS_COBERTURA}, ${loteId}, 1, 'nao_solicitado')`;

      const r = await enviarLoteAsr(ctxT1, {
        sessionId: SESS,
        loteId,
        clipes: [clipe(0), clipe(1)],
      });

      expect(r.error).toBeUndefined();
      expect(r.loteId).toBe(loteId);
      // quem perde a corrida NÃO re-sobe os blobs
      expect(guardarMock).not.toHaveBeenCalled();
      const rows =
        await owner`SELECT id FROM audio_capture WHERE lote_id = ${loteId}`;
      expect(rows.length).toBe(2);
      await owner`DELETE FROM audio_capture WHERE lote_id = ${loteId}`;
    });

    // ─── revisão final de integração #72 ────────────────────────────────────
    // O INSERT gravava `na_fila` + `objeto_ref` ANTES de o upload rodar, então
    // existia um instante em que `app_asr_reservar` (T02) podia eleger uma
    // linha cujo blob ainda não estava no bucket: `ler()` falhava, o clipe
    // voltava à fila com uma tentativa a menos, e o objeto que chegasse
    // depois já não tinha dono. Os dois testes abaixo medem esse instante.
    test("entre o INSERT e o upload confirmado a linha NÃO é reservável", async () => {
      await limpar();
      guardarMock.mockClear();
      const loteId = "00000000-0000-0000-0000-0000000a0006";

      // Fotografa o estado DENTRO do primeiro `guardar()` — antes de qualquer
      // promoção a `na_fila` ter acontecido para o lote.
      let reservadosDurante: ReadonlyArray<unknown> | null = null;
      let linhasDurante: Array<{
        asr_status: string;
        objeto_ref: string | null;
      }> = [];
      guardarMock.mockImplementationOnce(async () => {
        reservadosDurante = await owner`SELECT id FROM app_asr_reservar(10)`;
        linhasDurante = (await owner`
          SELECT asr_status::text AS asr_status, objeto_ref
            FROM audio_capture WHERE lote_id = ${loteId}`) as unknown as Array<{
          asr_status: string;
          objeto_ref: string | null;
        }>;
        return undefined;
      });

      const r = await enviarLoteAsr(ctxT1, {
        sessionId: SESS,
        loteId,
        clipes: [clipe(0, "um"), clipe(1, "dois")],
      });
      expect(r.error).toBeUndefined();

      // A fila não tinha NADA a entregar naquele instante — nem deste lote
      // nem de qualquer outro (o `beforeAll` limpa `audio_capture`).
      expect(reservadosDurante).toEqual([]);
      expect(linhasDurante.length).toBe(2);
      expect(
        linhasDurante.every((l) => l.asr_status === "nao_solicitado"),
      ).toBe(true);
      expect(linhasDurante.every((l) => l.objeto_ref === null)).toBe(true);

      // …e no fim, com os dois uploads confirmados, as duas estão na fila.
      const depois = await owner`
        SELECT ordem, asr_status::text AS asr_status, objeto_ref
          FROM audio_capture WHERE lote_id = ${loteId} ORDER BY ordem`;
      expect(depois.map((l) => l.asr_status)).toEqual(["na_fila", "na_fila"]);
      expect(depois.every((l) => typeof l.objeto_ref === "string")).toBe(true);
    });

    test("upload que falha no meio: aquela linha NÃO fica na_fila (e sem objeto_ref); as outras seguem", async () => {
      await limpar();
      guardarMock.mockClear();
      const loteId = "00000000-0000-0000-0000-0000000a0007";
      // Só o clipe de ordem 1 falha ao subir.
      guardarMock.mockImplementation(async (chave: string) => {
        if (chave.endsWith(":1")) throw new Error("MinIO fora do ar");
        return undefined;
      });

      const r = await enviarLoteAsr(ctxT1, {
        sessionId: SESS,
        loteId,
        clipes: [clipe(0, "um"), clipe(1, "dois"), clipe(2, "tres")],
      });
      guardarMock.mockImplementation(async () => undefined);
      // O lote inteiro não cai por causa de um clipe (R12).
      expect(r.error).toBeUndefined();
      expect(r.loteId).toBe(loteId);

      const rows = (await owner`
        SELECT ordem, asr_status::text AS asr_status, objeto_ref
          FROM audio_capture WHERE lote_id = ${loteId} ORDER BY ordem`) as unknown as Array<{
        ordem: number;
        asr_status: string;
        objeto_ref: string | null;
      }>;
      expect(rows.map((l) => l.asr_status)).toEqual([
        "na_fila",
        "falhou",
        "na_fila",
      ]);
      // O que falhou é TERMINAL e sem referência: o worker nunca vai reservá-lo
      // para depois não achar o objeto.
      expect(rows[1]!.objeto_ref).toBeNull();
      expect(typeof rows[0]!.objeto_ref).toBe("string");
      expect(typeof rows[2]!.objeto_ref).toBe("string");
    });

    // ─── #494 / T20 ─────────────────────────────────────────────────────────
    // A idempotência tratava "inserido" como "concluído": bastava existir UMA
    // linha com aquele `lote_id` para devolver `{ loteId }` sem subir nada.
    // O critério real é upload + promoção a `na_fila`.
    test("reenvio retoma o lote cujo INSERT commitou mas o upload não rodou (T20)", async () => {
      await limpar();
      guardarMock.mockClear();
      const loteId = "00000000-0000-0000-0000-0000000a0008";
      // Estado exato de uma queda de conexão logo depois do INSERT: linhas
      // commitadas, fora da fila, sem objeto.
      await owner`INSERT INTO audio_capture (clinic_id, session_id, lote_id, ordem, asr_status) VALUES
        (${CLINIC_A}, ${SESS}, ${loteId}, 0, 'nao_solicitado'),
        (${CLINIC_A}, ${SESS}, ${loteId}, 1, 'nao_solicitado')`;

      const r = await enviarLoteAsr(ctxT1, {
        sessionId: SESS,
        loteId,
        clipes: [clipe(0, "um"), clipe(1, "dois")],
      });
      expect(r.error).toBeUndefined();
      expect(r.loteId).toBe(loteId);
      expect(r.clipesComFalha).toBeUndefined();
      // Retomou: subiu os DOIS blobs que nunca tinham subido.
      expect(guardarMock).toHaveBeenCalledTimes(2);

      const rows = (await owner`
        SELECT ordem, asr_status::text AS asr_status, objeto_ref
          FROM audio_capture WHERE lote_id = ${loteId} ORDER BY ordem`) as unknown as Array<{
        ordem: number;
        asr_status: string;
        objeto_ref: string | null;
      }>;
      // Sem duplicar linha (o `UNIQUE(lote_id, ordem)` nem chega a ser tocado:
      // a retomada pula o INSERT) e agora reserváveis pelo worker.
      expect(rows.length).toBe(2);
      expect(rows.map((l) => l.asr_status)).toEqual(["na_fila", "na_fila"]);
      expect(rows.every((l) => typeof l.objeto_ref === "string")).toBe(true);
    });

    test("reenvio parcial sobe SÓ o clipe que ficou para trás (T20)", async () => {
      await limpar();
      guardarMock.mockClear();
      const loteId = "00000000-0000-0000-0000-0000000a0009";
      await owner`INSERT INTO audio_capture (clinic_id, session_id, lote_id, ordem, asr_status, objeto_ref) VALUES
        (${CLINIC_A}, ${SESS}, ${loteId}, 0, 'na_fila', ${`asr/${loteId}:0`}),
        (${CLINIC_A}, ${SESS}, ${loteId}, 1, 'transcrito', NULL),
        (${CLINIC_A}, ${SESS}, ${loteId}, 2, 'nao_solicitado', NULL)`;

      const r = await enviarLoteAsr(ctxT1, {
        sessionId: SESS,
        loteId,
        clipes: [clipe(0, "um"), clipe(1, "dois"), clipe(2, "tres")],
      });
      expect(r.error).toBeUndefined();
      expect(r.clipesComFalha).toBeUndefined();
      // Só a ordem 2. `transcrito` não pode ser ressuscitado por retry, e
      // `na_fila` já tem objeto no bucket.
      expect(guardarMock).toHaveBeenCalledTimes(1);
      expect(guardarMock.mock.calls[0]![0]).toContain(":2");

      const rows = (await owner`
        SELECT ordem, asr_status::text AS asr_status
          FROM audio_capture WHERE lote_id = ${loteId} ORDER BY ordem`) as unknown as Array<{
        ordem: number;
        asr_status: string;
      }>;
      expect(rows.map((l) => l.asr_status)).toEqual([
        "na_fila",
        "transcrito",
        "na_fila",
      ]);
    });

    // O menor achado do T20: falha de upload só ia para `console.error` e o
    // retorno era indistinguível do sucesso total.
    test("falha de upload é reportada como contagem no retorno, sem detalhe de driver (T20)", async () => {
      await limpar();
      guardarMock.mockClear();
      const loteId = "00000000-0000-0000-0000-0000000a000a";
      guardarMock.mockImplementation(async (chave: string) => {
        if (chave.endsWith(":1")) throw new Error("MinIO fora do ar");
        return undefined;
      });

      const r = await enviarLoteAsr(ctxT1, {
        sessionId: SESS,
        loteId,
        clipes: [clipe(0, "um"), clipe(1, "dois")],
      });
      guardarMock.mockImplementation(async () => undefined);

      // Aceito (R12: um clipe não derruba o lote), mas NÃO silencioso.
      expect(r.error).toBeUndefined();
      expect(r.loteId).toBe(loteId);
      expect(r.clipesComFalha).toBe(1);
    });

    test("reenvio sem o blob do clipe pendente devolve a contagem em vez de fingir sucesso (T20)", async () => {
      await limpar();
      guardarMock.mockClear();
      const loteId = "00000000-0000-0000-0000-0000000a000b";
      await owner`INSERT INTO audio_capture (clinic_id, session_id, lote_id, ordem, asr_status) VALUES
        (${CLINIC_A}, ${SESS}, ${loteId}, 0, 'nao_solicitado'),
        (${CLINIC_A}, ${SESS}, ${loteId}, 1, 'nao_solicitado')`;

      // O cliente reenviou o lote sem os dados da ordem 1.
      const r = await enviarLoteAsr(ctxT1, {
        sessionId: SESS,
        loteId,
        clipes: [clipe(0, "um")],
      });
      expect(r.error).toBeUndefined();
      expect(guardarMock).toHaveBeenCalledTimes(1);
      expect(r.clipesComFalha).toBe(1);
    });
  });

  // ─── #72 T10 — obterEstadoLote / obterLoteMaisRecente ──────────────────────
  describe("obterEstadoLote / obterLoteMaisRecente (#72, T10)", () => {
    const CLINIC_B = "00000000-0000-0000-0000-0000000000b1";
    const U_B1 = "00000000-0000-0000-0000-0000000b1ba1";
    const PAC_B = "00000000-0000-0000-0000-00000000bac1";
    const SESS_B = "00000000-0000-0000-0000-00000005e3a1";
    const ctxB = {
      clinicId: CLINIC_B,
      userId: U_B1,
      role: "terapeuta",
    } as const;

    beforeAll(async () => {
      await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_B}, 'B')`;
      await owner`INSERT INTO app_user (id, email, name) VALUES (${U_B1}, 'b1@x.com', 'B1')`;
      await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_B1}, ${CLINIC_B}, 'terapeuta')`;
      await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC_B}, ${CLINIC_B}, 'PB')`;
      await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina)
        VALUES (${SESS_B}, ${CLINIC_B}, ${PAC_B}, ${U_B1}, now(), 'realizada', 'aba')`;
    });
    afterAll(async () => {
      await owner`DELETE FROM audio_capture WHERE session_id = ${SESS_B}`;
      await owner`DELETE FROM session WHERE id = ${SESS_B}`;
      await owner`DELETE FROM patient WHERE id = ${PAC_B}`;
      await owner`DELETE FROM user_role WHERE user_id = ${U_B1}`;
      await owner`DELETE FROM app_user WHERE id = ${U_B1}`;
      await owner`DELETE FROM clinic WHERE id = ${CLINIC_B}`;
    });

    const limpar = () =>
      owner`DELETE FROM audio_capture WHERE session_id IN (${SESS}, ${SESS_B})`;

    test("lote de outro tenant não é legível: obterEstadoLote devolve vazio", async () => {
      await limpar();
      const loteId = "00000000-0000-0000-0000-0000000b0001";
      await owner`INSERT INTO audio_capture (session_id, clinic_id, lote_id, ordem, asr_status)
        VALUES (${SESS_B}, ${CLINIC_B}, ${loteId}, 0, 'na_fila')`;

      const { obterEstadoLote } = await import("./logic");
      const clipes = await obterEstadoLote(ctxT1, loteId);
      expect(clipes).toEqual([]);
    });

    test("lote de outro tenant não é legível: obterLoteMaisRecente ignora sessão de outra clínica", async () => {
      await limpar();
      const loteId = "00000000-0000-0000-0000-0000000b0002";
      await owner`INSERT INTO audio_capture (session_id, clinic_id, lote_id, ordem, asr_status)
        VALUES (${SESS_B}, ${CLINIC_B}, ${loteId}, 0, 'na_fila')`;

      const { obterLoteMaisRecente } = await import("./logic");
      // ctxT1 (clínica A) nem enxerga SESS_B (session_id de outra clínica) via
      // RLS — o resultado é nulo, não um erro que distinguisse os dois casos.
      const encontrado = await obterLoteMaisRecente(ctxT1, SESS_B);
      expect(encontrado).toBeNull();

      // Já pelo tenant dono, o lote aparece normalmente.
      const proprio = await obterLoteMaisRecente(ctxB, SESS_B);
      expect(proprio).toBe(loteId);
    });

    test("lote parcial devolve os transcritos e marca os pendentes", async () => {
      await limpar();
      const loteId = "00000000-0000-0000-0000-0000000a0010";
      await owner`INSERT INTO audio_capture (session_id, clinic_id, lote_id, ordem, asr_status, transcricao_texto, transcrito_em)
        VALUES
          (${SESS}, ${CLINIC_A}, ${loteId}, 0, 'transcrito', 'primeiro trecho', now()),
          (${SESS}, ${CLINIC_A}, ${loteId}, 1, 'na_fila', NULL, NULL),
          (${SESS}, ${CLINIC_A}, ${loteId}, 2, 'falhou', NULL, NULL)`;

      const { obterEstadoLote } = await import("./logic");
      const clipes = await obterEstadoLote(ctxT1, loteId);
      expect(clipes).toEqual([
        {
          ordem: 0,
          asrStatus: "transcrito",
          transcricaoTexto: "primeiro trecho",
        },
        { ordem: 1, asrStatus: "na_fila", transcricaoTexto: null },
        { ordem: 2, asrStatus: "falhou", transcricaoTexto: null },
      ]);
    });

    test("obterLoteMaisRecente após reload devolve o lote em na_fila corretamente", async () => {
      await limpar();
      const loteAntigo = "00000000-0000-0000-0000-0000000a0011";
      const loteRecente = "00000000-0000-0000-0000-0000000a0012";
      await owner`INSERT INTO audio_capture (session_id, clinic_id, lote_id, ordem, asr_status, criado_em)
        VALUES (${SESS}, ${CLINIC_A}, ${loteAntigo}, 0, 'transcrito', now() - interval '1 hour')`;
      await owner`INSERT INTO audio_capture (session_id, clinic_id, lote_id, ordem, asr_status, criado_em)
        VALUES (${SESS}, ${CLINIC_A}, ${loteRecente}, 0, 'na_fila', now())`;

      const { obterLoteMaisRecente } = await import("./logic");
      const encontrado = await obterLoteMaisRecente(ctxT1, SESS);
      expect(encontrado).toBe(loteRecente);
    });

    test("obterLoteMaisRecente devolve nulo quando não há lote na sessão", async () => {
      await limpar();
      const { obterLoteMaisRecente } = await import("./logic");
      const encontrado = await obterLoteMaisRecente(ctxT1, SESS);
      expect(encontrado).toBeNull();
    });
  });

  // ─── #72 T25 / cenário 9 — a transcrição é efêmera (R19, decisão C) ────────
  //
  // Metade 1 das duas exigidas pelo cenário 9: aceitar o texto no rascunho
  // APAGA `transcricao_texto` do servidor. A metade 2 (a linha de
  // `audio_capture` sai junto no expurgo por paciente da 0128) vive em
  // `db/tests/asr-transcricao-efemera-expurgo.int.test.ts`, porque exige
  // `app_purgar_paciente` e um paciente elegível — arranjo que já tem
  // convenção própria em `db/tests/fase6-expurgo-paciente.int.test.ts`.
  //
  // Por que isso importa: `audio_capture` está em `TABELAS_NEGADAS` do
  // coletor do acervo (`src/lib/export/acervo/coletor.ts`), então a
  // transcrição nunca entrou no ZIP de portabilidade. Ou ela morre na
  // aceitação (a `session_note` passa a ser o único registro, e essa SIM é
  // exportável), ou fica texto clínico não-portável parado no banco.
  describe("aceitarTranscricaoLote (#72, T25 · cenário 9)", () => {
    const limpar = () =>
      owner`DELETE FROM audio_capture WHERE session_id = ${SESS}`;

    afterAll(async () => {
      await limpar();
    });

    const semearLote = async (loteId: string, textos: string[]) => {
      await limpar();
      for (const [i, texto] of textos.entries()) {
        await owner`INSERT INTO audio_capture
          (session_id, clinic_id, lote_id, ordem, asr_status, transcricao_texto, transcrito_em)
          VALUES (${SESS}, ${CLINIC_A}, ${loteId}, ${i}, 'transcrito', ${texto}, now())`;
      }
    };

    const textosNoBanco = (loteId: string) =>
      owner`SELECT ordem, transcricao_texto FROM audio_capture
             WHERE lote_id = ${loteId} ORDER BY ordem` as unknown as Promise<
        Array<{ ordem: number; transcricao_texto: string | null }>
      >;

    test("aceitar devolve os parágrafos NA ORDEM e zera transcricao_texto de TODAS as linhas do lote", async () => {
      const loteId = "00000000-0000-0000-0000-0000000c0001";
      await semearLote(loteId, ["primeiro", "segundo", "terceiro"]);

      const { aceitarTranscricaoLote } = await import("./logic");
      const r = await aceitarTranscricaoLote(ctxT1, loteId);
      expect(r.error).toBeUndefined();
      expect(r.paragrafos).toEqual(["primeiro", "segundo", "terceiro"]);

      // O cheque que a mutação tem que derrubar: o texto NÃO sobrevive à
      // aceitação. As linhas continuam existindo (o áudio/objeto e a trilha
      // de estado seguem), mas sem o texto clínico.
      const depois = await textosNoBanco(loteId);
      expect(depois.length).toBe(3);
      expect(depois.map((l) => l.transcricao_texto)).toEqual([
        null,
        null,
        null,
      ]);
    });

    test("aceitar duas vezes não duplica nem quebra — a 2ª volta vazia", async () => {
      const loteId = "00000000-0000-0000-0000-0000000c0002";
      await semearLote(loteId, ["um", "dois"]);

      const { aceitarTranscricaoLote } = await import("./logic");
      const r1 = await aceitarTranscricaoLote(ctxT1, loteId);
      expect(r1.paragrafos).toEqual(["um", "dois"]);

      // Duplo clique / reload: não há mais nada a entregar, e isso não é erro.
      const r2 = await aceitarTranscricaoLote(ctxT1, loteId);
      expect(r2.error).toBeUndefined();
      expect(r2.paragrafos).toEqual([]);

      const depois = await textosNoBanco(loteId);
      expect(depois.length).toBe(2);
      expect(depois.every((l) => l.transcricao_texto === null)).toBe(true);
    });

    test("lote de outro tenant: nada é devolvido e o texto do dono continua intacto", async () => {
      const loteId = "00000000-0000-0000-0000-0000000c0003";
      await semearLote(loteId, ["texto do dono"]);

      const ctxOutraClinica = {
        clinicId: "00000000-0000-0000-0000-0000000000ff",
        userId: U_T1,
        role: "terapeuta",
      } as const;
      const { aceitarTranscricaoLote } = await import("./logic");
      const r = await aceitarTranscricaoLote(ctxOutraClinica, loteId);
      expect(r.paragrafos ?? []).toEqual([]);

      // Ler e apagar no MESMO statement: se a RLS barra a escrita, também não
      // pode devolver o texto — devolver aqui entregaria uma transcrição que
      // continua no banco.
      const depois = await textosNoBanco(loteId);
      expect(depois.map((l) => l.transcricao_texto)).toEqual(["texto do dono"]);
    });

    // O caso que o JOIN com `upd` existe para fechar, e o único em que ler e
    // escrever divergem de verdade: `audio_select` é visível para a CLÍNICA
    // (0085/0123), enquanto `audio_update` exige ser o terapeuta DA SESSÃO
    // (0053). Um colega enxerga a transcrição mas não consegue apagá-la — se
    // o SELECT final lesse `antes` sem o JOIN, ele receberia o texto de volta
    // enquanto o texto continua no banco. Devolver aqui é entregar uma
    // transcrição que não morreu.
    test("colega que LÊ mas não pode ESCREVER não recebe o texto (e nada é apagado)", async () => {
      const loteId = "00000000-0000-0000-0000-0000000c0005";
      await owner`DELETE FROM audio_capture WHERE session_id = ${SESS_COBERTURA}`;
      await owner`INSERT INTO audio_capture
        (session_id, clinic_id, lote_id, ordem, asr_status, transcricao_texto, transcrito_em)
        VALUES (${SESS_COBERTURA}, ${CLINIC_A}, ${loteId}, 0, 'transcrito', 'texto do colega', now())`;

      const { aceitarTranscricaoLote } = await import("./logic");
      // ctxT1 é terapeuta da mesma clínica, mas SESS_COBERTURA é de
      // U_COBERTURA — a leitura passa, a escrita não.
      const r = await aceitarTranscricaoLote(ctxT1, loteId);
      expect(r.paragrafos ?? []).toEqual([]);

      const depois = await textosNoBanco(loteId);
      expect(depois.map((l) => l.transcricao_texto)).toEqual([
        "texto do colega",
      ]);

      // O dono da sessão, esse sim, aceita e apaga.
      const rDono = await aceitarTranscricaoLote(ctxCobertura, loteId);
      expect(rDono.paragrafos).toEqual(["texto do colega"]);
      const final = await textosNoBanco(loteId);
      expect(final.map((l) => l.transcricao_texto)).toEqual([null]);
      await owner`DELETE FROM audio_capture WHERE session_id = ${SESS_COBERTURA}`;
    });

    test("loteId inválido é recusado sem tocar o banco", async () => {
      const loteId = "00000000-0000-0000-0000-0000000c0004";
      await semearLote(loteId, ["intocado"]);

      const { aceitarTranscricaoLote } = await import("./logic");
      const r = await aceitarTranscricaoLote(ctxT1, "nao-e-uuid");
      expect(r.error).toBeTruthy();
      expect(r.paragrafos).toBeUndefined();

      const depois = await textosNoBanco(loteId);
      expect(depois.map((l) => l.transcricao_texto)).toEqual(["intocado"]);
    });
  });
});
