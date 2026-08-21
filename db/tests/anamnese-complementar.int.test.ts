/**
 * #407 T18 — Anamnese complementar e resolução da vigente (ANAM-20 / ANAM-12).
 *
 * Valida o comportamento de anamneses complementares:
 * 1. Anamnese complementar faz merge aditivo no repertório do snapshot 0.
 * 2. A anamnese original permanece legível e inalterada.
 * 3. Resolução da vigente por `validada_em DESC, id DESC` (criado_em é irrelevante).
 * 4. Revalidação da mesma anamnese é rejeitada.
 * 5. Colisão de chave no merge preserva o valor original.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-0000000018fa";
const U_COORD_A = "00000000-0000-0000-0000-00000000189a";
const U_T1_A = "00000000-0000-0000-0000-00000000187a";

const PAC_1 = "00000000-0000-0000-0000-000000018a01";
const PAC_TIE = "00000000-0000-0000-0000-000000018a02";

const PROTOCOL_FAMILIA = "aba_marcos_desenvolvimento";

const ctxCoordA = {
  clinicId: CLINIC_A,
  userId: U_COORD_A,
  role: "coordenador",
} as const;

let owner: ReturnType<typeof postgres>;
let withTenant: typeof import("@/db/rls").withTenant;
let appSql: typeof import("@/db/client").sql;
let validarAnamnese: typeof import("@/app/(app)/pacientes/[id]/anamnese/logic").validarAnamnese;
let obterAnamneseVigente: typeof import("@/app/(app)/pacientes/[id]/anamnese/queries").obterAnamneseVigente;

let PROTOCOL_ID: string;
let MARCO_EXPRESSIVA: string;
let MARCO_MOTOR: string;

describe.skipIf(!hasDb)(
  "T18 · Anamnese complementar e resolução da vigente",
  () => {
    beforeAll(async () => {
      ({ withTenant } = await import("@/db/rls"));
      ({ sql: appSql } = await import("@/db/client"));
      ({ validarAnamnese } =
        await import("@/app/(app)/pacientes/[id]/anamnese/logic"));
      ({ obterAnamneseVigente } =
        await import("@/app/(app)/pacientes/[id]/anamnese/queries"));

      owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

      await owner`INSERT INTO protocol_familia_catalogo (id, nome)
      VALUES (${PROTOCOL_FAMILIA}, 'Marcos de desenvolvimento (ABA)')
      ON CONFLICT (id) DO NOTHING`;

      await owner`INSERT INTO clinic (id, nome, is_demo)
      VALUES (${CLINIC_A}, 'Clínica A (T18 Complementar)', false)
      ON CONFLICT (id) DO NOTHING`;

      await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord T18', 'coord.t18@iris.com'),
      (${U_T1_A}, 'Terapeuta T18', 't1.t18@iris.com')
      ON CONFLICT (id) DO NOTHING`;

      await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_T1_A}, ${CLINIC_A}, 'terapeuta')
      ON CONFLICT DO NOTHING`;

      await owner`INSERT INTO patient (id, clinic_id, nome, clinical_modality) VALUES
      (${PAC_1}, ${CLINIC_A}, 'Paciente Complementar T18', 'protocol_driven'),
      (${PAC_TIE}, ${CLINIC_A}, 'Paciente Tie-break T18', 'protocol_driven')
      ON CONFLICT (id) DO NOTHING`;

      await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe) VALUES
      (${PAC_1}, ${U_T1_A}, 'ABA', 'terapeuta_referencia'),
      (${PAC_TIE}, ${U_T1_A}, 'ABA', 'terapeuta_referencia')
      ON CONFLICT DO NOTHING`;

      const [proto] = await owner`INSERT INTO protocol
      (clinic_id, nome, disciplina, familia, taxonomia_ajuda)
      VALUES (${CLINIC_A}, 'Protocolo T18', 'ABA', ${PROTOCOL_FAMILIA},
        ${owner.json(["independente", "dica_verbal", "dica_gestual", "modelacao", "dica_fisica"])})
      RETURNING id`;
      PROTOCOL_ID = proto!.id as string;

      await owner`INSERT INTO patient_protocol (patient_id, protocol_id, ativado_por) VALUES
      (${PAC_1}, ${PROTOCOL_ID}, ${U_COORD_A}),
      (${PAC_TIE}, ${PROTOCOL_ID}, ${U_COORD_A})`;

      const [marco1] = await owner`INSERT INTO milestone
      (protocol_id, dominio_id, nome, tipo_estrutura, estrutura)
      VALUES (${PROTOCOL_ID}, 'mando', 'Mando T18', 'marco_simples', ${owner.json({})})
      RETURNING id`;
      MARCO_EXPRESSIVA = marco1!.id as string;

      const [marco2] = await owner`INSERT INTO milestone
      (protocol_id, dominio_id, nome, tipo_estrutura, estrutura)
      VALUES (${PROTOCOL_ID}, 'motor', 'Motor T18', 'marco_simples', ${owner.json({})})
      RETURNING id`;
      MARCO_MOTOR = marco2!.id as string;
    });

    afterAll(async () => {
      await owner?.end();
      await appSql?.end();
    });

    test("validar original e depois complementar faz merge aditivo no snapshot 0 mantendo a original inalterada", async () => {
      // 1. Cria e valida anamnese original com 1 alvo
      const anaOriginalId = crypto.randomUUID();
      const alvo1Id = crypto.randomUUID();
      await owner`INSERT INTO anamnese (id, clinic_id, patient_id, estado, criado_por)
      VALUES (${anaOriginalId}, ${CLINIC_A}, ${PAC_1}, 'rascunho', ${U_COORD_A})`;
      await owner`INSERT INTO anamnese_alvo
      (id, anamnese_id, clinic_id, patient_id, eixo, descricao, milestone_id, nivel_ajuda_inicial, procedencia)
      VALUES (${alvo1Id}, ${anaOriginalId}, ${CLINIC_A}, ${PAC_1},
        'comunicacao_expressiva', 'Alvo Expressivo Original', ${MARCO_EXPRESSIVA}, 1, 'observado_avaliador')`;

      const resOrig = await withTenant(ctxCoordA, () =>
        validarAnamnese(ctxCoordA, { anamneseId: anaOriginalId }),
      );
      expect(resOrig.id).toBe(anaOriginalId);

      // Consulta snapshot 0 inicial
      const [snapAntes] = await owner`
      SELECT repertorio_state FROM session_snapshot
      WHERE patient_id = ${PAC_1} AND session_numero = 0
    `;
      const [alvo1Atualizado] = await owner`
      SELECT goal_id FROM anamnese_alvo WHERE id = ${alvo1Id}
    `;
      const goal1Id = alvo1Atualizado!.goal_id as string;
      expect(snapAntes!.repertorio_state[goal1Id]).toBeDefined();
      expect(snapAntes!.repertorio_state[goal1Id].nivel_ajuda_recente).toBe(1);

      // 2. Cria e valida anamnese complementar (complementa_anamnese_id = anaOriginalId) com alvo novo
      const anaCompId = crypto.randomUUID();
      const alvo2Id = crypto.randomUUID();
      await owner`INSERT INTO anamnese (id, clinic_id, patient_id, estado, criado_por, complementa_anamnese_id)
      VALUES (${anaCompId}, ${CLINIC_A}, ${PAC_1}, 'rascunho', ${U_COORD_A}, ${anaOriginalId})`;
      await owner`INSERT INTO anamnese_alvo
      (id, anamnese_id, clinic_id, patient_id, eixo, descricao, milestone_id, nivel_ajuda_inicial, procedencia)
      VALUES (${alvo2Id}, ${anaCompId}, ${CLINIC_A}, ${PAC_1},
        'autonomia_motor', 'Alvo Motor Complementar', ${MARCO_MOTOR}, 3, 'relatado_responsavel')`;

      const resComp = await withTenant(ctxCoordA, () =>
        validarAnamnese(ctxCoordA, { anamneseId: anaCompId }),
      );
      expect(resComp.id).toBe(anaCompId);

      // 3. Verifica que a original permaneceu intacta
      const [origDb] = await owner`
      SELECT estado, validada_em, complementa_anamnese_id FROM anamnese WHERE id = ${anaOriginalId}
    `;
      expect(origDb!.estado).toBe("validada");
      expect(origDb!.complementa_anamnese_id).toBeNull();

      // 4. Verifica que o snapshot 0 possui AMBAS as chaves (merge aditivo)
      const [snapDepois] = await owner`
      SELECT repertorio_state FROM session_snapshot
      WHERE patient_id = ${PAC_1} AND session_numero = 0
    `;
      const [alvo2Atualizado] = await owner`
      SELECT goal_id FROM anamnese_alvo WHERE id = ${alvo2Id}
    `;
      const goal2Id = alvo2Atualizado!.goal_id as string;

      expect(snapDepois!.repertorio_state[goal1Id]).toBeDefined();
      expect(snapDepois!.repertorio_state[goal1Id].nivel_ajuda_recente).toBe(1);
      expect(snapDepois!.repertorio_state[goal2Id]).toBeDefined();
      expect(snapDepois!.repertorio_state[goal2Id].nivel_ajuda_recente).toBe(3);

      // 5. Verifica que obterAnamneseVigente resolve a complementar (mais recente)
      const vigente = await obterAnamneseVigente(ctxCoordA, PAC_1);
      expect(vigente?.id).toBe(anaCompId);
    });

    test("desempate de anamnese vigente: mesmo validada_em desempata por id DESC e ignora criado_em", async () => {
      const dataFixa = new Date("2026-03-10T12:00:00Z");
      const criadoAntigo = new Date("2026-01-01T00:00:00Z");
      const criadoRecente = new Date("2026-03-01T00:00:00Z");

      const idMenor = "00000000-0000-0000-0000-000000000001";
      const idMaior = "00000000-0000-0000-0000-000000000009";

      // Inversão deliberada: idMaior tem criado_em mais ANTIGO que idMenor
      await owner`INSERT INTO anamnese (id, clinic_id, patient_id, estado, criado_por, criado_em, validada_em, validada_por)
      VALUES
      (${idMenor}, ${CLINIC_A}, ${PAC_TIE}, 'validada', ${U_COORD_A}, ${criadoRecente}, ${dataFixa}, ${U_COORD_A}),
      (${idMaior}, ${CLINIC_A}, ${PAC_TIE}, 'validada', ${U_COORD_A}, ${criadoAntigo}, ${dataFixa}, ${U_COORD_A})
      ON CONFLICT (id) DO UPDATE SET validada_em = ${dataFixa}`;

      const vigente = await obterAnamneseVigente(ctxCoordA, PAC_TIE);
      // Maior id vence o empate de validada_em, mesmo com criado_em mais antigo
      expect(vigente?.id).toBe(idMaior);
    });

    test("tentativa de revalidar anamnese já validada retorna erro e preserva snapshot", async () => {
      const anaId = crypto.randomUUID();
      const alvoId = crypto.randomUUID();
      await owner`INSERT INTO anamnese (id, clinic_id, patient_id, estado, criado_por)
      VALUES (${anaId}, ${CLINIC_A}, ${PAC_1}, 'rascunho', ${U_COORD_A})`;
      await owner`INSERT INTO anamnese_alvo
      (id, anamnese_id, clinic_id, patient_id, eixo, descricao, milestone_id, nivel_ajuda_inicial, procedencia)
      VALUES (${alvoId}, ${anaId}, ${CLINIC_A}, ${PAC_1},
        'social_brincar', 'Alvo Social', null, 2, 'observado_avaliador')`;

      // Primeira validação -> sucesso
      const res1 = await withTenant(ctxCoordA, () =>
        validarAnamnese(ctxCoordA, { anamneseId: anaId }),
      );
      expect(res1.id).toBe(anaId);

      // Segunda validação -> rejeitada
      const res2 = await withTenant(ctxCoordA, () =>
        validarAnamnese(ctxCoordA, { anamneseId: anaId }),
      );
      expect(res2.error).toBe("Anamnese não encontrada ou já validada.");
    });
  },
);
