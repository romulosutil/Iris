/**
 * #407 T04 — teste VERMELHO do definer `app_validar_anamnese`, escrito ANTES
 * da função existir (T05). Hoje (0115_anamnese_marco_zero.sql) a migração só
 * tem tabela + RLS de `anamnese`/`anamnese_alvo` (T02/T03) — a função em si
 * não existe. Toda chamada abaixo deve estourar `function
 * app_validar_anamnese(uuid, jsonb, jsonb) does not exist` (SQLSTATE 42883),
 * não a mensagem de negócio que o design.md especifica. As asserções abaixo
 * já são as do comportamento FINAL (design.md §Components,
 * `app_validar_anamnese`): rodando contra o schema vermelho, elas falham —
 * ou por 42883 direto (`.resolves`, `.rejects.toThrow(/mensagem/)` sem match),
 * ou por não observar o efeito esperado (snapshot 0 não criado). Isso é o
 * gate desta task: 1 arquivo, 8 testes, todos vermelhos por "function does
 * not exist" — ver task-04-brief.md.
 *
 * Setup segue o harness de `db/tests/fase4-snapshot-rls.int.test.ts` (fixtures
 * pelo owner via MIGRATION_DATABASE_URL, asserts via `withTenant`/app_role) e
 * `db/tests/consent-revogacao-gate.int.test.ts` (padrão de revogação:
 * `consent` é append-only, revogação é linha nova com `consent_revogado_id`).
 *
 * Cada caso usa um paciente PRÓPRIO — a suíte não depende de ordem, e um
 * "nenhum snapshot criado" não é mascarado por um caso anterior que já
 * gravou `session_numero = 0` para o mesmo paciente.
 */
import { sql as sqlTag } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-000000004a01";
const CLINIC_B = "00000000-0000-0000-0000-000000004b01";

const U_COORD_A = "00000000-0000-0000-0000-000000004ac1";
const U_TER_A = "00000000-0000-0000-0000-000000004a71";
const U_COORD_B = "00000000-0000-0000-0000-000000004bc1";

// Um paciente por caso — evita acoplamento de ordem entre testes.
const PAC_VALIDAR = "00000000-0000-0000-0000-0000000040a1";
const PAC_TERAPEUTA = "00000000-0000-0000-0000-0000000040a2";
const PAC_OUTRA_CLINICA = "00000000-0000-0000-0000-0000000040b1";
const PAC_REVOGADO = "00000000-0000-0000-0000-0000000040a3";
const PAC_DUPLA = "00000000-0000-0000-0000-0000000040a4";
const PAC_COMPLEMENTAR_NOVO = "00000000-0000-0000-0000-0000000040a5";
const PAC_COMPLEMENTAR_EXISTENTE = "00000000-0000-0000-0000-0000000040a6";
const PAC_SEM_PROTOCOLO = "00000000-0000-0000-0000-0000000040a7";

const PROTOCOL_FAMILIA = "aba_marcos_desenvolvimento";

const ctxCoordA = {
  clinicId: CLINIC_A,
  userId: U_COORD_A,
  role: "coordenador",
} as const;
const ctxTerA = {
  clinicId: CLINIC_A,
  userId: U_TER_A,
  role: "terapeuta",
} as const;

let owner: ReturnType<typeof postgres>;
let withTenant: typeof import("@/db/rls").withTenant;
let appSql: typeof import("@/db/client").sql;

let PROTOCOL_ID: string;

async function ativarProtocolo(patientId: string) {
  await owner`INSERT INTO patient_protocol (patient_id, protocol_id, ativado_por)
    VALUES (${patientId}, ${PROTOCOL_ID}, ${U_COORD_A})`;
}

async function criarAnamneseRascunho(opts: {
  id: string;
  clinicId: string;
  patientId: string;
  criadoPor: string;
  complementaAnamneseId?: string;
}) {
  await owner`INSERT INTO anamnese (id, clinic_id, patient_id, estado, criado_por, complementa_anamnese_id)
    VALUES (${opts.id}, ${opts.clinicId}, ${opts.patientId}, 'rascunho', ${opts.criadoPor}, ${opts.complementaAnamneseId ?? null})`;
}

async function snapshotZero(patientId: string) {
  return owner<
    { repertorioState: unknown; geradoEm: Date; segmentacao: unknown }[]
  >`SELECT repertorio_state AS "repertorioState", gerado_em AS "geradoEm",
    segmentacao AS "segmentacao"
    FROM session_snapshot WHERE patient_id = ${patientId} AND session_numero = 0`;
}

/**
 * Devolve a mensagem REAL do Postgres de uma promise que tem de rejeitar.
 *
 * Sem isto, `rejects.toThrow(/mensagem/)` é inútil no caminho Drizzle: o
 * driver embrulha tudo em `DrizzleQueryError`, cuja `.message` é o TEXTO DO
 * STATEMENT SQL emitido — não a exceção do Postgres. A mensagem real (RAISE,
 * `does not exist`, etc.) fica em `.cause`. Um teste que casasse só a
 * mensagem de topo casaria QUALQUER falha e passaria por engano. Aqui a
 * cadeia inteira é achatada, e a asserção depois casa o texto específico.
 * Se a operação NÃO rejeitar, isto falha alto: silêncio não é aprovação.
 * (Verbatim de `db/tests/consent-revogacao-gate.int.test.ts:103-124`.)
 */
async function erroDe(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const partes: string[] = [];
    let atual: unknown = e;
    while (atual && typeof atual === "object") {
      const o = atual as {
        message?: unknown;
        detail?: unknown;
        cause?: unknown;
      };
      if (o.message) partes.push(String(o.message));
      if (o.detail) partes.push(String(o.detail));
      atual = o.cause;
    }
    return partes.join(" | ");
  }
  throw new Error(
    "esperava rejeição do Postgres, mas a operação foi bem-sucedida",
  );
}

/** Chama o definer como o `ctx` informado. Cast explícito (assinatura exata do design.md). */
function validar(
  ctx: typeof ctxCoordA | typeof ctxTerA,
  anamneseId: string,
  repertorio: Record<string, unknown>,
  segmentacao: Record<string, unknown> = {},
) {
  return withTenant(ctx, (tx) =>
    tx.execute(
      sqlTag`SELECT app_validar_anamnese(
        ${anamneseId}::uuid, ${JSON.stringify(repertorio)}::jsonb, ${JSON.stringify(segmentacao)}::jsonb
      )`,
    ),
  );
}

describe.skipIf(!hasDb)(
  "#407 T04 · app_validar_anamnese (vermelho, pré-T05)",
  () => {
    beforeAll(async () => {
      ({ withTenant } = await import("@/db/rls"));
      ({ sql: appSql } = await import("@/db/client"));
      owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

      await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
        protocol, patient_protocol, consent, anamnese, anamnese_alvo, session_snapshot
        RESTART IDENTITY CASCADE`;

      await owner`INSERT INTO protocol_familia_catalogo (id, nome)
        VALUES (${PROTOCOL_FAMILIA}, 'Marcos de desenvolvimento (ABA)')
        ON CONFLICT (id) DO NOTHING`;

      await owner`INSERT INTO clinic (id, nome, is_demo) VALUES
        (${CLINIC_A}, 'Clínica A (anamnese-definer)', false),
        (${CLINIC_B}, 'Clínica B (anamnese-definer)', false)`;
      await owner`INSERT INTO app_user (id, name, email) VALUES
        (${U_COORD_A}, 'Coord A', 'coord.a.anamdef@t.com'),
        (${U_TER_A}, 'Terapeuta A', 'ter.a.anamdef@t.com'),
        (${U_COORD_B}, 'Coord B', 'coord.b.anamdef@t.com')`;
      await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
        (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
        (${U_TER_A}, ${CLINIC_A}, 'terapeuta'),
        (${U_COORD_B}, ${CLINIC_B}, 'coordenador')`;

      await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
        (${PAC_VALIDAR}, ${CLINIC_A}, 'Validar'),
        (${PAC_TERAPEUTA}, ${CLINIC_A}, 'Terapeuta tenta validar'),
        (${PAC_OUTRA_CLINICA}, ${CLINIC_B}, 'Outra clínica'),
        (${PAC_REVOGADO}, ${CLINIC_A}, 'Consentimento revogado'),
        (${PAC_DUPLA}, ${CLINIC_A}, 'Dupla validação'),
        (${PAC_COMPLEMENTAR_NOVO}, ${CLINIC_A}, 'Complementar eixo novo'),
        (${PAC_COMPLEMENTAR_EXISTENTE}, ${CLINIC_A}, 'Complementar eixo existente'),
        (${PAC_SEM_PROTOCOLO}, ${CLINIC_A}, 'Sem protocolo ativo')`;
      // `clinical_modality` fica no default `protocol_driven` (schema.ts:408-410).

      // Protocolo com taxonomia_ajuda de 5 níveis (>= 2, gate ANAM-06/D-G do
      // context.md: `Math.max(0, length-1)` com `> 0` exige length >= 2).
      const [protocolo] = await owner<{ id: string }[]>`
        INSERT INTO protocol (clinic_id, nome, disciplina, familia, taxonomia_ajuda)
        VALUES (${CLINIC_A}, 'VB-MAPP (teste definer)', 'ABA', ${PROTOCOL_FAMILIA},
          ${owner.json(["independente", "dica_verbal", "dica_gestual", "modelacao", "dica_fisica"])})
        RETURNING id`;
      PROTOCOL_ID = protocolo!.id;

      // Protocolo ativo para todo paciente, exceto PAC_SEM_PROTOCOLO (caso 8) e
      // PAC_OUTRA_CLINICA (o guard de tenant do caso 3 barra antes de chegar
      // no gate de protocolo).
      await ativarProtocolo(PAC_VALIDAR);
      await ativarProtocolo(PAC_TERAPEUTA);
      await ativarProtocolo(PAC_REVOGADO);
      await ativarProtocolo(PAC_DUPLA);
      await ativarProtocolo(PAC_COMPLEMENTAR_NOVO);
      await ativarProtocolo(PAC_COMPLEMENTAR_EXISTENTE);

      // Consentimento revogado (padrão consent-revogacao-gate.int.test.ts):
      // concessão de regime de menor, depois linha de revogação apontando
      // para ela. `app_prontuario_somente_leitura` lê isso.
      const consentRevogadoId = "00000000-0000-0000-0000-000000004cc1";
      await owner`INSERT INTO consent (id, patient_id, tipo, responsavel_signatario, versao_termo)
        VALUES (${consentRevogadoId}, ${PAC_REVOGADO}, 'tratamento_dados_menor', 'Mãe', 'menor-v1')`;
      await owner`INSERT INTO consent (patient_id, tipo, versao_termo, consent_revogado_id)
        VALUES (${PAC_REVOGADO}, 'revogacao_consentimento', 'revogacao-teste', ${consentRevogadoId})`;
    });

    afterAll(async () => {
      await owner?.end();
      await appSql?.end();
    });

    // ---------------------------------------------------------------------
    // Caso 1 (ANAM-04/ANAM-09) — coordenador valida → snapshot 0 passa a existir
    // ---------------------------------------------------------------------
    test("coordenador valida → session_snapshot com session_numero = 0 passa a existir", async () => {
      const anamneseId = "00000000-0000-0000-0000-000000004d01";
      await criarAnamneseRascunho({
        id: anamneseId,
        clinicId: CLINIC_A,
        patientId: PAC_VALIDAR,
        criadoPor: U_COORD_A,
      });

      expect(await snapshotZero(PAC_VALIDAR)).toHaveLength(0);

      const repertorio = {
        "00000000-0000-0000-0000-0000000ea001": {
          nivel_ajuda_recente: 2,
          contagem: 0,
          is_candidata: false,
          origem: "anamnese",
          procedencia: "relatado_responsavel",
        },
      };
      await expect(
        validar(ctxCoordA, anamneseId, repertorio),
      ).resolves.toBeDefined();

      const linhas = await snapshotZero(PAC_VALIDAR);
      expect(linhas).toHaveLength(1);
      expect(linhas[0]?.repertorioState).toEqual(repertorio);
    });

    // ---------------------------------------------------------------------
    // Caso 2 (ANAM-03/D-B) — terapeuta chama o definer direto → RAISE, nada criado
    // ---------------------------------------------------------------------
    test("terapeuta chama o definer direto → RAISE, nenhum snapshot criado", async () => {
      const anamneseId = "00000000-0000-0000-0000-000000004d02";
      await criarAnamneseRascunho({
        id: anamneseId,
        clinicId: CLINIC_A,
        patientId: PAC_TERAPEUTA,
        criadoPor: U_TER_A,
      });

      expect(
        await erroDe(
          validar(ctxTerA, anamneseId, { x: { nivel_ajuda_recente: 1 } }),
        ),
      ).toMatch(/exclusivo de coordenador/);

      expect(await snapshotZero(PAC_TERAPEUTA)).toHaveLength(0);
    });

    // ---------------------------------------------------------------------
    // Caso 3 (isolamento multi-tenant) — paciente de outra clínica → RAISE
    // ---------------------------------------------------------------------
    test("paciente de outra clínica → RAISE (isolamento cross-tenant)", async () => {
      const anamneseId = "00000000-0000-0000-0000-000000004d03";
      await criarAnamneseRascunho({
        id: anamneseId,
        clinicId: CLINIC_B,
        patientId: PAC_OUTRA_CLINICA,
        criadoPor: U_COORD_B,
      });

      expect(
        await erroDe(
          validar(ctxCoordA, anamneseId, { x: { nivel_ajuda_recente: 1 } }),
        ),
      ).toMatch(/fora da clínica do chamador|isolamento multi-tenant/);

      expect(await snapshotZero(PAC_OUTRA_CLINICA)).toHaveLength(0);
    });

    // ---------------------------------------------------------------------
    // Caso 4 (ANAM-07/D-H) — consentimento revogado → RAISE somente-leitura
    // ---------------------------------------------------------------------
    test("consentimento revogado → RAISE com a mensagem de somente-leitura", async () => {
      const anamneseId = "00000000-0000-0000-0000-000000004d04";
      await criarAnamneseRascunho({
        id: anamneseId,
        clinicId: CLINIC_A,
        patientId: PAC_REVOGADO,
        criadoPor: U_COORD_A,
      });

      expect(
        await erroDe(
          validar(ctxCoordA, anamneseId, { x: { nivel_ajuda_recente: 1 } }),
        ),
      ).toMatch(/somente-leitura: consentimento revogado/);

      expect(await snapshotZero(PAC_REVOGADO)).toHaveLength(0);
    });

    // ---------------------------------------------------------------------
    // Caso 5 (ANAM-12/D-F) — segunda validação → ANAMNESE_JA_VALIDADA, snapshot intocado
    // ---------------------------------------------------------------------
    test("segunda validação da mesma anamnese → RAISE ANAMNESE_JA_VALIDADA; snapshot 0 byte-idêntico", async () => {
      const anamneseId = "00000000-0000-0000-0000-000000004d05";
      await criarAnamneseRascunho({
        id: anamneseId,
        clinicId: CLINIC_A,
        patientId: PAC_DUPLA,
        criadoPor: U_COORD_A,
      });

      const repertorio = {
        "00000000-0000-0000-0000-0000000ea005": {
          nivel_ajuda_recente: 3,
          contagem: 0,
          is_candidata: false,
          origem: "anamnese",
          procedencia: "observado_avaliador",
        },
      };
      await expect(
        validar(ctxCoordA, anamneseId, repertorio),
      ).resolves.toBeDefined();

      const antes = (await snapshotZero(PAC_DUPLA))[0];
      expect(antes).toBeDefined();

      // Segunda validação da MESMA anamnese: recusada, e nada muda.
      expect(
        await erroDe(
          validar(ctxCoordA, anamneseId, {
            "00000000-0000-0000-0000-0000000ea005": {
              nivel_ajuda_recente: 99, // tentativa de reescrever — tem que ser ignorada
              contagem: 0,
              is_candidata: false,
              origem: "anamnese",
              procedencia: "observado_avaliador",
            },
          }),
        ),
      ).toMatch(/ANAMNESE_JA_VALIDADA/);

      const depois = (await snapshotZero(PAC_DUPLA))[0];
      expect(depois).toBeDefined();
      expect(depois?.repertorioState).toEqual(antes?.repertorioState);
      expect(depois?.geradoEm).toEqual(antes?.geradoEm);
    });

    // ---------------------------------------------------------------------
    // Caso 6 (P2/ANAM-20) — complementar com eixo NOVO → chave nova entra
    // ---------------------------------------------------------------------
    test("anamnese complementar com eixo novo → chave nova entra no snapshot; antigas inalteradas; gerado_em inalterado", async () => {
      const anamneseBaseId = "00000000-0000-0000-0000-000000004d06";
      await criarAnamneseRascunho({
        id: anamneseBaseId,
        clinicId: CLINIC_A,
        patientId: PAC_COMPLEMENTAR_NOVO,
        criadoPor: U_COORD_A,
      });

      const goalOriginal = "00000000-0000-0000-0000-0000000ea006";
      const repertorioBase = {
        [goalOriginal]: {
          nivel_ajuda_recente: 4,
          contagem: 0,
          is_candidata: false,
          origem: "anamnese",
          procedencia: "relatado_responsavel",
        },
      };
      await expect(
        validar(ctxCoordA, anamneseBaseId, repertorioBase),
      ).resolves.toBeDefined();
      const base = (await snapshotZero(PAC_COMPLEMENTAR_NOVO))[0];
      expect(base).toBeDefined();

      const anamneseComplementarId = "00000000-0000-0000-0000-000000004d07";
      await criarAnamneseRascunho({
        id: anamneseComplementarId,
        clinicId: CLINIC_A,
        patientId: PAC_COMPLEMENTAR_NOVO,
        criadoPor: U_COORD_A,
        complementaAnamneseId: anamneseBaseId,
      });

      const goalNovo = "00000000-0000-0000-0000-0000000ea007";
      const repertorioComplementar = {
        [goalNovo]: {
          nivel_ajuda_recente: 1,
          contagem: 0,
          is_candidata: false,
          origem: "anamnese",
          procedencia: "registro_anterior",
        },
      };
      await expect(
        validar(ctxCoordA, anamneseComplementarId, repertorioComplementar),
      ).resolves.toBeDefined();

      const depois = (await snapshotZero(PAC_COMPLEMENTAR_NOVO))[0];
      expect(depois).toBeDefined();
      const state = depois?.repertorioState as Record<string, unknown>;
      expect(state[goalOriginal]).toEqual(
        (base?.repertorioState as Record<string, unknown>)[goalOriginal],
      );
      expect(state[goalNovo]).toEqual(repertorioComplementar[goalNovo]);
      expect(depois?.geradoEm).toEqual(base?.geradoEm);
    });

    // ---------------------------------------------------------------------
    // Caso 7 (D-E) — complementar com eixo JÁ EXISTENTE → valor antigo vence
    // ---------------------------------------------------------------------
    test("anamnese complementar com eixo já existente → valor antigo vence (marco 0 imutável)", async () => {
      const anamneseBaseId = "00000000-0000-0000-0000-000000004d08";
      await criarAnamneseRascunho({
        id: anamneseBaseId,
        clinicId: CLINIC_A,
        patientId: PAC_COMPLEMENTAR_EXISTENTE,
        criadoPor: U_COORD_A,
      });

      const goal = "00000000-0000-0000-0000-0000000ea008";
      const repertorioBase = {
        [goal]: {
          nivel_ajuda_recente: 5,
          contagem: 0,
          is_candidata: false,
          origem: "anamnese",
          procedencia: "relatado_responsavel",
        },
      };
      await expect(
        validar(ctxCoordA, anamneseBaseId, repertorioBase),
      ).resolves.toBeDefined();
      const base = (await snapshotZero(PAC_COMPLEMENTAR_EXISTENTE))[0];
      expect(base).toBeDefined();

      const anamneseComplementarId = "00000000-0000-0000-0000-000000004d09";
      await criarAnamneseRascunho({
        id: anamneseComplementarId,
        clinicId: CLINIC_A,
        patientId: PAC_COMPLEMENTAR_EXISTENTE,
        criadoPor: U_COORD_A,
        complementaAnamneseId: anamneseBaseId,
      });

      // Mesma chave `goal`, valor DIFERENTE — tem que ser descartado (D-E: o
      // nível de partida original é imutável).
      await expect(
        validar(ctxCoordA, anamneseComplementarId, {
          [goal]: {
            nivel_ajuda_recente: 20,
            contagem: 0,
            is_candidata: false,
            origem: "anamnese",
            procedencia: "observado_avaliador",
          },
        }),
      ).resolves.toBeDefined();

      const depois = (await snapshotZero(PAC_COMPLEMENTAR_EXISTENTE))[0];
      expect(depois).toBeDefined();
      const state = depois?.repertorioState as Record<
        string,
        { nivel_ajuda_recente: number }
      >;
      expect(state[goal]?.nivel_ajuda_recente).toBe(5);
      expect(depois?.geradoEm).toEqual(base?.geradoEm);
    });

    // ---------------------------------------------------------------------
    // Caso 8 (ANAM-06/D-G) — sem protocolo ativo com taxonomia >= 2 → RAISE
    // ---------------------------------------------------------------------
    test("sem protocolo ativo com jsonb_array_length(taxonomia_ajuda) >= 2 → RAISE ANAMNESE_SEM_PROTOCOLO_ATIVO", async () => {
      const anamneseId = "00000000-0000-0000-0000-000000004d10";
      await criarAnamneseRascunho({
        id: anamneseId,
        clinicId: CLINIC_A,
        patientId: PAC_SEM_PROTOCOLO,
        criadoPor: U_COORD_A,
      });

      expect(
        await erroDe(
          validar(ctxCoordA, anamneseId, { x: { nivel_ajuda_recente: 1 } }),
        ),
      ).toMatch(/ANAMNESE_SEM_PROTOCOLO_ATIVO/);

      expect(await snapshotZero(PAC_SEM_PROTOCOLO)).toHaveLength(0);
    });
  },
);
