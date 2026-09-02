/**
 * #539 (auditoria 360, PR-05 · decisão D-AUD-7) — régua ÚNICA de "profissional
 * responsável pela sessão": `terapeuta_id` OU `atendido_por_id` (substituto
 * designado na agenda).
 *
 * Antes da `0143` havia três réguas: a RLS de `session_note`/`audio_capture`/
 * `extraction`/`session_protocol_scope` só aceitava `app_session_terapeuta_id`,
 * `ehDono` e `fila.ts` só olhavam `terapeuta_id`, e `app_desarquivar_paciente`
 * aceitava os dois. A agenda deixava designar um substituto que, na hora de
 * documentar, batia em "nova linha viola a policy".
 *
 * O que este arquivo prova (harness igual ao de `sessao-fila.int.test.ts`):
 *   - RLS: o substituto escreve `session_note` e `audio_capture` na sessão em
 *     que foi designado; lê a própria sessão (`session_select`) e a própria
 *     nota (`session_note_select`) SEM estar na equipe de cuidado. A titular
 *     continua escrevendo. Terapeuta alheio (nem titular nem substituto) não
 *     escreve nem lê — inclusive o substituto numa sessão onde não foi
 *     designado.
 *   - `capturarDiario` e `consolidarSessao` funcionam no contexto do
 *     substituto, com `autor_id` = substituto e `numero_sequencial_paciente`
 *     populado via `app_session_definir_numero_sequencial` (DEFINER com guard
 *     da mesma régua — `session_update` NÃO foi estendida ao substituto).
 *   - Fila (`lib/sessao/fila.ts`): a sessão travada aparece para a titular E
 *     para o substituto (`minha = true` nos dois), nunca para terapeuta alheio.
 *   - `ehDono` em `/sessoes/[id]` e `/revisao/[sessionId]` é verdadeiro para os
 *     dois; coordenador que não atendeu vê (`podeVer`) mas não é dono.
 */
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CLINIC = "00000000-0000-0000-0000-0000000000e5";
const U_COORD = "00000000-0000-0000-0000-00000000c0e5";
const U_TITULAR = "00000000-0000-0000-0000-0000000071e5";
const U_SUB = "00000000-0000-0000-0000-0000000072e5";
const U_OUTRO = "00000000-0000-0000-0000-0000000073e5";
const PAC = "00000000-0000-0000-0000-00000000ace5";

// Titular = U_TITULAR nas três. Substituto (`atendido_por_id`) = U_SUB nas duas
// primeiras; a terceira não tem substituto — é o controle negativo de U_SUB.
const S_SUB_RLS = "00000000-0000-0000-0000-00000005e1e5";
const S_SUB_LOGIC = "00000000-0000-0000-0000-00000005e2e5";
const S_SEM_SUB = "00000000-0000-0000-0000-00000005e3e5";

const ctxTitular = {
  clinicId: CLINIC,
  userId: U_TITULAR,
  role: "terapeuta",
} as const;
const ctxSub = { clinicId: CLINIC, userId: U_SUB, role: "terapeuta" } as const;
const ctxOutro = {
  clinicId: CLINIC,
  userId: U_OUTRO,
  role: "terapeuta",
} as const;
const ctxCoord = {
  clinicId: CLINIC,
  userId: U_COORD,
  role: "coordenador",
} as const;

// Hora fixa (R-04): as sessões têm 48h para cair em `sem_nota_apos_24h`.
const AGORA = new Date("2026-09-02T12:00:00.000Z");
const H48_ATRAS = new Date(AGORA.getTime() - 48 * 3600_000);

let owner: ReturnType<typeof postgres>;
let appSql: typeof import("@/db/client").sql;
let withTenant: typeof import("@/db/rls").withTenant;
let schema: typeof import("@/db/schema");
let fila: typeof import("@/lib/sessao/fila");
let sessaoQueries: typeof import("../../src/app/(app)/sessoes/[id]/queries");
let revisaoQueries: typeof import("../../src/app/(app)/revisao/[sessionId]/queries");
let diarioLogic: typeof import("../../src/app/(app)/diario/[sessionId]/logic");

describe.skipIf(!hasDb)("#539 · profissional responsável pela sessão", () => {
  beforeAll(async () => {
    ({ withTenant } = await import("@/db/rls"));
    ({ sql: appSql } = await import("@/db/client"));
    schema = await import("@/db/schema");
    fila = await import("@/lib/sessao/fila");
    sessaoQueries = await import("../../src/app/(app)/sessoes/[id]/queries");
    revisaoQueries =
      await import("../../src/app/(app)/revisao/[sessionId]/queries");
    diarioLogic = await import("../../src/app/(app)/diario/[sessionId]/logic");
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
      session, session_note, audio_capture, extraction RESTART IDENTITY CASCADE`;

    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES (${CLINIC}, 'Clínica substituto', false)`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD}, 'Coord', 'coord.sub539@t.com'),
      (${U_TITULAR}, 'Titular', 'titular.sub539@t.com'),
      (${U_SUB}, 'Substituto', 'substituto.sub539@t.com'),
      (${U_OUTRO}, 'Outro terapeuta', 'outro.sub539@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC}, 'coordenador'),
      (${U_TITULAR}, ${CLINIC}, 'terapeuta'),
      (${U_SUB}, ${CLINIC}, 'terapeuta'),
      (${U_OUTRO}, ${CLINIC}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC}, 'Paciente substituído')`;
    // Só a titular está na equipe de cuidado: o substituto NÃO está — é o
    // cenário real ("terapeuta faltou, outro cobre") e o que fazia
    // `session_select` devolver 0 linhas para ele antes da 0143.
    await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe) VALUES
      (${PAC}, ${U_TITULAR}, 'ABA', 'terapeuta_referencia')`;

    await owner`INSERT INTO session
        (id, clinic_id, patient_id, terapeuta_id, atendido_por_id, agendada_para, estado, disciplina) VALUES
      (${S_SUB_RLS},   ${CLINIC}, ${PAC}, ${U_TITULAR}, ${U_SUB}, ${H48_ATRAS}, 'realizada', 'aba'),
      (${S_SUB_LOGIC}, ${CLINIC}, ${PAC}, ${U_TITULAR}, ${U_SUB}, ${H48_ATRAS}, 'realizada', 'aba'),
      (${S_SEM_SUB},   ${CLINIC}, ${PAC}, ${U_TITULAR}, NULL,     ${H48_ATRAS}, 'realizada', 'aba')`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  // ─── 1. RLS crua ──────────────────────────────────────────────────────────

  test("substituto lê a própria sessão sem estar na equipe de cuidado (session_select)", async () => {
    const vistas = await withTenant(ctxSub, (tx) =>
      tx.select({ id: schema.session.id }).from(schema.session),
    );
    expect(new Set(vistas.map((s) => s.id))).toEqual(
      new Set([S_SUB_RLS, S_SUB_LOGIC]),
    );
  });

  test("substituto escreve session_note na sessão em que foi designado (session_note_insert)", async () => {
    const [nota] = await withTenant(ctxSub, (tx) =>
      tx
        .insert(schema.sessionNote)
        .values({
          sessionId: S_SUB_RLS,
          clinicId: CLINIC,
          tipo: "captura_rapida",
          texto: "Cobertura: pediu água apontando",
          autorId: U_SUB,
        })
        .returning({ id: schema.sessionNote.id }),
    );
    expect(nota?.id).toBeTruthy();

    // ...e lê a nota que acabou de escrever (session_note_select passa por
    // app_session_clinica_visivel, que também entrou na régua).
    const lidas = await withTenant(ctxSub, (tx) =>
      tx
        .select({ id: schema.sessionNote.id })
        .from(schema.sessionNote)
        .where(eq(schema.sessionNote.sessionId, S_SUB_RLS)),
    );
    expect(lidas.map((n) => n.id)).toEqual([nota!.id]);
  });

  test("substituto escreve audio_capture na sessão em que foi designado (audio_insert)", async () => {
    await withTenant(ctxSub, (tx) =>
      tx.insert(schema.audioCapture).values({
        sessionId: S_SUB_RLS,
        clinicId: CLINIC,
        statusUpload: "rascunho_local",
      }),
    );
    const lidas = await withTenant(ctxSub, (tx) =>
      tx.select({ id: schema.audioCapture.id }).from(schema.audioCapture),
    );
    expect(lidas.length).toBe(1);
  });

  test("titular continua escrevendo na sessão que tem substituto", async () => {
    const [nota] = await withTenant(ctxTitular, (tx) =>
      tx
        .insert(schema.sessionNote)
        .values({
          sessionId: S_SUB_RLS,
          clinicId: CLINIC,
          tipo: "nota_consolidada",
          texto: "Nota da titular",
          autorId: U_TITULAR,
        })
        .returning({ id: schema.sessionNote.id }),
    );
    expect(nota?.id).toBeTruthy();
  });

  test("terapeuta alheio (nem titular nem substituto) NÃO escreve nem lê", async () => {
    await expect(
      withTenant(ctxOutro, (tx) =>
        tx.insert(schema.sessionNote).values({
          sessionId: S_SUB_LOGIC,
          clinicId: CLINIC,
          tipo: "captura_rapida",
          texto: "tentativa indevida",
          autorId: U_OUTRO,
        }),
      ),
    ).rejects.toThrow();
    const sessoes = await withTenant(ctxOutro, (tx) =>
      tx.select({ id: schema.session.id }).from(schema.session),
    );
    expect(sessoes).toEqual([]);
    const notas = await withTenant(ctxOutro, (tx) =>
      tx.select({ id: schema.sessionNote.id }).from(schema.sessionNote),
    );
    expect(notas).toEqual([]);
  });

  test("substituto NÃO escreve na sessão onde não foi designado (controle negativo)", async () => {
    await expect(
      withTenant(ctxSub, (tx) =>
        tx.insert(schema.sessionNote).values({
          sessionId: S_SEM_SUB,
          clinicId: CLINIC,
          tipo: "captura_rapida",
          texto: "não sou o responsável aqui",
          autorId: U_SUB,
        }),
      ),
    ).rejects.toThrow();
  });

  // ─── 2. Fila de sessões travadas ──────────────────────────────────────────
  // As três sessões têm 48h e nenhuma `nota_consolidada` em S_SUB_LOGIC /
  // S_SEM_SUB → `sem_nota_apos_24h`. (S_SUB_RLS ganhou nota da titular acima e
  // saiu da fila — de propósito: prova que o predicado é o mesmo da máquina de
  // estados, não "toda sessão com substituto".)

  test("fila: substituto vê a sessão em que foi designado, marcada como sua (R-14)", async () => {
    const { itens, total } = await fila.listarTravadas(ctxSub, {
      agora: AGORA,
    });
    expect(total).toBe(1);
    expect(itens.map((i) => i.sessionId)).toEqual([S_SUB_LOGIC]);
    expect(itens[0]?.minha).toBe(true);
    expect(itens[0]?.motivo).toBe("sem_nota_apos_24h");
    // contagem e lista saem do mesmo predicado (R-12)
    const { total: badge } = await fila.contarTravadas(ctxSub, {
      agora: AGORA,
    });
    expect(badge).toBe(1);
  });

  test("fila: titular continua vendo as próprias sessões, com ou sem substituto", async () => {
    const { itens } = await fila.listarTravadas(ctxTitular, { agora: AGORA });
    expect(new Set(itens.map((i) => i.sessionId))).toEqual(
      new Set([S_SUB_LOGIC, S_SEM_SUB]),
    );
    expect(itens.every((i) => i.minha)).toBe(true);
  });

  test("fila: terapeuta alheio não vê nada", async () => {
    const { itens, total } = await fila.listarTravadas(ctxOutro, {
      agora: AGORA,
    });
    expect(total).toBe(0);
    expect(itens).toEqual([]);
  });

  // ─── 3. ehDono nas duas telas ─────────────────────────────────────────────

  test("/sessoes/[id]: substituto é dono (ehDono) e vê; titular também; coordenador vê mas não é dono", async () => {
    const sub = await sessaoQueries.carregarSessao(ctxSub, S_SUB_LOGIC, AGORA);
    expect(sub?.ehDono).toBe(true);
    expect(sub?.podeVer).toBe(true);

    const titular = await sessaoQueries.carregarSessao(
      ctxTitular,
      S_SUB_LOGIC,
      AGORA,
    );
    expect(titular?.ehDono).toBe(true);

    const coord = await sessaoQueries.carregarSessao(
      ctxCoord,
      S_SUB_LOGIC,
      AGORA,
    );
    expect(coord?.podeVer).toBe(true);
    expect(coord?.ehDono).toBe(false);

    // Terapeuta alheio: a RLS esconde a sessão → null (a página dá notFound).
    const outro = await sessaoQueries.carregarSessao(
      ctxOutro,
      S_SUB_LOGIC,
      AGORA,
    );
    expect(outro).toBeNull();
  });

  test("/revisao/[sessionId]: substituto é dono (ehDono)", async () => {
    const sub = await revisaoQueries.carregarRevisao(ctxSub, S_SUB_LOGIC);
    expect(sub?.ehDono).toBe(true);
    const titular = await revisaoQueries.carregarRevisao(
      ctxTitular,
      S_SUB_LOGIC,
    );
    expect(titular?.ehDono).toBe(true);
    const coord = await revisaoQueries.carregarRevisao(ctxCoord, S_SUB_LOGIC);
    expect(coord?.ehDono).toBe(false);
  });

  // ─── 4. Ações do diário no contexto do substituto ─────────────────────────

  test("substituto grava captura rápida (capturarDiario) com autor_id = ele", async () => {
    const r = await diarioLogic.capturarDiario(ctxSub, {
      sessionId: S_SUB_LOGIC,
      texto: "Cobertura: sessão de hoje",
    });
    expect(r.error).toBeUndefined();
    expect(r.id).toBeTruthy();
    const rows =
      await owner`SELECT texto, autor_id FROM session_note WHERE session_id = ${S_SUB_LOGIC} AND tipo = 'captura_rapida'`;
    expect(rows.length).toBe(1);
    expect(rows[0]!.autor_id).toBe(U_SUB);

    // A tela do substituto reflete a captura (session_note_select).
    const dados = await sessaoQueries.carregarSessao(
      ctxSub,
      S_SUB_LOGIC,
      AGORA,
    );
    expect(dados?.temCaptura).toBe(true);
  });

  test("substituto consolida a sessão (consolidarSessao): nota, número sequencial e extração", async () => {
    const r = await diarioLogic.consolidarSessao(ctxSub, {
      sessionId: S_SUB_LOGIC,
      texto: "Nota consolidada pelo substituto.",
    });
    expect(r.error).toBeUndefined();
    expect(r.numeroSequencial).toBe(1);

    const nota =
      await owner`SELECT autor_id FROM session_note WHERE session_id = ${S_SUB_LOGIC} AND tipo = 'nota_consolidada'`;
    expect(nota[0]!.autor_id).toBe(U_SUB);
    // O número veio por `app_session_definir_numero_sequencial` (DEFINER):
    // sob `session_update` o UPDATE do substituto afetava 0 linhas em silêncio.
    const sess =
      await owner`SELECT numero_sequencial_paciente FROM session WHERE id = ${S_SUB_LOGIC}`;
    expect(sess[0]!.numero_sequencial_paciente).toBe(1);
    // `extraction_insert` idem (clínica de produção, sem LLM → pendente).
    const ex =
      await owner`SELECT estado FROM extraction WHERE session_id = ${S_SUB_LOGIC}`;
    expect(ex.length).toBeGreaterThan(0);
    expect(ex.every((e) => e.estado === "pendente_reprocessamento")).toBe(true);
    // A fila do substituto segue a MESMA máquina de estados: consolidada, a
    // sessão troca de motivo (`sem_nota_apos_24h` → `extracao_travada`, porque
    // sem LLM a extração fica `pendente_reprocessamento`) em vez de sumir.
    const { itens } = await fila.listarTravadas(ctxSub, { agora: AGORA });
    expect(itens.map((i) => i.sessionId)).toEqual([S_SUB_LOGIC]);
    expect(itens[0]?.motivo).toBe("extracao_travada");
    expect(itens[0]?.minha).toBe(true);
  });

  test("terapeuta alheio continua barrado em capturarDiario", async () => {
    const r = await diarioLogic.capturarDiario(ctxOutro, {
      sessionId: S_SUB_LOGIC,
      texto: "indevido",
    });
    expect(r.error).toBeTruthy();
    const rows =
      await owner`SELECT 1 FROM session_note WHERE session_id = ${S_SUB_LOGIC} AND texto = 'indevido'`;
    expect(rows.length).toBe(0);
  });
});
