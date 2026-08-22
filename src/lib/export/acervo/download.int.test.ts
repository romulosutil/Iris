import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { hasDb } from "@tests/integration-env";
import { withTenant } from "@/db/rls";
import { sha256Hex } from "@/lib/report/hash";
import { baixarBundleAcervo } from "./download";

const { authDb } = await import("@/db/client");

describe.skipIf(!hasDb)("Download Seguro do Acervo (Task T6)", () => {
  it("valida todas as regras de segurança e autenticação do download", async () => {
    const clinicA = crypto.randomUUID();
    const clinicB = crypto.randomUUID();
    const donoA = crypto.randomUUID();
    const outroUserA = crypto.randomUUID();
    const donoB = crypto.randomUUID();
    const bundleId = crypto.randomUUID();

    const tokenValido = "token_de_teste_seguro_123456";
    const tokenHash = sha256Hex(Buffer.from(tokenValido));
    const zipBytes = Buffer.from("PK\x03\x04fake_zip_bytes");

    await authDb.execute(sql`
      INSERT INTO clinic (id, nome, responsavel_conta_id) VALUES
        (${clinicA}, 'Clínica A', ${donoA}),
        (${clinicB}, 'Clínica B', ${donoB});
      INSERT INTO app_user (id, name, email) VALUES
        (${donoA}, 'Dono A', ${`da_${donoA}@test.local`}),
        (${outroUserA}, 'Outro A', ${`oa_${outroUserA}@test.local`}),
        (${donoB}, 'Dono B', ${`db_${donoB}@test.local`});
      INSERT INTO user_role (user_id, clinic_id, role) VALUES
        (${donoA}, ${clinicA}, 'coordenador'),
        (${outroUserA}, ${clinicA}, 'coordenador'),
        (${donoB}, ${clinicB}, 'coordenador');

      INSERT INTO export_bundle (id, clinic_id, solicitado_por, status, sha256, bytes_tamanho, token_hash, manifest, expira_em)
      VALUES (
        ${bundleId},
        ${clinicA},
        ${donoA},
        'pronto',
        ${sha256Hex(zipBytes)},
        ${zipBytes.length},
        ${tokenHash},
        '{"escopo":"integral"}'::jsonb,
        now() + interval '72 hours'
      );

      INSERT INTO export_bundle_blob (bundle_id, bytes) VALUES (${bundleId}, ${zipBytes}::bytea);
    `);

    try {
      // 1. Download com token válido pelo dono -> Sucesso
      const resValido = await withTenant(
        { clinicId: clinicA, userId: donoA, role: "coordenador" },
        (tx) =>
          baixarBundleAcervo(tx, {
            bundleId,
            token: tokenValido,
            userId: donoA,
            userRole: "coordenador",
          }),
      );
      expect(resValido.sucesso).toBe(true);
      if (resValido.sucesso) {
        expect(resValido.bytes.toString()).toBe(zipBytes.toString());
        expect(resValido.filename).toContain("acervo-clinica-a");
      }

      // Verifica audit_log
      const audit = (await authDb.execute(sql`
        SELECT acao, ator_id FROM audit_log WHERE entidade_id = ${bundleId} AND acao = 'exportacao_integral_download'
      `)) as unknown as { acao: string; ator_id: string }[];
      expect(audit.length).toBe(1);
      expect(audit[0]!.ator_id).toBe(donoA);

      // 2. Token inválido -> 404
      const resTokenErrado = await withTenant(
        { clinicId: clinicA, userId: donoA, role: "coordenador" },
        (tx) =>
          baixarBundleAcervo(tx, {
            bundleId,
            token: "token_completamente_errado",
            userId: donoA,
            userRole: "coordenador",
          }),
      );
      expect(resTokenErrado.sucesso).toBe(false);
      if (!resTokenErrado.sucesso) {
        expect(resTokenErrado.statusHttp).toBe(404);
      }

      // 3. Outro usuário da mesma clínica -> 403
      const resOutroUser = await withTenant(
        { clinicId: clinicA, userId: outroUserA, role: "coordenador" },
        (tx) =>
          baixarBundleAcervo(tx, {
            bundleId,
            token: tokenValido,
            userId: outroUserA,
            userRole: "coordenador",
          }),
      );
      expect(resOutroUser.sucesso).toBe(false);
      if (!resOutroUser.sucesso) {
        expect(resOutroUser.statusHttp).toBe(403);
      }

      // 4. Usuário de outra clínica -> 404 (RLS oculta o bundle)
      const resOutraClinica = await withTenant(
        { clinicId: clinicB, userId: donoB, role: "coordenador" },
        (tx) =>
          baixarBundleAcervo(tx, {
            bundleId,
            token: tokenValido,
            userId: donoB,
            userRole: "coordenador",
          }),
      );
      expect(resOutraClinica.sucesso).toBe(false);
      if (!resOutraClinica.sucesso) {
        expect(resOutraClinica.statusHttp).toBe(404);
      }

      // 5. Bundle expirado -> 410
      await authDb.execute(sql`
        UPDATE export_bundle SET expira_em = now() - interval '1 hour' WHERE id = ${bundleId}
      `);

      const resExpirado = await withTenant(
        { clinicId: clinicA, userId: donoA, role: "coordenador" },
        (tx) =>
          baixarBundleAcervo(tx, {
            bundleId,
            token: tokenValido,
            userId: donoA,
            userRole: "coordenador",
          }),
      );
      expect(resExpirado.sucesso).toBe(false);
      if (!resExpirado.sucesso) {
        expect(resExpirado.statusHttp).toBe(410);
      }
    } finally {
      await authDb.execute(sql`
        DELETE FROM audit_log WHERE clinic_id IN (${clinicA}, ${clinicB});
        DELETE FROM export_bundle WHERE clinic_id IN (${clinicA}, ${clinicB});
        DELETE FROM user_role WHERE clinic_id IN (${clinicA}, ${clinicB});
        DELETE FROM app_user WHERE id IN (${donoA}, ${outroUserA}, ${donoB});
        DELETE FROM clinic WHERE id IN (${clinicA}, ${clinicB});
      `);
    }
  });
});
