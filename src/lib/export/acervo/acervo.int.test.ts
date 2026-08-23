import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { unzipSync, strFromU8 } from "fflate";
import { hasDb } from "@tests/integration-env";
import { withTenant } from "@/db/rls";
import {
  solicitarExportacao,
  processarProximo,
  expirarVencidos,
} from "./motor";
import { baixarBundleAcervo } from "./download";
import { TABELAS_NEGADAS } from "./coletor";

const { authDb } = await import("@/db/client");

describe.skipIf(!hasDb)(
  "Conformidade e Isolamento do Acervo Integral (Task T8, #374)",
  () => {
    it("D10: funciona com conta em somente-leitura (trial expirado / cancelada)", async () => {
      const clinicId = crypto.randomUUID();
      const donoId = crypto.randomUUID();
      const pacId = crypto.randomUUID();

      // Cria clínica já com trial expirado no passado (somente-leitura)
      await authDb.execute(sql`
        INSERT INTO clinic (id, nome, responsavel_conta_id, trial_comeco_em, trial_dias)
        VALUES (${clinicId}, 'Clínica Somente Leitura', ${donoId}, now() - interval '30 days', 7);
      `);
      await authDb.execute(sql`
        INSERT INTO app_user (id, name, email)
        VALUES (${donoId}, 'Dono Conta ReadOnly', ${`d_ro_${donoId}@test.local`});
      `);
      await authDb.execute(sql`
        INSERT INTO user_role (user_id, clinic_id, role)
        VALUES (${donoId}, ${clinicId}, 'coordenador');
      `);
      await authDb.execute(sql`
        INSERT INTO patient (id, clinic_id, nome, cpf, cpf_hash)
        VALUES (${pacId}, ${clinicId}, 'Paciente Em ReadOnly', '12345678900', 'hash_blind_123');
      `);

      try {
        // Solicita exportação com a conta em somente-leitura
        const { bundleId, status } = await solicitarExportacao(
          clinicId,
          donoId,
          "coordenador",
        );
        expect(status).toBe("pendente");

        // Background worker processa
        const proc = await processarProximo();
        expect(proc.processado).toBe(true);
        expect(proc.status).toBe("pronto");
        expect(proc.bundleId).toBe(bundleId);
        expect(proc.token).toBeDefined();

        // Faz download com token
        const downloadRes = await withTenant(
          { clinicId, userId: donoId, role: "coordenador" },
          (tx) =>
            baixarBundleAcervo(tx, {
              bundleId,
              clinicId,
              token: proc.token!,
              userId: donoId,
              userRole: "coordenador",
            }),
        );

        expect(downloadRes.sucesso).toBe(true);
        if (downloadRes.sucesso) {
          expect(downloadRes.bytes.length).toBeGreaterThan(0);
        }
      } finally {
        await authDb.execute(sql`
          DELETE FROM audit_log WHERE clinic_id = ${clinicId};
        `);
        await authDb.execute(sql`
          DELETE FROM export_bundle WHERE clinic_id = ${clinicId};
        `);
        await authDb.execute(sql`
          DELETE FROM patient WHERE clinic_id = ${clinicId};
        `);
        await authDb.execute(sql`
          DELETE FROM user_role WHERE clinic_id = ${clinicId};
        `);
        await authDb.execute(sql`
          DELETE FROM app_user WHERE id = ${donoId};
        `);
        await authDb.execute(sql`
          DELETE FROM clinic WHERE id = ${clinicId};
        `);
      }
    });

    it("Negação estrita no ZIP montado: credenciais, tabelas negadas e cpf_hash ausentes", async () => {
      const clinicId = crypto.randomUUID();
      const donoId = crypto.randomUUID();
      const pacId = crypto.randomUUID();

      await authDb.execute(sql`
        INSERT INTO clinic (id, nome, responsavel_conta_id)
        VALUES (${clinicId}, 'Clínica Negação Test', ${donoId});
      `);
      await authDb.execute(sql`
        INSERT INTO app_user (id, name, email)
        VALUES (${donoId}, 'Dono Negação', ${`d_neg_${donoId}@test.local`});
      `);
      await authDb.execute(sql`
        INSERT INTO user_role (user_id, clinic_id, role)
        VALUES (${donoId}, ${clinicId}, 'coordenador');
      `);
      await authDb.execute(sql`
        INSERT INTO patient (id, clinic_id, nome, cpf, cpf_hash)
        VALUES (${pacId}, ${clinicId}, 'Paciente Segredo', '99988877766', 'hash_blind_extremamente_secreto');
      `);

      try {
        const { bundleId } = await solicitarExportacao(
          clinicId,
          donoId,
          "coordenador",
        );
        const proc = await processarProximo();
        expect(proc.status).toBe("pronto");

        const downloadRes = await withTenant(
          { clinicId, userId: donoId, role: "coordenador" },
          (tx) =>
            baixarBundleAcervo(tx, {
              bundleId,
              clinicId,
              token: proc.token!,
              userId: donoId,
              userRole: "coordenador",
            }),
        );

        expect(downloadRes.sucesso).toBe(true);
        if (!downloadRes.sucesso) return;

        // Descompacta e varre arquivos reais do ZIP
        const unzipped = unzipSync(new Uint8Array(downloadRes.bytes));
        const caminhos = Object.keys(unzipped);

        // 1. Nenhuma tabela da lista de negação existe como arquivo .ndjson
        for (const tabelaNegada of TABELAS_NEGADAS) {
          const caminhoNegado = `dados/${tabelaNegada}.ndjson`;
          expect(
            caminhos,
            `Arquivo ${caminhoNegado} NUNCA deve existir no ZIP`,
          ).not.toContain(caminhoNegado);
        }

        // 2. patient.ndjson não contém a chave 'cpf_hash' nem o valor do hash
        const patientNdjson = strFromU8(unzipped["dados/patient.ndjson"]!);
        expect(patientNdjson).toContain("Paciente Segredo");
        expect(patientNdjson).toContain("99988877766");
        expect(patientNdjson).not.toContain("cpf_hash");
        expect(patientNdjson).not.toContain("hash_blind_extremamente_secreto");

        // 3. app_user.ndjson contém apenas colunas projetadas (id, name, email, created_at)
        const userNdjson = strFromU8(unzipped["dados/app_user.ndjson"]!);
        expect(userNdjson).toContain("Dono Negação");
        expect(userNdjson).not.toContain("password");
        expect(userNdjson).not.toContain("twoFactorSecret");
      } finally {
        await authDb.execute(sql`
          DELETE FROM audit_log WHERE clinic_id = ${clinicId};
        `);
        await authDb.execute(sql`
          DELETE FROM export_bundle WHERE clinic_id = ${clinicId};
        `);
        await authDb.execute(sql`
          DELETE FROM patient WHERE clinic_id = ${clinicId};
        `);
        await authDb.execute(sql`
          DELETE FROM user_role WHERE clinic_id = ${clinicId};
        `);
        await authDb.execute(sql`
          DELETE FROM app_user WHERE id = ${donoId};
        `);
        await authDb.execute(sql`
          DELETE FROM clinic WHERE id = ${clinicId};
        `);
      }
    });

    it("Auditoria completa: emite as 5 ações em audit_log ao longo do ciclo de vida", async () => {
      const clinicId = crypto.randomUUID();
      const donoId = crypto.randomUUID();

      await authDb.execute(sql`
        INSERT INTO clinic (id, nome, responsavel_conta_id)
        VALUES (${clinicId}, 'Clínica Trilha Audit', ${donoId});
      `);
      await authDb.execute(sql`
        INSERT INTO app_user (id, name, email)
        VALUES (${donoId}, 'Dono Audit', ${`d_aud_${donoId}@test.local`});
      `);
      await authDb.execute(sql`
        INSERT INTO user_role (user_id, clinic_id, role)
        VALUES (${donoId}, ${clinicId}, 'coordenador');
      `);

      try {
        // 1. Solicitada
        const { bundleId } = await solicitarExportacao(
          clinicId,
          donoId,
          "coordenador",
        );

        // 2. Concluída
        const proc = await processarProximo();
        expect(proc.status).toBe("pronto");

        // 3. Download
        await withTenant(
          { clinicId, userId: donoId, role: "coordenador" },
          (tx) =>
            baixarBundleAcervo(tx, {
              bundleId,
              clinicId,
              token: proc.token!,
              userId: donoId,
              userRole: "coordenador",
            }),
        );

        // 4. Expirada
        await authDb.execute(sql`
          UPDATE export_bundle SET expira_em = now() - interval '1 hour' WHERE id = ${bundleId}
        `);
        await expirarVencidos();

        // 5. Falha simulada para verificar a 5ª ação
        const bundleFalhaId = crypto.randomUUID();
        await authDb.execute(sql`
          INSERT INTO export_bundle (id, clinic_id, solicitado_por, status, tentativas)
          VALUES (${bundleFalhaId}, ${clinicId}, ${donoId}, 'pendente', 3);
        `);
        await processarProximo(); // Tentativas esgotadas -> falha

        // Confere todas as 5 ações em audit_log
        const auditRows = (await authDb.execute(sql`
          SELECT acao FROM audit_log WHERE clinic_id = ${clinicId} ORDER BY criado_em ASC
        `)) as unknown as { acao: string }[];
        const acoes = auditRows.map((r) => r.acao);

        expect(acoes).toContain("exportacao_integral_solicitada");
        expect(acoes).toContain("exportacao_integral_concluida");
        expect(acoes).toContain("exportacao_integral_download");
        expect(acoes).toContain("exportacao_integral_expirada");
        expect(acoes).toContain("exportacao_integral_falhou");
      } finally {
        await authDb.execute(sql`
          DELETE FROM audit_log WHERE clinic_id = ${clinicId};
        `);
        await authDb.execute(sql`
          DELETE FROM export_bundle WHERE clinic_id = ${clinicId};
        `);
        await authDb.execute(sql`
          DELETE FROM user_role WHERE clinic_id = ${clinicId};
        `);
        await authDb.execute(sql`
          DELETE FROM app_user WHERE id = ${donoId};
        `);
        await authDb.execute(sql`
          DELETE FROM clinic WHERE id = ${clinicId};
        `);
      }
    });
  },
);
