import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { hasDb } from "@tests/integration-env";
import {
  solicitarExportacao,
  processarProximo,
  expirarVencidos,
  obterHistoricoExportacoes,
  NaoAutorizadoExportacaoError,
  ExportacaoEmAndamentoError,
} from "./motor";

const { authDb } = await import("@/db/client");

describe.skipIf(!hasDb)("Motor de Estado da Exportação (Task T4)", () => {
  it("ciclo completo: solicita, processa em background, conclui com token e audita", async () => {
    const clinicId = crypto.randomUUID();
    const donoId = crypto.randomUUID();
    const outroUser = crypto.randomUUID();

    await authDb.execute(sql`
      INSERT INTO clinic (id, nome, responsavel_conta_id) VALUES (${clinicId}, 'Clínica Motor Test', ${donoId});
      INSERT INTO app_user (id, name, email) VALUES
        (${donoId}, 'Dono Conta', ${`d_${donoId}@test.local`}),
        (${outroUser}, 'Outro Coordenador', ${`o_${outroUser}@test.local`});
      INSERT INTO user_role (user_id, clinic_id, role) VALUES
        (${donoId}, ${clinicId}, 'coordenador'),
        (${outroUser}, ${clinicId}, 'coordenador');
      INSERT INTO patient (id, clinic_id, nome) VALUES (${crypto.randomUUID()}, ${clinicId}, 'Paciente 1');
    `);

    try {
      // 1. Não-responsável tenta solicitar -> 403 / NaoAutorizadoExportacaoError
      await expect(
        solicitarExportacao(clinicId, outroUser, "coordenador"),
      ).rejects.toThrow(NaoAutorizadoExportacaoError);

      // 2. Responsável solicita -> Cria bundle pendente
      const { bundleId, status } = await solicitarExportacao(
        clinicId,
        donoId,
        "coordenador",
      );
      expect(bundleId).toBeDefined();
      expect(status).toBe("pendente");

      // 3. Tentar solicitar novamente enquanto ativo -> Erro uq_export_bundle_ativo
      await expect(
        solicitarExportacao(clinicId, donoId, "coordenador"),
      ).rejects.toThrow(ExportacaoEmAndamentoError);

      // 4. Executa processarProximo()
      const procResult = await processarProximo();
      expect(procResult.processado).toBe(true);
      expect(procResult.status).toBe("pronto");
      expect(procResult.bundleId).toBe(bundleId);
      expect(procResult.token).toBeDefined();

      // Verifica no banco se o bundle está pronto com blob
      const rows = (await authDb.execute(sql`
        SELECT b.status, b.sha256, b.bytes_tamanho, b.expira_em, length(blob.bytes) as blob_len
          FROM export_bundle b
          JOIN export_bundle_blob blob ON blob.bundle_id = b.id
         WHERE b.id = ${bundleId}
      `)) as unknown as {
        status: string;
        sha256: string;
        bytes_tamanho: string;
        blob_len: number;
      }[];
      expect(rows[0]!.status).toBe("pronto");
      expect(rows[0]!.blob_len).toBeGreaterThan(0);

      // Verifica histórico
      const hist = await obterHistoricoExportacoes(
        clinicId,
        donoId,
        "coordenador",
      );
      expect(hist.historico.length).toBe(1);
      expect(hist.historico[0]!.podeBaixar).toBe(true);

      // 5. Simula expiração: ajusta expira_em para o passado e roda expirarVencidos
      await authDb.execute(sql`
        UPDATE export_bundle SET expira_em = now() - interval '1 hour' WHERE id = ${bundleId}
      `);

      const expResult = await expirarVencidos();
      expect(expResult.expirados).toBe(1);

      // Verifica que o blob foi descartado mas a linha continua como 'expirado'
      const rowsPosExp = (await authDb.execute(sql`
        SELECT b.status, (SELECT count(*) FROM export_bundle_blob WHERE bundle_id = b.id) as blob_count
          FROM export_bundle b
         WHERE b.id = ${bundleId}
      `)) as unknown as { status: string; blob_count: string }[];
      expect(rowsPosExp[0]!.status).toBe("expirado");
      expect(Number(rowsPosExp[0]!.blob_count)).toBe(0);

      // Verifica auditoria completa
      const auditRows = (await authDb.execute(sql`
        SELECT acao FROM audit_log WHERE entidade_id = ${bundleId} ORDER BY criado_em ASC
      `)) as unknown as { acao: string }[];
      const acoes = auditRows.map((a) => a.acao);
      expect(acoes).toContain("exportacao_integral_solicitada");
      expect(acoes).toContain("exportacao_integral_concluida");
      expect(acoes).toContain("exportacao_integral_expirada");
    } finally {
      await authDb.execute(sql`
        DELETE FROM audit_log WHERE clinic_id = ${clinicId};
        DELETE FROM export_bundle WHERE clinic_id = ${clinicId};
        DELETE FROM patient WHERE clinic_id = ${clinicId};
        DELETE FROM user_role WHERE clinic_id = ${clinicId};
        DELETE FROM app_user WHERE id IN (${donoId}, ${outroUser});
        DELETE FROM clinic WHERE id = ${clinicId};
      `);
    }
  });
});
