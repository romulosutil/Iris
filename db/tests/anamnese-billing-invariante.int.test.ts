/**
 * #407 T20 — guarda de invariância de faturamento (ANAM-09 / D-A).
 *
 * Prova que validar uma anamnese NÃO adiciona o paciente ao ciclo de faturamento
 * corrente. O marco zero grava um snapshot (session_numero = 0) mas NÃO cria
 * nenhuma linha em `session` nem emite `evidence` com `aprovado_em` no ciclo.
 *
 * Razão de D-A do design.md: se o marco zero fosse modelado como uma `session`
 * com `numero_sequencial_paciente = 0`, a apuração de faturamento contaria o
 * paciente como ativo via critério (b) de `billing_apurar_ciclo` e cobraria
 * indevidamente o cliente pela anamnese.
 */
import { count, eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-0000000020fa";
const U_COORD_A = "00000000-0000-0000-0000-00000000209a";
const U_T1_A = "00000000-0000-0000-0000-00000000207a";

const PAC_INATIVO = "00000000-0000-0000-0000-000000020a01";
const PAC_ATIVO_SESSAO = "00000000-0000-0000-0000-000000020a02";

const SUB_A = "00000000-0000-0000-0000-00000002000a";
const CYCLE_A = "00000000-0000-0000-0000-0000000200a1";

const PROTOCOL_FAMILIA = "aba_marcos_desenvolvimento";

const INICIO = new Date("2026-03-01T00:00:00Z");
const FIM = new Date("2026-04-01T00:00:00Z");
const CRIADO_ANTIGO = new Date("2026-01-05T09:00:00Z");
const SESSAO_DENTRO = new Date("2026-03-15T10:00:00Z");

const ctxCoordA = {
  clinicId: CLINIC_A,
  userId: U_COORD_A,
  role: "coordenador",
} as const;

let owner: ReturnType<typeof postgres>;
let withTenant: typeof import("@/db/rls").withTenant;
let appSql: typeof import("@/db/client").sql;
let schema: typeof import("@/db/schema");
let validarAnamnese: typeof import("@/app/(app)/pacientes/[id]/anamnese/logic").validarAnamnese;

let PROTOCOL_ID: string;
let MILESTONE_ID: string;

describe.skipIf(!hasDb)(
  "T20 · Invariância de faturamento da validação de anamnese",
  () => {
    beforeAll(async () => {
      ({ withTenant } = await import("@/db/rls"));
      ({ sql: appSql } = await import("@/db/client"));
      schema = await import("@/db/schema");
      ({ validarAnamnese } =
        await import("@/app/(app)/pacientes/[id]/anamnese/logic"));

      owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

      await owner`INSERT INTO protocol_familia_catalogo (id, nome)
      VALUES (${PROTOCOL_FAMILIA}, 'Marcos de desenvolvimento (ABA)')
      ON CONFLICT (id) DO NOTHING`;

      await owner`INSERT INTO clinic (id, nome, is_demo)
      VALUES (${CLINIC_A}, 'Clínica A (T20 Billing)', false)
      ON CONFLICT (id) DO NOTHING`;

      await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord T20', 'coord.t20@iris.com'),
      (${U_T1_A}, 'Terapeuta T20', 't1.t20@iris.com')
      ON CONFLICT (id) DO NOTHING`;

      await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_T1_A}, ${CLINIC_A}, 'terapeuta')
      ON CONFLICT DO NOTHING`;

      // Pacientes criados ANTES do ciclo
      await owner`INSERT INTO patient (id, clinic_id, nome, clinical_modality, criado_em) VALUES
      (${PAC_INATIVO}, ${CLINIC_A}, 'Paciente Inativo T20', 'protocol_driven', ${CRIADO_ANTIGO}),
      (${PAC_ATIVO_SESSAO}, ${CLINIC_A}, 'Paciente Ativo T20', 'protocol_driven', ${CRIADO_ANTIGO})
      ON CONFLICT (id) DO NOTHING`;

      await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe) VALUES
      (${PAC_INATIVO}, ${U_T1_A}, 'ABA', 'terapeuta_referencia'),
      (${PAC_ATIVO_SESSAO}, ${U_T1_A}, 'ABA', 'terapeuta_referencia')
      ON CONFLICT DO NOTHING`;

      const [proto] = await owner`INSERT INTO protocol
      (clinic_id, nome, disciplina, familia, taxonomia_ajuda)
      VALUES (${CLINIC_A}, 'Protocolo T20', 'ABA', ${PROTOCOL_FAMILIA},
        ${owner.json(["independente", "dica_verbal", "dica_gestual", "modelacao", "dica_fisica"])})
      RETURNING id`;
      PROTOCOL_ID = proto!.id as string;

      await owner`INSERT INTO patient_protocol (patient_id, protocol_id, ativado_por) VALUES
      (${PAC_INATIVO}, ${PROTOCOL_ID}, ${U_COORD_A}),
      (${PAC_ATIVO_SESSAO}, ${PROTOCOL_ID}, ${U_COORD_A})`;

      const [marco] = await owner`INSERT INTO milestone
      (protocol_id, dominio_id, nome, tipo_estrutura, estrutura)
      VALUES (${PROTOCOL_ID}, 'mando', 'Mando T20', 'marco_simples', ${owner.json({})})
      RETURNING id`;
      MILESTONE_ID = marco!.id as string;

      // Assinatura e Ciclo de faturamento
      await owner`INSERT INTO subscription (id, clinic_id, status, provider)
      VALUES (${SUB_A}, ${CLINIC_A}, 'free_tier', NULL)
      ON CONFLICT (id) DO NOTHING`;

      await owner`INSERT INTO billing_cycle (id, clinic_id, subscription_id, inicio, fim)
      VALUES (${CYCLE_A}, ${CLINIC_A}, ${SUB_A}, ${INICIO}, ${FIM})
      ON CONFLICT (id) DO NOTHING`;

      // Sessão real no ciclo APENAS para PAC_ATIVO_SESSAO
      const sessAtivoId = crypto.randomUUID();
      await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, criado_em, disciplina, estado)
      VALUES (${sessAtivoId}, ${CLINIC_A}, ${PAC_ATIVO_SESSAO}, ${U_T1_A}, ${SESSAO_DENTRO}, ${SESSAO_DENTRO}, 'ABA', 'realizada')`;
    });

    afterAll(async () => {
      await owner?.end();
      await appSql?.end();
    });

    test("T20 (ANAM-09): validar a anamnese não altera o resultado da apuração de faturamento do ciclo", async () => {
      // 1. Apuração antes da validação da anamnese
      const [apuracaoAntesRow] = await owner`
      SELECT billing_apurar_ciclo(${CYCLE_A}::uuid) AS total
    `;
      const totalAntes = Number(apuracaoAntesRow!.total);

      // Apenas o paciente ativo com sessão entra
      expect(totalAntes).toBe(1);

      const pacientesApuradosAntes = await owner`
      SELECT patient_id, motivo FROM billing_cycle_patient WHERE cycle_id = ${CYCLE_A}
    `;
      expect(pacientesApuradosAntes).toHaveLength(1);
      expect(pacientesApuradosAntes[0]!.patient_id).toBe(PAC_ATIVO_SESSAO);

      // Contagem de sessões do paciente inativo antes
      const [contSessaoAntes] = await owner`
      SELECT count(*) AS n FROM session WHERE patient_id = ${PAC_INATIVO}
    `;
      expect(Number(contSessaoAntes!.n)).toBe(0);

      // 2. Valida a anamnese para o paciente inativo (gera snapshot 0 e alvos)
      const anamneseId = crypto.randomUUID();
      const alvoId = crypto.randomUUID();
      await owner`INSERT INTO anamnese (id, clinic_id, patient_id, estado, criado_por)
      VALUES (${anamneseId}, ${CLINIC_A}, ${PAC_INATIVO}, 'rascunho', ${U_COORD_A})`;
      await owner`INSERT INTO anamnese_alvo
      (id, anamnese_id, clinic_id, patient_id, eixo, descricao, milestone_id, nivel_ajuda_inicial, procedencia)
      VALUES (${alvoId}, ${anamneseId}, ${CLINIC_A}, ${PAC_INATIVO},
        'comunicacao_expressiva', 'Alvo de anamnese T20', ${MILESTONE_ID}, 1, 'observado_avaliador')`;

      const valRes = await withTenant(ctxCoordA, (tx) =>
        validarAnamnese(ctxCoordA, { anamneseId }),
      );
      expect(valRes.id).toBe(anamneseId);

      // 3. Apuração após a validação da anamnese
      const [apuracaoDepoisRow] = await owner`
      SELECT billing_apurar_ciclo(${CYCLE_A}::uuid) AS total
    `;
      const totalDepois = Number(apuracaoDepoisRow!.total);

      // 4. Assertar IGUALDADE ESTRITA do total apurado
      expect(totalDepois).toBe(totalAntes);
      expect(totalDepois).toBe(1);

      // 5. Assertar que o paciente da anamnese NÃO entrou no memorial de faturamento
      const pacientesApuradosDepois = await owner`
      SELECT patient_id, motivo FROM billing_cycle_patient WHERE cycle_id = ${CYCLE_A}
    `;
      expect(pacientesApuradosDepois).toEqual(pacientesApuradosAntes);

      // 6. Assertar que NENHUMA sessão fantasma foi inserida em `session`
      const [contSessaoDepois] = await owner`
      SELECT count(*) AS n FROM session WHERE patient_id = ${PAC_INATIVO}
    `;
      expect(Number(contSessaoDepois!.n)).toBe(0);
    });
  },
);
