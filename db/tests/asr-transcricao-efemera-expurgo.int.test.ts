/**
 * #72 T25 / cenário 9 — a transcrição de ASR é efêmera (R19, decisão C de
 * 31/08/2026). **Metade 2 das duas exigidas pelo cenário**: a linha de
 * `audio_capture` — com a transcrição dentro — é levada pelo expurgo por
 * paciente (`app_purgar_paciente`, corpo compartilhado da migração 0128).
 *
 * A metade 1 (aceitar o texto no rascunho zera `transcricao_texto`) vive em
 * `src/app/(app)/diario/[sessionId]/actions.int.test.ts`, no describe
 * `aceitarTranscricaoLote (#72, T25 · cenário 9)`.
 *
 * Por que as duas metades juntas fecham o débito D74: `audio_capture` está em
 * `TABELAS_NEGADAS` do coletor do acervo (`src/lib/export/acervo/coletor.ts`),
 * então a transcrição NUNCA entrou no ZIP de portabilidade — ao contrário do
 * que R19 afirmava. O que restava era garantir que ela (a) não sobrevive à
 * aceitação e (b) não sobrevive ao expurgo do titular (LGPD Art. 18).
 *
 * Arranjo segue a convenção de `db/tests/fase6-expurgo-paciente.int.test.ts`
 * (owner via MIGRATION_DATABASE_URL para o arranjo, `withTenant` para o gesto
 * sob RLS), com uma diferença deliberada: **sem `TRUNCATE`**. Este arquivo
 * roda na mesma suíte de outros int-tests que compartilham as tabelas; a
 * limpeza é por `DELETE` escopado nas próprias fixtures.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "../../src/db/rls";
import { hasDb } from "./integration-env";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })
  : null;

// UUIDs próprios deste arquivo (sufixo `e9` = "efêmera, cenário 9") para não
// colidirem com nenhuma outra fixture da suíte.
const CLINIC = "00000000-0000-0000-0000-0000000000e9";
const U_COORD = "00000000-0000-0000-0000-000000000ce9";
const U_TER = "00000000-0000-0000-0000-0000000001e9";
const PAC = "00000000-0000-0000-0000-0000000002e9";
const SESS = "00000000-0000-0000-0000-0000000003e9";
const LOTE = "00000000-0000-0000-0000-0000000004e9";

const TRANSCRICAO_1 = "mordeu o colega durante o intervalo";
const TRANSCRICAO_2 = "pediu agua apontando para a jarra";

const ctxCoord = {
  role: "coordenador",
  userId: U_COORD,
  clinicId: CLINIC,
} as TenantContext;

const limpar = async () => {
  await owner!`DELETE FROM audio_capture WHERE session_id = ${SESS}`;
  await owner!`DELETE FROM session WHERE id = ${SESS}`;
  await owner!`DELETE FROM audit_log WHERE clinic_id = ${CLINIC}`;
  await owner!`DELETE FROM patient WHERE id = ${PAC}`;
  await owner!`DELETE FROM user_role WHERE clinic_id = ${CLINIC}`;
  await owner!`DELETE FROM app_user WHERE id IN (${U_COORD}, ${U_TER})`;
  await owner!`DELETE FROM clinic WHERE id = ${CLINIC}`;
};

describe.skipIf(!hasDb)(
  "#72 T25 · cenário 9 — expurgo por paciente leva a transcrição junto",
  () => {
    beforeAll(async () => {
      await limpar();
      await owner!`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'Clínica ASR efêmera')`;
      // E-mails com domínio próprio do arquivo: `UNIQUE(email)` em `app_user`
      // já derrubou arranjo de int-test parecendo defeito de RLS.
      await owner!`INSERT INTO app_user (id, name, email) VALUES
        (${U_COORD}, 'Coord', 'coord@asr-efemera-expurgo.test'),
        (${U_TER}, 'Ter', 'ter@asr-efemera-expurgo.test')`;
      await owner!`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
        (${U_COORD}, ${CLINIC}, 'coordenador'),
        (${U_TER}, ${CLINIC}, 'terapeuta')`;
      // Datas que tornam o paciente ELEGÍVEL ao expurgo: desde a 0128 há gate
      // de retenção, e paciente sem `alta_em` é inelegível por construção —
      // o teste mediria a recusa do gate em vez do erasure.
      await owner!`INSERT INTO patient (id, clinic_id, nome, nascimento, alta_em)
        VALUES (${PAC}, ${CLINIC}, 'Paciente ASR', '1990-01-01', '2005-01-01')`;
      await owner!`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina)
        VALUES (${SESS}, ${CLINIC}, ${PAC}, ${U_TER}, now(), 'realizada', 'aba')`;
      // O estado exato que o cenário 9 protege: lote transcrito cujo texto
      // AINDA não foi aceito no rascunho (se tivesse sido, já seria NULL).
      await owner!`INSERT INTO audio_capture
        (session_id, clinic_id, lote_id, ordem, asr_status, transcricao_texto, transcrito_em) VALUES
        (${SESS}, ${CLINIC}, ${LOTE}, 0, 'transcrito', ${TRANSCRICAO_1}, now()),
        (${SESS}, ${CLINIC}, ${LOTE}, 1, 'transcrito', ${TRANSCRICAO_2}, now())`;
    });

    afterAll(async () => {
      await limpar();
      await owner?.end();
    });

    test("arranjo: a transcrição está mesmo no banco antes do expurgo", async () => {
      // Sem esta âncora, o teste abaixo passaria verde contra um arranjo que
      // nunca gravou texto nenhum.
      const antes = (await owner!`SELECT transcricao_texto FROM audio_capture
        WHERE lote_id = ${LOTE} ORDER BY ordem`) as unknown as Array<{
        transcricao_texto: string | null;
      }>;
      expect(antes.map((l) => l.transcricao_texto)).toEqual([
        TRANSCRICAO_1,
        TRANSCRICAO_2,
      ]);
    });

    test("app_purgar_paciente remove as linhas de audio_capture do titular (com a transcrição dentro)", async () => {
      await withTenant(ctxCoord, (db) =>
        db.execute(
          sql`SELECT app_purgar_paciente(${PAC}::uuid, 'fim de retenção')`,
        ),
      );

      // erasure físico da linha inteira — não é pseudonimização.
      expect(
        await owner!`SELECT 1 FROM audio_capture WHERE lote_id = ${LOTE}`,
      ).toHaveLength(0);
      expect(
        await owner!`SELECT 1 FROM session WHERE patient_id = ${PAC}`,
      ).toHaveLength(0);
      expect(
        await owner!`SELECT 1 FROM patient WHERE id = ${PAC}`,
      ).toHaveLength(0);

      // E nenhum resto do texto clínico ficou em `audio_capture` — inclusive
      // por outra sessão que apontasse para o mesmo paciente.
      const restos = await owner!`SELECT 1 FROM audio_capture
        WHERE transcricao_texto IN (${TRANSCRICAO_1}, ${TRANSCRICAO_2})`;
      expect(restos).toHaveLength(0);

      // A trilha do expurgo sobrevive PSEUDONIMIZADA (A3/R6.3.2) e, em
      // particular, não carrega a transcrição de carona.
      const fato = (await owner!`SELECT patient_id, detalhe FROM audit_log
        WHERE acao = 'paciente_purgado' AND entidade_id = ${PAC}`) as unknown as Array<{
        patient_id: string | null;
        detalhe: unknown;
      }>;
      expect(fato).toHaveLength(1);
      expect(fato[0]!.patient_id).toBeNull();
      expect(JSON.stringify(fato[0]!.detalhe)).not.toContain(TRANSCRICAO_1);
      expect(JSON.stringify(fato[0]!.detalhe)).not.toContain(TRANSCRICAO_2);
    });
  },
);
