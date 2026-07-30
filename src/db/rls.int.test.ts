/**
 * Teste de integração do RLS multi-tenant (Fase 1) contra Postgres real.
 * Roda com `pnpm test:rls` (vitest.integration.config.ts). Auto-skip sem DB.
 *
 * Prova os guardrails: admin_recepcao NÃO lê tabela clínica; terapeuta só vê
 * pacientes de equipe vigente; isolamento cross-clinic; escrita clínica negada
 * à recepção.
 */
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import {
  careTeamMembership,
  patient,
  patientClinicalProfile,
  patientProtocol,
  report,
  consent,
  session,
  sessionNote,
  extraction,
} from "./schema";
import { withTenant, type TenantContext } from "./rls";
import { sql as appSql } from "./client";
import { StubPdfRenderer } from "@/lib/report/renderer";
import type {
  CabecalhoConvenio,
  ConvenioNarrativoDraft,
} from "@/lib/report/convenio-narrativo/types";
import { hasDb } from "@tests/integration-env";

// Módulos "use server"/"server-only" precisam do mock antes do import dinâmico.
vi.mock("server-only", () => ({}));
const {
  gerarRascunhoConvenioNarrativo,
  curarConvenioNarrativo,
  exportarConvenioNarrativo,
} = await import("../app/(app)/relatorios/convenio-narrativo-logic");

// UUIDs fixos para determinismo.
const CLINIC_A = "11111111-1111-1111-1111-111111111111";
const CLINIC_B = "22222222-2222-2222-2222-222222222222";
const U_COORD = "a0000000-0000-0000-0000-000000000001";
const U_TERA = "a0000000-0000-0000-0000-000000000002"; // na equipe de P1
const U_TERA2 = "a0000000-0000-0000-0000-000000000003"; // sem equipe
const U_ADMIN = "a0000000-0000-0000-0000-000000000004";
const U_TERA3 = "a0000000-0000-0000-0000-000000000005"; // também na equipe de P1
const U_EXT = "a0000000-0000-0000-0000-000000000006"; // papel só na clínica B
const U_COORD_B = "a0000000-0000-0000-0000-000000000007"; // coordenador só na clínica B
const P1 = "b0000000-0000-0000-0000-000000000001"; // clinic A, equipe = TERA
const P2 = "b0000000-0000-0000-0000-000000000002"; // clinic A, sem equipe p/ TERA
const P3 = "b0000000-0000-0000-0000-000000000003"; // clinic B
const P4 = "b0000000-0000-0000-0000-000000000004"; // clinic A, sem profile, sem equipe
const PROT_A = "c0000000-0000-0000-0000-000000000001"; // protocolo da clínica A
const PROT_B = "c0000000-0000-0000-0000-000000000002"; // protocolo da clínica B
const CONSENT_P1 = "d0000000-0000-0000-0000-000000000001"; // clinic A, menor
const CONSENT_P2 = "d0000000-0000-0000-0000-000000000002"; // clinic A, adulto (#100)
const CONSENT_P3 = "d0000000-0000-0000-0000-000000000003"; // clinic B

const ctx = (
  role: TenantContext["role"],
  userId: string,
  clinicId = CLINIC_A,
) => ({ role, userId, clinicId }) satisfies TenantContext;

/**
 * Achata a cadeia `cause` de um erro rejeitado numa string. O drizzle embrulha
 * o erro do Postgres em "Failed query: ...", escondendo o texto que interessa
 * (ex.: "permission denied for table consent") em `cause`.
 */
async function capturarErro(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const partes: string[] = [];
    let atual: unknown = e;
    while (atual instanceof Error) {
      partes.push(atual.message);
      atual = atual.cause;
    }
    return partes.join(" | ");
  }
  throw new Error("esperava rejeição, mas a promise resolveu");
}

let owner: ReturnType<typeof postgres>;

describe.skipIf(!hasDb)("RLS multi-tenant — Fase 1", () => {
  beforeAll(async () => {
    // Seed como superuser (iris) — bypassa RLS.
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, patient, patient_clinical_profile, care_team_membership, protocol, patient_protocol, consent RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'Clínica A'), (${CLINIC_B}, 'Clínica B')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD}, 'Coord', 'coord@a.test'),
      (${U_TERA}, 'Tera', 'tera@a.test'),
      (${U_TERA2}, 'Tera2', 'tera2@a.test'),
      (${U_ADMIN}, 'Admin', 'admin@a.test'),
      (${U_TERA3}, 'Tera3', 'tera3@a.test'),
      (${U_EXT}, 'Ext', 'ext@b.test'),
      (${U_COORD_B}, 'CoordB', 'coordb@b.test')`;
    // Papéis por clínica (user_role): TERA3 é da clínica A; U_EXT só da B.
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC_A}, 'coordenador'),
      (${U_TERA3}, ${CLINIC_A}, 'terapeuta'),
      (${U_EXT}, ${CLINIC_B}, 'terapeuta'),
      (${U_COORD_B}, ${CLINIC_B}, 'coordenador')`;
    // Família do catálogo: semear explicitamente (idempotente). Outra suíte de
    // integração pode ter dado TRUNCATE ... CASCADE em protocol_familia_catalogo,
    // apagando o seed da migração — sem isto o FK protocol.familia falha.
    await owner`INSERT INTO protocol_familia_catalogo (id, nome) VALUES
      ('fonoaudiologia', 'Fonoaudiologia') ON CONFLICT (id) DO NOTHING`;
    // Protocolos por clínica (família do catálogo).
    await owner`INSERT INTO protocol (id, clinic_id, nome, disciplina, familia) VALUES
      (${PROT_A}, ${CLINIC_A}, 'Proto A', 'Fono', 'fonoaudiologia'),
      (${PROT_B}, ${CLINIC_B}, 'Proto B', 'Fono', 'fonoaudiologia')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${P1}, ${CLINIC_A}, 'Paciente 1'),
      (${P2}, ${CLINIC_A}, 'Paciente 2'),
      (${P3}, ${CLINIC_B}, 'Paciente 3'),
      (${P4}, ${CLINIC_A}, 'Paciente 4')`;
    await owner`INSERT INTO patient_clinical_profile (patient_id, diagnostico) VALUES
      (${P1}, 'hipótese TEA'), (${P2}, 'em avaliação')`;
    // TERA e TERA3 na equipe vigente de P1; TERA2 não; nenhum vínculo p/ P2.
    await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe) VALUES
      (${P1}, ${U_TERA}, 'ABA', 'terapeuta_referencia'),
      (${P1}, ${U_TERA3}, 'Fono', 'terapeuta_referencia')`;
    // consent (#100): um por clínica para provar isolamento cross-tenant, e
    // um do tipo novo (titular adulto, sem responsável) para provar que o
    // CHECK e a RLS convivem — a policy é agnóstica ao `tipo`.
    await owner`INSERT INTO consent (id, patient_id, tipo, responsavel_signatario, versao_termo) VALUES
      (${CONSENT_P1}, ${P1}, 'tratamento_dados_menor', 'Mãe do P1', 'v1'),
      (${CONSENT_P2}, ${P2}, 'autoconsentimento_titular_adulto', NULL, 'adulto-v1'),
      (${CONSENT_P3}, ${P3}, 'tratamento_dados_menor', 'Mãe do P3', 'v1')`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql.end();
  });

  test("admin_recepcao vê pacientes (administrativo) mas NÃO o perfil clínico", async () => {
    const pacientes = await withTenant(ctx("admin_recepcao", U_ADMIN), (db) =>
      db.select().from(patient),
    );
    expect(pacientes.map((p) => p.id).sort()).toEqual([P1, P2, P4].sort());

    const clinico = await withTenant(ctx("admin_recepcao", U_ADMIN), (db) =>
      db.select().from(patientClinicalProfile),
    );
    expect(clinico).toHaveLength(0); // BLOQUEADO
  });

  test("terapeuta só vê pacientes da própria equipe vigente", async () => {
    const pacientes = await withTenant(ctx("terapeuta", U_TERA), (db) =>
      db.select().from(patient),
    );
    expect(pacientes.map((p) => p.id)).toEqual([P1]); // só P1, não P2
  });

  test("terapeuta sem equipe não vê nenhum paciente da clínica", async () => {
    const pacientes = await withTenant(ctx("terapeuta", U_TERA2), (db) =>
      db.select().from(patient),
    );
    expect(pacientes).toHaveLength(0);
  });

  test("coordenador vê a clínica inteira, mas não outra clínica", async () => {
    const pacientes = await withTenant(ctx("coordenador", U_COORD), (db) =>
      db.select().from(patient),
    );
    const ids = pacientes.map((p) => p.id).sort();
    expect(ids).toEqual([P1, P2, P4].sort());
    expect(ids).not.toContain(P3); // isolamento cross-clinic
  });

  test("admin_recepcao NÃO consegue inserir perfil clínico (RLS write)", async () => {
    await expect(
      withTenant(ctx("admin_recepcao", U_ADMIN), (db) =>
        db
          .insert(patientClinicalProfile)
          .values({ patientId: P1, diagnostico: "hack" }),
      ),
    ).rejects.toThrow();
  });

  test("terapeuta fora da equipe NÃO insere perfil clínico do paciente (RLS write)", async () => {
    // P4 não tem profile (isola do unique constraint) e TERA2 não está na sua
    // equipe → o WITH CHECK de pcp_access deve barrar a inserção.
    await expect(
      withTenant(ctx("terapeuta", U_TERA2), (db) =>
        db
          .insert(patientClinicalProfile)
          .values({ patientId: P4, diagnostico: "hack" }),
      ),
    ).rejects.toThrow();
  });

  test("terapeuta da equipe vê a EQUIPE INTEIRA do paciente, não só a própria linha", async () => {
    // TERA está na equipe de P1 → deve enxergar também o colega TERA3 (W2).
    const equipe = await withTenant(ctx("terapeuta", U_TERA), (db) =>
      db
        .select()
        .from(careTeamMembership)
        .where(eq(careTeamMembership.patientId, P1)),
    );
    const membros = equipe.map((m) => m.userId).sort();
    expect(membros).toEqual([U_TERA, U_TERA3].sort());
  });

  test("terapeuta da equipe ATUALIZA perfil clínico (split não quebrou escrita legítima)", async () => {
    await withTenant(ctx("terapeuta", U_TERA), (db) =>
      db
        .update(patientClinicalProfile)
        .set({ diagnostico: "TEA confirmado" })
        .where(eq(patientClinicalProfile.patientId, P1)),
    );
    const [perfil] = await withTenant(ctx("terapeuta", U_TERA), (db) =>
      db
        .select()
        .from(patientClinicalProfile)
        .where(eq(patientClinicalProfile.patientId, P1)),
    );
    expect(perfil?.diagnostico).toBe("TEA confirmado");
  });

  test("pp_write: coordenador NÃO vincula protocolo de OUTRA clínica ao paciente", async () => {
    // FK não valida tenant → sem app_protocol_in_clinic, PROT_B (clínica B)
    // entraria num paciente da clínica A. WITH CHECK deve barrar.
    await expect(
      withTenant(ctx("coordenador", U_COORD), (db) =>
        db.insert(patientProtocol).values({
          patientId: P2,
          protocolId: PROT_B,
          ativadoPor: U_COORD,
        }),
      ),
    ).rejects.toThrow();
  });

  test("pp_write: coordenador vincula protocolo da PRÓPRIA clínica (não superbloqueia)", async () => {
    await withTenant(ctx("coordenador", U_COORD), (db) =>
      db.insert(patientProtocol).values({
        patientId: P2,
        protocolId: PROT_A,
        ativadoPor: U_COORD,
      }),
    );
    const vinculos = await withTenant(ctx("coordenador", U_COORD), (db) =>
      db
        .select()
        .from(patientProtocol)
        .where(eq(patientProtocol.patientId, P2)),
    );
    expect(vinculos).toHaveLength(1);
  });

  test("ctm_write: coordenador NÃO adiciona profissional de OUTRA clínica à equipe", async () => {
    // U_EXT só tem papel na clínica B → app_user_in_clinic(U_EXT) é falso em A.
    await expect(
      withTenant(ctx("coordenador", U_COORD), (db) =>
        db.insert(careTeamMembership).values({
          patientId: P2,
          userId: U_EXT,
          disciplina: "ABA",
          papelNaEquipe: "terapeuta_referencia",
        }),
      ),
    ).rejects.toThrow();
  });

  test("ctm_write: coordenador adiciona profissional da PRÓPRIA clínica (não superbloqueia)", async () => {
    await withTenant(ctx("coordenador", U_COORD), (db) =>
      db.insert(careTeamMembership).values({
        patientId: P2,
        userId: U_TERA3,
        disciplina: "Fono",
        papelNaEquipe: "terapeuta_referencia",
      }),
    );
    const equipe = await withTenant(ctx("coordenador", U_COORD), (db) =>
      db
        .select()
        .from(careTeamMembership)
        .where(eq(careTeamMembership.patientId, P2)),
    );
    expect(equipe.map((m) => m.userId)).toContain(U_TERA3);
  });

  test("DELETE de perfil clínico: terapeuta da equipe é barrado, coordenador não", async () => {
    // Terapeuta (mesmo da equipe) não deve deletar dado de saúde: DELETE só tem
    // política p/ coordenador → 0 linhas afetadas, perfil permanece (W1).
    await withTenant(ctx("terapeuta", U_TERA), (db) =>
      db
        .delete(patientClinicalProfile)
        .where(eq(patientClinicalProfile.patientId, P1)),
    );
    const aindaExiste = await withTenant(ctx("coordenador", U_COORD), (db) =>
      db
        .select()
        .from(patientClinicalProfile)
        .where(eq(patientClinicalProfile.patientId, P1)),
    );
    expect(aindaExiste).toHaveLength(1);

    // Coordenador deleta de fato.
    await withTenant(ctx("coordenador", U_COORD), (db) =>
      db
        .delete(patientClinicalProfile)
        .where(eq(patientClinicalProfile.patientId, P1)),
    );
    const removido = await withTenant(ctx("coordenador", U_COORD), (db) =>
      db
        .select()
        .from(patientClinicalProfile)
        .where(eq(patientClinicalProfile.patientId, P1)),
    );
    expect(removido).toHaveLength(0);
  });

  // ─── consent — isolamento cross-tenant + append-only (gap coberto na #100) ──
  // A tabela `consent` não tinha teste de RLS neste arquivo. As policies
  // (0001_rls.sql) são agnósticas ao `tipo`, então o valor novo
  // `autoconsentimento_titular_adulto` não muda nada aqui — é exatamente isso
  // que estes testes provam.

  test("consent: leitura é isolada por clínica (cross-tenant bloqueado)", async () => {
    const daClinicaA = await withTenant(ctx("coordenador", U_COORD), (db) =>
      db.select().from(consent),
    );
    expect(daClinicaA.map((c) => c.id).sort()).toEqual(
      [CONSENT_P1, CONSENT_P2].sort(),
    );
    // O consent do paciente da clínica B é invisível mesmo pedindo pelo id.
    const vazamento = await withTenant(ctx("coordenador", U_COORD), (db) =>
      db.select().from(consent).where(eq(consent.id, CONSENT_P3)),
    );
    expect(vazamento).toHaveLength(0);

    // E o inverso: coordenador da clínica B não vê os da A.
    const daClinicaB = await withTenant(
      ctx("coordenador", U_COORD_B, CLINIC_B),
      (db) => db.select().from(consent),
    );
    expect(daClinicaB.map((c) => c.id)).toEqual([CONSENT_P3]);
  });

  test("consent_insert: coordenador da clínica A NÃO grava consent de paciente da clínica B", async () => {
    // Esta PR mexe justamente no caminho de ESCRITA de consent. A policy
    // consent_insert exige app_patient_in_clinic(patient_id) — P3 é da clínica
    // B, então o WITH CHECK falha mesmo com papel de coordenador válido em A.
    const erro = await capturarErro(
      withTenant(ctx("coordenador", U_COORD), (db) =>
        db.insert(consent).values({
          patientId: P3,
          tipo: "tratamento_dados_menor",
          responsavelSignatario: "Invasor",
          versaoTermo: "v1",
        }),
      ),
    );
    expect(erro).toMatch(/row-level security|violates row-level security/i);

    // E nada vazou para a clínica B: só o consent semeado continua lá.
    const daClinicaB = await withTenant(
      ctx("coordenador", U_COORD_B, CLINIC_B),
      (db) => db.select().from(consent).where(eq(consent.patientId, P3)),
    );
    expect(daClinicaB).toHaveLength(1);
    expect(daClinicaB[0]!.id).toBe(CONSENT_P3);
  });

  test("consent: UPDATE é negado a app_role (append-only, LGPD)", async () => {
    // REVOKE UPDATE, DELETE ON consent FROM app_role (0001_rls.sql:23). Não é
    // policy que retorna 0 linhas — é privilégio ausente, que ERRA. O drizzle
    // embrulha o erro do Postgres, então a mensagem real está em `cause`.
    const erro = await capturarErro(
      withTenant(ctx("coordenador", U_COORD), (db) =>
        db
          .update(consent)
          .set({ responsavelSignatario: "Adulterado" })
          .where(eq(consent.id, CONSENT_P1)),
      ),
    );
    expect(erro).toMatch(/permission denied for table consent/i);

    const intacto = await withTenant(ctx("coordenador", U_COORD), (db) =>
      db.select().from(consent).where(eq(consent.id, CONSENT_P1)),
    );
    expect(intacto[0]!.responsavelSignatario).toBe("Mãe do P1");
  });

  test("consent: DELETE é negado a app_role (append-only, LGPD)", async () => {
    const erro = await capturarErro(
      withTenant(ctx("coordenador", U_COORD), (db) =>
        db.delete(consent).where(eq(consent.id, CONSENT_P1)),
      ),
    );
    expect(erro).toMatch(/permission denied for table consent/i);

    const aindaExiste = await withTenant(ctx("coordenador", U_COORD), (db) =>
      db.select().from(consent).where(eq(consent.id, CONSENT_P1)),
    );
    expect(aindaExiste).toHaveLength(1);
  });

  test("admin_recepcao NUNCA lê nem escreve patient_protocol ou care_team_membership (guardrail 1c)", async () => {
    // Minimização LGPD: recepção não toca protocolo nem equipe de cuidado.
    // RLS já barra desde 1a/1b — esta é a prova documental do guardrail #1.
    const protocolos = await withTenant(ctx("admin_recepcao", U_ADMIN), (db) =>
      db.select().from(patientProtocol),
    );
    expect(protocolos).toHaveLength(0);

    const equipe = await withTenant(ctx("admin_recepcao", U_ADMIN), (db) =>
      db.select().from(careTeamMembership),
    );
    expect(equipe).toHaveLength(0);

    await expect(
      withTenant(ctx("admin_recepcao", U_ADMIN), (db) =>
        db
          .insert(patientProtocol)
          .values({ patientId: P1, protocolId: PROT_A, ativadoPor: U_ADMIN }),
      ),
    ).rejects.toThrow();

    await expect(
      withTenant(ctx("admin_recepcao", U_ADMIN), (db) =>
        db.insert(careTeamMembership).values({
          patientId: P1,
          userId: U_ADMIN,
          disciplina: "ABA",
          papelNaEquipe: "substituto",
        }),
      ),
    ).rejects.toThrow();
  });

  test("report_scope (WITH CHECK): terapeuta da equipe insere report convenio_bruto do próprio paciente", async () => {
    // TERA está na equipe de P1 (seed do describe) → INSERT deve passar.
    await withTenant(ctx("terapeuta", U_TERA), (db) =>
      db.insert(report).values({
        clinicId: CLINIC_A,
        patientId: P1,
        tipo: "convenio_bruto",
        periodoInicio: "2026-06-01",
        periodoFim: "2026-06-30",
        payload: {},
      }),
    );
    const linhas = await withTenant(ctx("coordenador", U_COORD), (db) =>
      db.select().from(report).where(eq(report.patientId, P1)),
    );
    expect(linhas).toHaveLength(1);
  });

  test("report_scope (WITH CHECK): terapeuta FORA da equipe é barrado no INSERT de report", async () => {
    // TERA2 não está na equipe de P2 → WITH CHECK (app_is_on_team) deve barrar.
    await expect(
      withTenant(ctx("terapeuta", U_TERA2), (db) =>
        db.insert(report).values({
          clinicId: CLINIC_A,
          patientId: P2,
          tipo: "convenio_bruto",
          periodoInicio: "2026-06-01",
          periodoFim: "2026-06-30",
          payload: {},
        }),
      ),
    ).rejects.toThrow();
  });

  test("report_scope (WITH CHECK): admin_recepcao (sem membership) é barrado no INSERT de report", async () => {
    // admin_recepcao nunca satisfaz coordenador OU app_is_on_team → sempre barrado.
    await expect(
      withTenant(ctx("admin_recepcao", U_ADMIN), (db) =>
        db.insert(report).values({
          clinicId: CLINIC_A,
          patientId: P1,
          tipo: "convenio_bruto",
          periodoInicio: "2026-06-01",
          periodoFim: "2026-06-30",
          payload: {},
        }),
      ),
    ).rejects.toThrow();
  });

  // ─── convenio_narrativo: coordenador-only em todas as 3 ações ──────────────
  // Diferente de família (terapeuta on-team pode gerar): convênio narrativo é
  // coordenador-only nas 3 etapas (gerar/curar/exportar) — R1 de agente-3.
  describe("convenio_narrativo — coordenador-only (Fase 5 Fatia 5)", () => {
    const cnCabecalho: CabecalhoConvenio = {
      operadora: "Amil",
      cid: "F84.0",
      finalidade: "Renovação de guia",
    };
    const cnDraft: ConvenioNarrativoDraft = {
      resumoClinico: "Evoluiu bem no período.",
      evolucaoPorDominio: [
        { dominio: "Comunicação", narrativa: "Avançou em pedidos." },
      ],
      justificativaContinuidade: "Necessita continuidade do plano.",
      objetivosProximoPeriodo: ["Ampliar vocabulário funcional"],
      periodoSemAvancoVisivel: false,
      notaHonestidade: null,
      status: "rascunho_para_revisao",
    };
    const gerarInput = {
      patientId: P1,
      periodoInicio: "2026-06-01",
      periodoFim: "2026-06-30",
      cabecalho: cnCabecalho,
    };

    test("controle positivo: coordenador da clínica dona gera, cura e exporta com sucesso", async () => {
      const gerado = await gerarRascunhoConvenioNarrativo(
        ctx("coordenador", U_COORD),
        gerarInput,
      );
      expect("reportId" in gerado).toBe(true);
      const reportId = (gerado as { reportId: string }).reportId;

      const curado = await curarConvenioNarrativo(ctx("coordenador", U_COORD), {
        reportId,
        versaoEsperada: 1,
        cabecalhoEditado: cnCabecalho,
        draftEditado: cnDraft,
      });
      expect(curado).toEqual({ ok: true });

      const exportado = await exportarConvenioNarrativo(
        ctx("coordenador", U_COORD),
        { reportId },
        new StubPdfRenderer(),
      );
      expect("hash" in exportado).toBe(true);
    });

    test("terapeuta on-team é BARRADO nas 3 ações (RoleError) — difere de família", async () => {
      const gerado = await gerarRascunhoConvenioNarrativo(
        ctx("terapeuta", U_TERA),
        gerarInput,
      );
      expect(gerado).toEqual({ error: expect.stringContaining("papel") });

      // Usa um report já existente (do controle positivo) p/ curar/exportar.
      const [existente] = await owner<{ id: string }[]>`
        SELECT id FROM report WHERE tipo = 'convenio_narrativo' AND patient_id = ${P1} LIMIT 1
      `;
      const reportId = existente!.id;

      const curado = await curarConvenioNarrativo(ctx("terapeuta", U_TERA), {
        reportId,
        versaoEsperada: 1,
        cabecalhoEditado: cnCabecalho,
        draftEditado: cnDraft,
      });
      expect(curado).toEqual({ error: expect.stringContaining("papel") });

      const exportado = await exportarConvenioNarrativo(
        ctx("terapeuta", U_TERA),
        { reportId },
        new StubPdfRenderer(),
      );
      expect(exportado).toEqual({ error: expect.stringContaining("papel") });
    });

    test("admin_recepcao é BARRADO nas 3 ações (RoleError)", async () => {
      const [existente] = await owner<{ id: string }[]>`
        SELECT id FROM report WHERE tipo = 'convenio_narrativo' AND patient_id = ${P1} LIMIT 1
      `;
      const reportId = existente!.id;

      const gerado = await gerarRascunhoConvenioNarrativo(
        ctx("admin_recepcao", U_ADMIN),
        gerarInput,
      );
      expect(gerado).toEqual({ error: expect.stringContaining("papel") });

      const curado = await curarConvenioNarrativo(
        ctx("admin_recepcao", U_ADMIN),
        {
          reportId,
          versaoEsperada: 1,
          cabecalhoEditado: cnCabecalho,
          draftEditado: cnDraft,
        },
      );
      expect(curado).toEqual({ error: expect.stringContaining("papel") });

      const exportado = await exportarConvenioNarrativo(
        ctx("admin_recepcao", U_ADMIN),
        { reportId },
        new StubPdfRenderer(),
      );
      expect(exportado).toEqual({ error: expect.stringContaining("papel") });
    });

    test("cross-tenant: coordenador de OUTRA clínica não vê nem edita o relatório", async () => {
      // gerar: paciente P1 é da clínica A → RLS não deixa CLINIC_B enxergá-lo.
      const gerado = await gerarRascunhoConvenioNarrativo(
        ctx("coordenador", U_COORD_B, CLINIC_B),
        gerarInput,
      );
      expect(gerado).toEqual({
        error: expect.stringContaining("Paciente não encontrado"),
      });

      // curar/exportar: report existente pertence à clínica A → RLS escopa por
      // clinic_id e a linha não aparece p/ CLINIC_B (isolamento cross-tenant).
      const [existente] = await owner<{ id: string }[]>`
        SELECT id FROM report WHERE tipo = 'convenio_narrativo' AND patient_id = ${P1} LIMIT 1
      `;
      const reportId = existente!.id;

      const curado = await curarConvenioNarrativo(
        ctx("coordenador", U_COORD_B, CLINIC_B),
        {
          reportId,
          versaoEsperada: 1,
          cabecalhoEditado: cnCabecalho,
          draftEditado: cnDraft,
        },
      );
      expect(curado).toEqual({ error: expect.stringContaining("mudou") });

      const exportado = await exportarConvenioNarrativo(
        ctx("coordenador", U_COORD_B, CLINIC_B),
        { reportId },
        new StubPdfRenderer(),
      );
      expect(exportado).toEqual({
        error: expect.stringContaining("não encontrado"),
      });
    });
  });

  describe("issue #141 — policy evidence_revision_insert (predicado eq.evidence_id = evidence_id)", () => {
    test("terapeuta só insere revision se existir query ABERTA para a MESMA evidência", async () => {
      // 1. Setup no banco via superuser: criar extraction, 2 evidencias (EV1 e EV2) e 1 query aberta para EV1.
      const [sess] = await owner<{ id: string }[]>`
        INSERT INTO session (clinic_id, patient_id, terapeuta_id, agendada_para, disciplina)
        VALUES (${CLINIC_A}, ${P1}, ${U_TERA}, now(), 'ABA') RETURNING id
      `;
      const [ext] = await owner<{ id: string }[]>`
        INSERT INTO extraction (session_id, clinic_id, subtipo, trecho_fonte, confianca, payload)
        VALUES (${sess!.id}, ${CLINIC_A}, 'sugestao_marcos', 'trecho fonte', 'alta', '{}'::jsonb) RETURNING id
      `;
      const [ev1] = await owner<{ id: string }[]>`
        INSERT INTO evidence (extraction_id, patient_id, session_id, session_numero, alvo_ordinal, classificacao_original, aprovado_por)
        VALUES (${ext!.id}, ${P1}, ${sess!.id}, 1, 0, '{}'::jsonb, ${U_COORD}) RETURNING id
      `;
      const [ev2] = await owner<{ id: string }[]>`
        INSERT INTO evidence (extraction_id, patient_id, session_id, session_numero, alvo_ordinal, classificacao_original, aprovado_por)
        VALUES (${ext!.id}, ${P1}, ${sess!.id}, 1, 1, '{}'::jsonb, ${U_COORD}) RETURNING id
      `;

      // Query aberta apenas para EV1
      await owner`
        INSERT INTO evidence_query (evidence_id, coordenador_id, pergunta)
        VALUES (${ev1!.id}, ${U_COORD}, 'Dúvida em EV1?')
      `;

      // 2. Tentar inserir revision em EV2 (que NÃO tem query aberta) como terapeuta da equipe (U_TERA)
      // Com a falha antiga (eq.evidence_id = eq.evidence_id), a existência da query em EV1 liberava erroneamente a inserção em EV2.
      const erroEV2 = await capturarErro(
        withTenant(ctx("terapeuta", U_TERA), async (db) => {
          await db.execute(sql`
            INSERT INTO evidence_revision (evidence_id, acao, classificacao_anterior, justificativa, autor_id)
            VALUES (${ev2!.id}::uuid, 'invalidador'::evidence_revision_acao, '{}'::jsonb, 'Tentativa em EV2', ${U_TERA}::uuid)
          `);
        })
      );
      expect(erroEV2).toMatch(/row-level security policy/i);

      // 3. Tentar inserir revision em EV1 (que TEM query aberta) como terapeuta da equipe (U_TERA) -> deve ter sucesso
      await withTenant(ctx("terapeuta", U_TERA), async (db) => {
        await db.execute(sql`
          INSERT INTO evidence_revision (evidence_id, acao, classificacao_anterior, justificativa, autor_id)
          VALUES (${ev1!.id}::uuid, 'invalidador'::evidence_revision_acao, '{}'::jsonb, 'Resposta em EV1', ${U_TERA}::uuid)
        `);
      });

      const [revCount] = await owner<{ count: number }[]>`
        SELECT count(*)::int FROM evidence_revision WHERE evidence_id = ${ev1!.id}
      `;
      expect(revCount!.count).toBe(1);
    });
  });

  describe("escrita não autorizada em session, session_note e extraction (issue #128)", () => {
    test("session: inserção de sessão com paciente de OUTRA clínica é negada pelo RLS", async () => {
      // P3 é paciente da clínica B. Tentar inserir sessão para P3 sob contexto da clínica A deve falhar.
      await expect(
        withTenant(ctx("coordenador", U_COORD), (db) =>
          db.insert(session).values({
            clinicId: CLINIC_A,
            patientId: P3,
            terapeutaId: U_TERA,
            agendadaPara: new Date("2026-08-01T10:00:00Z"),
            disciplina: "ABA",
          }),
        ),
      ).rejects.toThrow();
    });

    test("session_note: terapeuta que NÃO é dono da sessão não insere nem edita nota", async () => {
      // 1. Criar sessão pertencente a U_TERA
      const [sess] = await owner<{ id: string }[]>`
        INSERT INTO session (clinic_id, patient_id, terapeuta_id, agendada_para, disciplina)
        VALUES (${CLINIC_A}, ${P1}, ${U_TERA}, now(), 'ABA') RETURNING id
      `;

      // 2. U_TERA2 (outro terapeuta) tenta inserir nota na sessão de U_TERA -> RLS barra
      await expect(
        withTenant(ctx("terapeuta", U_TERA2), (db) =>
          db.insert(sessionNote).values({
            sessionId: sess!.id,
            clinicId: CLINIC_A,
            tipo: "captura_rapida",
            texto: "nota não autorizada",
            autorId: U_TERA2,
          }),
        ),
      ).rejects.toThrow();
    });

    test("extraction: terapeuta que NÃO é dono da sessão não insere nem edita extração", async () => {
      // 1. Criar sessão pertencente a U_TERA
      const [sess] = await owner<{ id: string }[]>`
        INSERT INTO session (clinic_id, patient_id, terapeuta_id, agendada_para, disciplina)
        VALUES (${CLINIC_A}, ${P1}, ${U_TERA}, now(), 'ABA') RETURNING id
      `;

      // 2. U_TERA2 tenta inserir extração para a sessão de U_TERA -> RLS barra
      await expect(
        withTenant(ctx("terapeuta", U_TERA2), (db) =>
          db.insert(extraction).values({
            sessionId: sess!.id,
            clinicId: CLINIC_A,
            subtipo: "evidencia",
            trechoFonte: "fonte",
            confianca: "alta",
            payload: {},
          }),
        ),
      ).rejects.toThrow();
    });
  });
});

