import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { hasDb } from "@tests/integration-env";

vi.mock("server-only", () => ({}));

const { getSuperAdminKpis, getSuperAdminClinicas, getSuperAdminSaude } =
  await import("./queries");

const C1 = "33333333-3333-3333-3333-333333333333";
const C2 = "44444444-4444-4444-4444-444444444444";
const U_DONO1 = "b0000000-0000-0000-0000-000000000001";
const U_DONO2 = "b0000000-0000-0000-0000-000000000002";
const P1 = "00000000-0000-0000-0000-000000000001";
const P2 = "00000000-0000-0000-0000-000000000002";
const P3_ARQUIVADO = "00000000-0000-0000-0000-000000000003";

let owner: ReturnType<typeof postgres>;

describe.skipIf(!hasDb)(
  "Super Admin Queries — Zero-Knowledge LGPD & Metrics (#184)",
  () => {
    beforeAll(async () => {
      owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
      await owner`TRUNCATE clinic, app_user, subscription, patient, asaas_webhook_event RESTART IDENTITY CASCADE`;

      await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_DONO1}, 'Dono Clínica Alfa', 'dono@alfa.test'),
      (${U_DONO2}, 'Dono Clínica Beta', 'dono@beta.test')`;

      await owner`INSERT INTO clinic (id, nome, responsavel_conta_id, isento_trial, trial_dias) VALUES
      (${C1}, 'Clínica Alfa', ${U_DONO1}, true, 7),
      (${C2}, 'Clínica Beta', ${U_DONO2}, false, 14)`;

      await owner`INSERT INTO subscription (clinic_id, status, provider) VALUES
      (${C1}, 'active', 'asaas'),
      (${C2}, 'free_tier', NULL)`;

      await owner`INSERT INTO patient (id, clinic_id, nome, nascimento) VALUES
      (${P1}, ${C1}, 'Paciente Alfa 1 (LGPD)', '2015-01-01'),
      (${P2}, ${C2}, 'Paciente Beta 1 (LGPD)', '2018-05-10'),
      (${P3_ARQUIVADO}, ${C2}, 'Paciente Beta 2 Arquivado', '2019-09-09')`;

      await owner`UPDATE patient SET arquivado_em = now() WHERE id = ${P3_ARQUIVADO}`;

      await owner`INSERT INTO asaas_webhook_event (asaas_event_id, evento, payload) VALUES
      ('evt_123', 'PAYMENT_RECEIVED', '{"test": true}')`;
    });

    afterAll(async () => {
      if (owner) await owner.end();
    });

    test("getSuperAdminKpis calcula métricas agregadas corretamente", async () => {
      const kpis = await getSuperAdminKpis();

      expect(kpis.clinicasAtivas).toBe(1); // C1 isenta (ativa)
      expect(kpis.clinicasIsentas).toBe(1);
      expect(kpis.clinicasEmTrial).toBe(1); // C2 em trial
      expect(kpis.fichasNaBaseTotais).toBe(2); // P1 em C1 + P2 em C2 (P3 arquivado não conta)
      expect(kpis.mrrEstimadoCentavos).toBe(3900); // C2 em trial com 1 paciente ativo = 3900 centavos
    });

    test("getSuperAdminClinicas retorna lista de clínicas sem vazar PII de pacientes", async () => {
      const clinicas = await getSuperAdminClinicas();

      expect(clinicas.length).toBe(2);

      const alfa = clinicas.find((c) => c.id === C1);
      const beta = clinicas.find((c) => c.id === C2);

      expect(alfa).toBeDefined();
      expect(alfa?.nome).toBe("Clínica Alfa");
      expect(alfa?.donoEmail).toBe("dono@alfa.test");
      expect(alfa?.status).toBe("isenta");
      expect(alfa?.fichasNaBaseCount).toBe(1);

      expect(beta).toBeDefined();
      expect(beta?.nome).toBe("Clínica Beta");
      expect(beta?.status).toBe("trial");
      expect(beta?.fichasNaBaseCount).toBe(1);

      // Garantia estrita de contracheque: nenhum objeto contém nome de paciente ou dados clínicos
      const stringified = JSON.stringify(clinicas);
      expect(stringified).not.toContain("Paciente Alfa");
      expect(stringified).not.toContain("Paciente Beta");
    });

    test("getSuperAdminSaude retorna histórico de webhooks e monitoramento", async () => {
      const saude = await getSuperAdminSaude();

      expect(saude.webhooksAsaas.totalRecebidos).toBeGreaterThanOrEqual(1);
      expect(
        saude.webhooksAsaas.ultimosEventos.some(
          (e) => e.asaasEventId === "evt_123",
        ),
      ).toBe(true);
      expect(saude.alertasRisco).toBeDefined();
      expect(typeof saude.alertasRisco.totalAlertas).toBe("number");
      expect(Array.isArray(saude.alertasRisco.ultimosAlertas)).toBe(true);
    });
  },
);
