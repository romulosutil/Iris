import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { hasDb } from "@tests/integration-env";
import { withTenant } from "@/db/rls";
import { coletarAcervo } from "./coletor";

const { authDb } = await import("@/db/client");

describe.skipIf(!hasDb)("coletarAcervo (integração RLS e isolamento)", () => {
  it("coleta apenas dados do próprio tenant e exclui soft-delete / cpf_hash", async () => {
    const clinicA = crypto.randomUUID();
    const clinicB = crypto.randomUUID();
    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    const pacA1 = crypto.randomUUID();
    const pacB1 = crypto.randomUUID();

    // 1. Seed básico em authDb (dona)
    await authDb.execute(sql`
      INSERT INTO clinic (id, nome) VALUES (${clinicA}, 'Clínica A'), (${clinicB}, 'Clínica B');
      INSERT INTO app_user (id, name, email) VALUES (${userA}, 'User A', ${`a_${userA}@test.local`}), (${userB}, 'User B', ${`b_${userB}@test.local`});
      INSERT INTO user_role (user_id, clinic_id, role) VALUES (${userA}, ${clinicA}, 'coordenador'), (${userB}, ${clinicB}, 'coordenador');
      
      INSERT INTO patient (id, clinic_id, nome, cpf, cpf_hash)
      VALUES (${pacA1}, ${clinicA}, 'Paciente A1', '11111111111', 'hash_secreto_a1'),
             (${pacB1}, ${clinicB}, 'Paciente B1', '22222222222', 'hash_secreto_b1');

      -- Relatório ativo e relatório deletado (soft delete)
      INSERT INTO report (id, clinic_id, patient_id, tipo, periodo_inicio, periodo_fim, payload)
      VALUES (${crypto.randomUUID()}, ${clinicA}, ${pacA1}, 'familia', '2026-01-01', '2026-01-31', '{"resumo":"ativo"}'::jsonb),
             (${crypto.randomUUID()}, ${clinicA}, ${pacA1}, 'familia', '2026-01-01', '2026-01-31', '{"resumo":"deletado"}'::jsonb);
    `);

    // Marca o 2º relatório como deletado
    await authDb.execute(sql`
      UPDATE report SET deletado_em = now() WHERE payload->>'resumo' = 'deletado';
    `);

    try {
      // 2. Executa coleta sob withTenant da Clínica A
      const resultado = await withTenant(
        { clinicId: clinicA, userId: userA, role: "coordenador" },
        async (tx) => {
          return coletarAcervo(tx);
        },
      );

      // Asserções
      expect(resultado.tabelas.length).toBe(37);

      // Pacientes da Clínica A
      const tabelaPatient = resultado.tabelas.find(
        (t) => t.tabela === "patient",
      )!;
      expect(tabelaPatient.total).toBe(1);
      expect(tabelaPatient.ndjson).toContain("Paciente A1");
      expect(tabelaPatient.ndjson).not.toContain("Paciente B1");
      expect(tabelaPatient.ndjson).not.toContain("hash_secreto"); // cpf_hash excluído

      // Usuários
      const tabelaUser = resultado.tabelas.find(
        (t) => t.tabela === "app_user",
      )!;
      expect(tabelaUser.ndjson).toContain("User A");
      expect(tabelaUser.ndjson).not.toContain("User B");

      // Relatórios (soft-delete excluído)
      const tabelaReport = resultado.tabelas.find(
        (t) => t.tabela === "report",
      )!;
      expect(tabelaReport.total).toBe(1);
      expect(tabelaReport.ndjson).toContain("ativo");
      expect(tabelaReport.ndjson).not.toContain("deletado");
    } finally {
      // Cleanup
      await authDb.execute(sql`
        DELETE FROM report WHERE clinic_id IN (${clinicA}, ${clinicB});
        DELETE FROM patient WHERE clinic_id IN (${clinicA}, ${clinicB});
        DELETE FROM user_role WHERE clinic_id IN (${clinicA}, ${clinicB});
        DELETE FROM app_user WHERE id IN (${userA}, ${userB});
        DELETE FROM clinic WHERE id IN (${clinicA}, ${clinicB});
      `);
    }
  });
});
