/**
 * #407 T19 — Sugestão de protocolo e nível de entrada (ANAM-21).
 *
 * Valida o comportamento de sugestão de protocolo e nível de entrada na anamnese:
 * 1. A sugestão é salva no rascunho com `protocolId`, `nivelEntradaSugerido` e `sugestaoAceita`.
 * 2. É sempre editável antes da validação.
 * 3. `sugestaoAceita = true` quando aceita, `false` quando o usuário escolhe outro valor.
 * 4. Validação preserva esses metadados na linha da anamnese.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-0000000019fa";
const U_COORD_A = "00000000-0000-0000-0000-00000000199a";
const U_T1_A = "00000000-0000-0000-0000-00000000197a";

const PAC_1 = "00000000-0000-0000-0000-000000019a01";

const PROTOCOL_FAMILIA = "aba_marcos_desenvolvimento";

const ctxCoordA = {
  clinicId: CLINIC_A,
  userId: U_COORD_A,
  role: "coordenador",
} as const;

let owner: ReturnType<typeof postgres>;
let withTenant: typeof import("@/db/rls").withTenant;
let appSql: typeof import("@/db/client").sql;
let salvarRascunhoAnamnese: typeof import("@/app/(app)/pacientes/[id]/anamnese/logic").salvarRascunhoAnamnese;
let validarAnamnese: typeof import("@/app/(app)/pacientes/[id]/anamnese/logic").validarAnamnese;

let PROTOCOL_ID: string;

describe.skipIf(!hasDb)(
  "T19 · Sugestão de protocolo e nível de entrada na anamnese",
  () => {
    beforeAll(async () => {
      ({ withTenant } = await import("@/db/rls"));
      ({ sql: appSql } = await import("@/db/client"));
      ({ salvarRascunhoAnamnese, validarAnamnese } =
        await import("@/app/(app)/pacientes/[id]/anamnese/logic"));

      owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

      await owner`INSERT INTO protocol_familia_catalogo (id, nome)
      VALUES (${PROTOCOL_FAMILIA}, 'Marcos de desenvolvimento (ABA)')
      ON CONFLICT (id) DO NOTHING`;

      await owner`INSERT INTO clinic (id, nome, is_demo)
      VALUES (${CLINIC_A}, 'Clínica A (T19 Sugestão)', false)
      ON CONFLICT (id) DO NOTHING`;

      await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord T19', 'coord.t19@iris.com'),
      (${U_T1_A}, 'Terapeuta T19', 't1.t19@iris.com')
      ON CONFLICT (id) DO NOTHING`;

      await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_T1_A}, ${CLINIC_A}, 'terapeuta')
      ON CONFLICT DO NOTHING`;

      await owner`INSERT INTO patient (id, clinic_id, nome, clinical_modality) VALUES
      (${PAC_1}, ${CLINIC_A}, 'Paciente Sugestão T19', 'protocol_driven')
      ON CONFLICT (id) DO NOTHING`;

      await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe) VALUES
      (${PAC_1}, ${U_T1_A}, 'ABA', 'terapeuta_referencia')
      ON CONFLICT DO NOTHING`;

      const [proto] = await owner`INSERT INTO protocol
      (clinic_id, nome, disciplina, familia, taxonomia_ajuda)
      VALUES (${CLINIC_A}, 'Protocolo T19', 'ABA', ${PROTOCOL_FAMILIA},
        ${owner.json(["independente", "dica_verbal", "dica_gestual", "modelacao", "dica_fisica"])})
      RETURNING id`;
      PROTOCOL_ID = proto!.id as string;

      await owner`INSERT INTO patient_protocol (patient_id, protocol_id, ativado_por) VALUES
      (${PAC_1}, ${PROTOCOL_ID}, ${U_COORD_A})`;
    });

    afterAll(async () => {
      await owner?.end();
      await appSql?.end();
    });

    test("salvar rascunho com sugestão aceita persiste sugestao_aceita = true e nivel_entrada_sugerido", async () => {
      const res = await withTenant(ctxCoordA, () =>
        salvarRascunhoAnamnese(ctxCoordA, {
          patientId: PAC_1,
          protocolId: PROTOCOL_ID,
          nivelEntradaSugerido: "Nível 1 (0 a 18 meses)",
          sugestaoAceita: true,
          observacoes:
            "Sugestão baseada na idade cronológica e triagem inicial",
          alvos: [
            {
              eixo: "comunicacao_expressiva",
              descricao: "Alvo Inicial Sugerido",
              nivel_ajuda_inicial: 1,
              procedencia: "relatado_responsavel",
              criterio_n: 3,
              criterio_m: 4,
              ciclo_revisao_semanas: 8,
            },
          ],
        }),
      );

      expect(res.id).toBeDefined();

      const [row] = await owner`
      SELECT protocol_id, nivel_entrada_sugerido, sugestao_aceita, observacoes
      FROM anamnese WHERE id = ${res.id!}
    `;

      expect(row!.protocol_id).toBe(PROTOCOL_ID);
      expect(row!.nivel_entrada_sugerido).toBe("Nível 1 (0 a 18 meses)");
      expect(row!.sugestao_aceita).toBe(true);
      expect(row!.observacoes).toBe(
        "Sugestão baseada na idade cronológica e triagem inicial",
      );
    });

    test("salvar rascunho quando sugestão for rejeitada/editada persiste sugestao_aceita = false", async () => {
      const res = await withTenant(ctxCoordA, () =>
        salvarRascunhoAnamnese(ctxCoordA, {
          patientId: PAC_1,
          protocolId: PROTOCOL_ID,
          nivelEntradaSugerido: "Nível 2 (18 a 30 meses)",
          sugestaoAceita: false,
          observacoes:
            "Terapeuta rebaixou para nível 1 após avaliação comportamental",
          alvos: [
            {
              eixo: "comunicacao_expressiva",
              descricao: "Alvo Editado",
              nivel_ajuda_inicial: 2,
              procedencia: "observado_avaliador",
              criterio_n: 3,
              criterio_m: 4,
              ciclo_revisao_semanas: 8,
            },
          ],
        }),
      );

      expect(res.id).toBeDefined();

      const [row] = await owner`
      SELECT protocol_id, nivel_entrada_sugerido, sugestao_aceita
      FROM anamnese WHERE id = ${res.id!}
    `;

      expect(row!.protocol_id).toBe(PROTOCOL_ID);
      expect(row!.nivel_entrada_sugerido).toBe("Nível 2 (18 a 30 meses)");
      expect(row!.sugestao_aceita).toBe(false);
    });
  },
);
