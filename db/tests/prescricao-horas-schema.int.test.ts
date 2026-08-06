/**
 * #203 · Fatia 1 — DDL da migração 0076 (prescrição de horas × consumo na equipe).
 *
 * Prova, contra Postgres real, as quatro coisas que a 0076 promete e que
 * "está no git log" não demonstra:
 *
 *   1. CHECK de passo/teto nos DOIS lados da conta (equipe e alvo prescrito).
 *   2. CHECK `ctm_gestao_sem_horas` — D-C: coordenador de referência não tem carga.
 *   3. Índice único PARCIAL `ctm_unico_vigente`, com `papel_na_equipe` na chave.
 *   4. GRANT de coluna: a 0044 revogou UPDATE de tabela nesta tabela, e coluna
 *      nova não herda nada.
 *
 * Conexão owner (bypassa RLS) porque o alvo aqui é o DDL, não a policy de
 * linha — mesmo padrão de db/tests/fase5-report-schema.int.test.ts. O privilégio
 * de `app_role` é medido com `has_column_privilege`, não inferido.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { hasDb } from "./integration-env";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })
  : null;

const CLINIC = "00000000-0000-0000-0000-0000000203c1";
const PATIENT = "00000000-0000-0000-0000-0000000203b1";
const U_TERA = "00000000-0000-0000-0000-0000000203a1";
const U_COORD = "00000000-0000-0000-0000-0000000203a2";

/** Insere um vínculo direto (owner), devolvendo a promise para asserção. */
function vinculo(opts: {
  userId: string;
  disciplina: string;
  papel: string;
  horas?: number | null;
  vigenciaFim?: string | null;
}) {
  return owner!`
    INSERT INTO care_team_membership
      (patient_id, user_id, disciplina, papel_na_equipe, horas_semana, vigencia_fim)
    VALUES
      (${PATIENT}, ${opts.userId}, ${opts.disciplina}, ${opts.papel},
       ${opts.horas ?? null}, ${opts.vigenciaFim ?? null})
    RETURNING id`;
}

function alvo(horas: number) {
  return owner!`
    INSERT INTO patient_alvo_disciplina
      (clinic_id, patient_id, disciplina, horas_alvo_semana, vigencia_inicio)
    VALUES (${CLINIC}, ${PATIENT}, 'Fonoaudiologia', ${horas}, '2026-01-01')
    RETURNING id`;
}

describe.skipIf(!hasDb)(
  "0076 — prescrição de horas (constraints e grants)",
  () => {
    beforeAll(async () => {
      await owner!`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'C203') ON CONFLICT DO NOTHING`;
      await owner!`INSERT INTO app_user (id, name, email) VALUES
      (${U_TERA}, 'Tera 203', 'tera203@e.test'),
      (${U_COORD}, 'Coord 203', 'coord203@e.test') ON CONFLICT DO NOTHING`;
      await owner!`INSERT INTO patient (id, clinic_id, nome) VALUES (${PATIENT}, ${CLINIC}, 'P203') ON CONFLICT DO NOTHING`;
    });

    // A suíte roda com fileParallelism:false contra um banco COMPARTILHADO, e
    // outros arquivos afirmam listas exatas (ex.: listarTerapeutas). Fixture que
    // sobra vira falha em teste vizinho, difícil de rastrear até aqui. Limpa
    // tudo, na ordem das FKs.
    afterAll(async () => {
      if (!owner) return;
      await owner`DELETE FROM care_team_membership WHERE patient_id = ${PATIENT}`;
      await owner`DELETE FROM patient_alvo_disciplina WHERE patient_id = ${PATIENT}`;
      await owner`DELETE FROM patient WHERE id = ${PATIENT}`;
      await owner`DELETE FROM app_user WHERE id IN (${U_TERA}, ${U_COORD})`;
      await owner`DELETE FROM clinic WHERE id = ${CLINIC}`;
      await owner.end();
    });

    // ── 1 · passo de 30 min e teto, nos dois lados ────────────────────────────
    test("care_team_membership: 0.3h é rejeitado (fora do passo de 30 min)", async () => {
      await expect(
        vinculo({
          userId: U_TERA,
          disciplina: "Fono",
          papel: "terapeuta_referencia",
          horas: 0.3,
        }),
      ).rejects.toThrow(/ctm_horas_semana_passo/);
    });

    test("care_team_membership: 0h e negativo são rejeitados", async () => {
      await expect(
        vinculo({
          userId: U_TERA,
          disciplina: "Fono0",
          papel: "terapeuta_referencia",
          horas: 0,
        }),
      ).rejects.toThrow(/ctm_horas_semana_passo/);
      await expect(
        vinculo({
          userId: U_TERA,
          disciplina: "FonoNeg",
          papel: "terapeuta_referencia",
          horas: -2,
        }),
      ).rejects.toThrow(/ctm_horas_semana_passo/);
    });

    test("care_team_membership: 200h (erro de digitação de 20h) é rejeitado pelo teto", async () => {
      await expect(
        vinculo({
          userId: U_TERA,
          disciplina: "FonoTeto",
          papel: "terapeuta_referencia",
          horas: 200,
        }),
      ).rejects.toThrow(/ctm_horas_semana_passo/);
    });

    test("care_team_membership: 0.5h e 20h passam", async () => {
      await expect(
        vinculo({
          userId: U_TERA,
          disciplina: "Meia",
          papel: "terapeuta_referencia",
          horas: 0.5,
        }),
      ).resolves.toBeDefined();
      await expect(
        vinculo({
          userId: U_TERA,
          disciplina: "Vinte",
          papel: "terapeuta_referencia",
          horas: 20,
        }),
      ).resolves.toBeDefined();
    });

    test("care_team_membership: horas NULL continua válido (legado e gestão)", async () => {
      await expect(
        vinculo({
          userId: U_TERA,
          disciplina: "Legado",
          papel: "terapeuta_referencia",
          horas: null,
        }),
      ).resolves.toBeDefined();
    });

    test("patient_alvo_disciplina tem a MESMA regra do lado do teto", async () => {
      // Sem esta constraint dava para prescrever 0,3h e nunca conseguir alocar
      // contra isso — a assimetria que a 0076 existe para fechar.
      await expect(alvo(0.3)).rejects.toThrow(/patient_alvo_horas_passo/);
      await expect(alvo(0)).rejects.toThrow(/patient_alvo_horas_passo/);
      await expect(alvo(200)).rejects.toThrow(/patient_alvo_horas_passo/);
      await expect(alvo(20)).resolves.toBeDefined();
    });

    // ── 2 · D-C: gestão não tem carga ─────────────────────────────────────────
    test("coordenador_referencia COM horas é rejeitado (D-C)", async () => {
      await expect(
        vinculo({
          userId: U_COORD,
          disciplina: "Gestao",
          papel: "coordenador_referencia",
          horas: 4,
        }),
      ).rejects.toThrow(/ctm_gestao_sem_horas/);
    });

    test("coordenador_referencia SEM horas passa", async () => {
      await expect(
        vinculo({
          userId: U_COORD,
          disciplina: "GestaoOk",
          papel: "coordenador_referencia",
        }),
      ).resolves.toBeDefined();
    });

    test("substituto COM horas passa (D-B: substituto consome saldo)", async () => {
      await expect(
        vinculo({
          userId: U_TERA,
          disciplina: "Subst",
          papel: "substituto",
          horas: 6,
        }),
      ).resolves.toBeDefined();
    });

    // ── 3 · índice único parcial ──────────────────────────────────────────────
    test("mesma pessoa/disciplina/papel vigente duas vezes é rejeitado", async () => {
      // Duplo-clique no submit viraria dupla contagem de carga e a barra
      // estouraria sem causa visível.
      await vinculo({
        userId: U_TERA,
        disciplina: "Dup",
        papel: "terapeuta_referencia",
        horas: 5,
      });
      await expect(
        vinculo({
          userId: U_TERA,
          disciplina: "Dup",
          papel: "terapeuta_referencia",
          horas: 5,
        }),
      ).rejects.toThrow(/ctm_unico_vigente/);
    });

    test("mesma pessoa em PAPÉIS diferentes na mesma disciplina passa (D-C)", async () => {
      // É a modelagem inteira da D-C: coordenador que também atende tem um
      // segundo vínculo como terapeuta. Sem `papel_na_equipe` na chave do índice,
      // este insert falharia e a decisão seria irrepresentável.
      await vinculo({
        userId: U_COORD,
        disciplina: "Dois",
        papel: "coordenador_referencia",
      });
      await expect(
        vinculo({
          userId: U_COORD,
          disciplina: "Dois",
          papel: "terapeuta_referencia",
          horas: 8,
        }),
      ).resolves.toBeDefined();
    });

    test("índice é PARCIAL: encerrar libera a combinação (recontratação)", async () => {
      await vinculo({
        userId: U_TERA,
        disciplina: "Volta",
        papel: "terapeuta_referencia",
        horas: 4,
        vigenciaFim: "2026-03-01",
      });
      await expect(
        vinculo({
          userId: U_TERA,
          disciplina: "Volta",
          papel: "terapeuta_referencia",
          horas: 4,
        }),
      ).resolves.toBeDefined();
    });

    test("o índice existe, é único e é parcial em vigencia_fim IS NULL", async () => {
      const [row] = await owner!<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
       WHERE tablename = 'care_team_membership' AND indexname = 'ctm_unico_vigente'`;
      expect(row?.indexdef).toMatch(/CREATE UNIQUE INDEX/);
      expect(row?.indexdef).toMatch(/papel_na_equipe/);
      expect(row?.indexdef).toMatch(/WHERE \(vigencia_fim IS NULL\)/);
    });

    // ── 4 · GRANT de coluna ───────────────────────────────────────────────────
    test("app_role TEM UPDATE em care_team_membership.horas_semana", async () => {
      // A 0044 revogou UPDATE de tabela e concede coluna a coluna; coluna nova
      // não herda nada. Sem o GRANT, editar horas falharia como "permission
      // denied for table care_team_membership" — sem dizer qual coluna.
      const [row] = await owner!<{ priv: boolean }[]>`
      SELECT has_column_privilege('app_role', 'care_team_membership'::regclass,
                                  'horas_semana', 'UPDATE') AS priv`;
      expect(row!.priv).toBe(true);
    });

    test("a coluna existe como numeric(4,1) e é nullable", async () => {
      const [row] = await owner!<
        {
          data_type: string;
          numeric_precision: number;
          numeric_scale: number;
          is_nullable: string;
        }[]
      >`
      SELECT data_type, numeric_precision, numeric_scale, is_nullable
        FROM information_schema.columns
       WHERE table_name = 'care_team_membership' AND column_name = 'horas_semana'`;
      expect(row?.data_type).toBe("numeric");
      expect(row?.numeric_precision).toBe(4);
      expect(row?.numeric_scale).toBe(1);
      // Nullable é decisão (legado + gestão), não descuido — ver D-D.
      expect(row?.is_nullable).toBe("YES");
    });
  },
);
