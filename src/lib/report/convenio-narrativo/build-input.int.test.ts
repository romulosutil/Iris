// Teste de integração do builder de input do convênio narrativo (Fase 5 ·
// Fatia 5, Task 5). Roda com `pnpm test:rls`. Auto-skip sem
// MIGRATION_DATABASE_URL. Mirrors build-payload.int.test.ts (convenio-bruto).
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

vi.mock("server-only", () => ({}));
import { withTenant, type TenantContext } from "../../../db/rls";
import { buildConvenioBrutoPayload } from "../convenio-bruto/build-payload";
import { buildConvenioNarrativoInput } from "./build-input";
import type { CabecalhoConvenio } from "./types";
import type { PayloadConvenioBruto } from "../convenio-bruto/types";
import { hasDb } from "@tests/integration-env";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!)
  : (null as never);

const CLINIC = "11111111-1111-1111-1111-111111111111";
const COORD = "22222222-2222-2222-2222-222222222222";
const TERA = "33333333-3333-3333-3333-333333333333";
const PAC = "44444444-4444-4444-4444-444444444444";
const SES = "55555555-5555-5555-5555-555555555555";
const EXT = "66666666-6666-6666-6666-666666666666";
const ctx = (role: TenantContext["role"], userId: string): TenantContext => ({
  role,
  userId,
  clinicId: CLINIC,
});

const cabecalho: CabecalhoConvenio = {
  operadora: "Unimed",
  cid: "F84.0",
  finalidade: "Renovação de guia",
};

describe.skipIf(!hasDb)("buildConvenioNarrativoInput", () => {
  beforeAll(async () => {
    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership, session, extraction, evidence RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'C')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES (${COORD}, 'Coord', 'c@a.test'), (${TERA}, 'Dra. Ana', 't@a.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${COORD}, ${CLINIC}, 'coordenador'), (${TERA}, ${CLINIC}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC}, 'Miguel S.')`;
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, disciplina, agendada_para, estado, numero_sequencial_paciente)
      VALUES (${SES}, ${CLINIC}, ${PAC}, ${TERA}, 'ABA', '2026-06-10T09:00:00Z', 'realizada', 8)`;
    await owner`INSERT INTO extraction (id, session_id, clinic_id, subtipo, trecho_fonte, confianca, payload)
      VALUES (${EXT}, ${SES}, ${CLINIC}, 'evidencia', 'trecho de teste', 'alta', '{}'::jsonb)`;
    // Evidência dentro do período (junho).
    await owner`INSERT INTO evidence (id, extraction_id, patient_id, session_id, session_numero, alvo_ordinal, aprovado_por, aprovado_em, classificacao_original, goal_ref)
      VALUES (gen_random_uuid(), ${EXT}, ${PAC}, ${SES}, 8, 0, ${TERA}, '2026-06-10T10:00:00Z', '{"rotulo":"adquirido"}'::jsonb, 'Mando')`;
    // Evidência FORA do período (maio) — não deve aparecer no dossiê.
    await owner`INSERT INTO evidence (id, extraction_id, patient_id, session_id, session_numero, alvo_ordinal, aprovado_por, aprovado_em, classificacao_original, goal_ref)
      VALUES (gen_random_uuid(), ${EXT}, ${PAC}, ${SES}, 8, 1, ${TERA}, '2026-05-10T10:00:00Z', '{"rotulo":"emergente"}'::jsonb, 'Fora do período')`;
  });
  afterAll(async () => {
    if (hasDb) await owner.end();
  });

  test("reusa buildConvenioBrutoPayload e preserva paciente/período/cabeçalho", async () => {
    const args = {
      patientId: PAC,
      nomePaciente: "Miguel S.",
      periodoInicio: "2026-06-01",
      periodoFim: "2026-06-30",
      cabecalho,
    };

    const [input, dossieEsperado] = await withTenant(
      ctx("coordenador", COORD),
      async (tx) => {
        const input = await buildConvenioNarrativoInput(tx, args);
        const dossieEsperado = await buildConvenioBrutoPayload(tx, {
          patientId: args.patientId,
          nomePaciente: args.nomePaciente,
          periodoInicio: args.periodoInicio,
          periodoFim: args.periodoFim,
        });
        return [input, dossieEsperado];
      },
    );

    expect(input.paciente).toEqual({ nome: "Miguel S." });
    expect(input.periodo).toEqual({ inicio: "2026-06-01", fim: "2026-06-30" });
    expect(input.cabecalho).toEqual(cabecalho);

    expect(input.dossie.sessoes).toEqual(dossieEsperado.sessoes);
    expect(input.dossie.evidencias).toEqual(dossieEsperado.evidencias);
    expect(input.dossie.presenca).toEqual(dossieEsperado.presenca);

    expect(input.dossie.evidencias).toHaveLength(1);
    expect(input.dossie.evidencias[0]!.metaOuDominio).toBe("Mando");
    expect(
      input.dossie.evidencias.some(
        (e: PayloadConvenioBruto["evidencias"][number]) =>
          e.metaOuDominio === "Fora do período",
      ),
    ).toBe(false);
  });
});
