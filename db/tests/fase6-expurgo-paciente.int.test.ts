/**
 * Teste de integração da Fase 6.3 — Retenção & Expurgo (migração 0045).
 * Cobre `app_purgar_paciente` (erasure LGPD com trilha pseudonimizada) e o
 * helper de elegibilidade `app_paciente_expurgavel`. Roda com `pnpm test:rls`.
 * Auto-skip sem DB.
 *
 * Regras provadas:
 *  - só coordenador da clínica do paciente purga (guard de papel + tenant);
 *  - erasure físico do paciente e de TODOS os descendentes (FKs restrict/
 *    no-action que bloqueariam um DELETE ingênuo);
 *  - A3/R6.3.2: a trilha do sujeito é PSEUDONIMIZADA (patient_id → NULL,
 *    detalhe sem PII), NÃO deletada — compliance preservado sem dado pessoal;
 *  - imutabilidade de audit_log intacta: app_role continua sem UPDATE direto
 *    (só a função SECURITY DEFINER, dona BYPASSRLS, pseudonimiza).
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "../../src/db/rls";

const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;
const owner = hasDb ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 }) : null;

const CLINIC_A = "00000000-0000-0000-0000-00000000000a";
const CLINIC_B = "00000000-0000-0000-0000-00000000000b";
const U_COORD_A = "00000000-0000-0000-0000-0000000000c1";
const U_TER_A = "00000000-0000-0000-0000-0000000000a1";
const P1 = "00000000-0000-0000-0000-0000000000d1"; // sujeito do expurgo (clínica A)
const P2 = "00000000-0000-0000-0000-0000000000d2"; // clínica B (teste cross-tenant)
const P_UNDER = "00000000-0000-0000-0000-0000000000d3"; // sob retenção
const P_PAST = "00000000-0000-0000-0000-0000000000d4"; // retenção vencida
const R1 = "00000000-0000-0000-0000-0000000000f1";
const AUDIT_H1 = "00000000-0000-0000-0000-000000000e01"; // trilha histórica do sujeito
const AUDIT_H2 = "00000000-0000-0000-0000-000000000e02";

const ctx = (role: string, userId: string, clinicId = CLINIC_A) =>
  ({ role, userId, clinicId }) as TenantContext;

describe.skipIf(!hasDb)("fase6.3 · app_purgar_paciente + retenção", () => {
  beforeAll(async () => {
    await owner!`TRUNCATE report, report_pdf, audit_log, consent, patient RESTART IDENTITY CASCADE`;
    await owner!`TRUNCATE clinic, app_user, user_role RESTART IDENTITY CASCADE`;
    await owner!`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'Clínica A'), (${CLINIC_B}, 'Clínica B')`;
    await owner!`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord-a@fase6-expurgo.test'),
      (${U_TER_A}, 'Ter A', 'ter-a@fase6-expurgo.test')`;
    await owner!`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_TER_A}, ${CLINIC_A}, 'terapeuta')`;
    // Sujeito (clínica A) + subárvore bloqueante: consent (restrict) + report
    // (no-action) + report_pdf (cascade sob report).
    await owner!`INSERT INTO patient (id, clinic_id, nome) VALUES (${P1}, ${CLINIC_A}, 'Paciente 1')`;
    await owner!`INSERT INTO consent (patient_id, tipo, responsavel_signatario, versao_termo)
      VALUES (${P1}, 'tratamento_dados_menor', 'Mãe', 'v1')`;
    await owner!`INSERT INTO report (id, clinic_id, patient_id, tipo, periodo_inicio, periodo_fim, status, payload)
      VALUES (${R1}, ${CLINIC_A}, ${P1}, 'familia', '2026-01-01', '2026-01-31', 'rascunho', '{}')`;
    await owner!`INSERT INTO report_pdf (report_id, bytes, hash) VALUES (${R1}, '\\x00', 'hash-r1')`;
    // Trilha histórica do sujeito (com PII em detalhe) — deve sobreviver
    // pseudonimizada ao expurgo.
    await owner!`INSERT INTO audit_log (id, clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe) VALUES
      (${AUDIT_H1}, ${CLINIC_A}, ${U_COORD_A}, 'relatorio_exportado', 'report', ${R1}, ${P1}, '{"hash":"h","pii":"Paciente 1"}'),
      (${AUDIT_H2}, ${CLINIC_A}, ${U_COORD_A}, 'consentimento_registrado', 'consent', ${P1}, ${P1}, '{"pii":"Mãe"}')`;
    // Paciente da clínica B (cross-tenant).
    await owner!`INSERT INTO patient (id, clinic_id, nome) VALUES (${P2}, ${CLINIC_B}, 'Paciente B')`;
    // Elegibilidade: menor sob retenção vs adulto com retenção vencida.
    await owner!`INSERT INTO patient (id, clinic_id, nome, nascimento, alta_em) VALUES
      (${P_UNDER}, ${CLINIC_A}, 'Menor', '2020-01-01', '2024-01-01'),
      (${P_PAST}, ${CLINIC_A}, 'Adulto', '1990-01-01', '2005-01-01')`;
  });
  afterAll(async () => {
    await owner?.end();
  });

  test("app_role NÃO consegue UPDATE direto em audit_log (imutabilidade LGPD)", async () => {
    await expect(
      withTenant(ctx("coordenador", U_COORD_A), (db) =>
        db.execute(sql`UPDATE audit_log SET patient_id = NULL WHERE id = ${AUDIT_H1}::uuid`),
      ),
    ).rejects.toThrow();
  });

  test("terapeuta não pode purgar paciente", async () => {
    await expect(
      withTenant(ctx("terapeuta", U_TER_A), (db) =>
        db.execute(sql`SELECT app_purgar_paciente(${P1}::uuid, 'x')`),
      ),
    ).rejects.toThrow();
  });

  test("coordenador não purga paciente de outra clínica", async () => {
    await expect(
      withTenant(ctx("coordenador", U_COORD_A), (db) =>
        db.execute(sql`SELECT app_purgar_paciente(${P2}::uuid, 'x')`),
      ),
    ).rejects.toThrow();
  });

  test("paciente inexistente é rejeitado", async () => {
    await expect(
      withTenant(ctx("coordenador", U_COORD_A), (db) =>
        db.execute(sql`SELECT app_purgar_paciente('00000000-0000-0000-0000-0000000000ff'::uuid, 'x')`),
      ),
    ).rejects.toThrow();
  });

  test("elegibilidade: menor sob retenção = false; adulto vencido = true", async () => {
    const under = await withTenant(ctx("coordenador", U_COORD_A), (db) =>
      db.execute(sql`SELECT app_paciente_expurgavel(${P_UNDER}::uuid)::text AS elig`),
    );
    const past = await withTenant(ctx("coordenador", U_COORD_A), (db) =>
      db.execute(sql`SELECT app_paciente_expurgavel(${P_PAST}::uuid)::text AS elig`),
    );
    expect(under[0]?.elig).toBe("false");
    expect(past[0]?.elig).toBe("true");
  });

  test("coordenador purga: erasure físico + trilha pseudonimizada (não deletada)", async () => {
    await withTenant(ctx("coordenador", U_COORD_A), (db) =>
      db.execute(sql`SELECT app_purgar_paciente(${P1}::uuid, 'fim de retenção')`),
    );

    // erasure físico do paciente e descendentes bloqueantes
    expect(await owner!`SELECT 1 FROM patient WHERE id = ${P1}`).toHaveLength(0);
    expect(await owner!`SELECT 1 FROM consent WHERE patient_id = ${P1}`).toHaveLength(0);
    expect(await owner!`SELECT 1 FROM report WHERE patient_id = ${P1}`).toHaveLength(0);
    expect(await owner!`SELECT 1 FROM report_pdf WHERE report_id = ${R1}`).toHaveLength(0);

    // trilha histórica: SOBREVIVE, mas pseudonimizada (patient_id NULL, sem PII)
    const hist = await owner!`SELECT patient_id, detalhe FROM audit_log WHERE id IN (${AUDIT_H1}, ${AUDIT_H2}) ORDER BY id`;
    expect(hist).toHaveLength(2); // não deletada
    for (const row of hist) {
      expect(row.patient_id).toBeNull();
      expect(row.detalhe).toMatchObject({ pseudonimizado: true });
      expect(JSON.stringify(row.detalhe)).not.toContain("Paciente 1");
      expect(JSON.stringify(row.detalhe)).not.toContain("Mãe");
    }

    // nenhuma linha da trilha ainda aponta para o sujeito
    expect(await owner!`SELECT 1 FROM audit_log WHERE patient_id = ${P1}`).toHaveLength(0);

    // linha-fato do expurgo presente, já pseudônima (âncora = entidade_id)
    const fato = await owner!`SELECT patient_id, detalhe FROM audit_log
      WHERE acao = 'paciente_purgado' AND entidade_id = ${P1}`;
    expect(fato).toHaveLength(1);
    expect(fato[0]!.patient_id).toBeNull();
    expect(fato[0]!.detalhe).toMatchObject({ motivo: "fim de retenção", pseudonimizado: true });
  });
});
