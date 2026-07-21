// Teste de integração do builder de payload factual do dossiê
// convenio_bruto (Fase 5 · Fatia 3, Task 2). Roda com `pnpm test:rls`.
// Auto-skip sem MIGRATION_DATABASE_URL.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { withTenant, type TenantContext } from "../../../db/rls";
import { buildConvenioBrutoPayload } from "./build-payload";

const hasDb = !!process.env.MIGRATION_DATABASE_URL;
const owner = hasDb ? postgres(process.env.MIGRATION_DATABASE_URL!) : (null as never);

const CLINIC = "11111111-1111-1111-1111-111111111111";
const COORD = "22222222-2222-2222-2222-222222222222";
const TERA = "33333333-3333-3333-3333-333333333333";
const PAC = "44444444-4444-4444-4444-444444444444";
const SES = "55555555-5555-5555-5555-555555555555";
const EXT = "66666666-6666-6666-6666-666666666666";
const ctx = (role: TenantContext["role"], userId: string): TenantContext => ({ role, userId, clinicId: CLINIC });

describe.skipIf(!hasDb)("buildConvenioBrutoPayload", () => {
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
    await owner`INSERT INTO evidence (id, extraction_id, patient_id, session_id, session_numero, alvo_ordinal, aprovado_por, aprovado_em, classificacao_original, goal_ref)
      VALUES (gen_random_uuid(), ${EXT}, ${PAC}, ${SES}, 8, 0, ${TERA}, '2026-06-10T10:00:00Z', '{"rotulo":"adquirido"}'::jsonb, 'Mando')`;
  });
  afterAll(async () => { if (hasDb) await owner.end(); });

  test("coordenador agrega sessões, evidências e presença do período", async () => {
    const payload = await withTenant(ctx("coordenador", COORD), (tx) =>
      buildConvenioBrutoPayload(tx, { patientId: PAC, nomePaciente: "Miguel S.", periodoInicio: "2026-06-01", periodoFim: "2026-06-30" }));
    expect(payload.sessoes).toHaveLength(1);
    expect(payload.sessoes[0]!.terapeuta).toBe("Dra. Ana");
    expect(payload.evidencias).toHaveLength(1);
    expect(payload.evidencias[0]!.metaOuDominio).toBe("Mando");
    expect(payload.presenca.sessoesRealizadas).toBe(1);
  });

  test("exclui dados fora do período", async () => {
    const payload = await withTenant(ctx("coordenador", COORD), (tx) =>
      buildConvenioBrutoPayload(tx, { patientId: PAC, nomePaciente: "Miguel S.", periodoInicio: "2026-05-01", periodoFim: "2026-05-31" }));
    expect(payload.sessoes).toHaveLength(0);
    expect(payload.evidencias).toHaveLength(0);
  });
});
