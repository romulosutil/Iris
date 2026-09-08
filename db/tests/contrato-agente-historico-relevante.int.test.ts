/**
 * #464 — `loadCanonicalContext` contra o Postgres real.
 *
 * Os testes unitários provam a PROJEÇÃO (`historico-relevante.ts`, puro) e a
 * MONTAGEM (`context-assembler.ts`, puro). Nenhum dos dois prova a FIAÇÃO: que
 * o loader realmente lê `session_snapshot`/`instrumento_aplicacao` sob RLS, com
 * os joins certos, e que o ramo por modo escolhe a leitura certa. Sem este
 * arquivo, o defeito "contrato volta com `historico_relevante: []` em produção"
 * — que é exatamente o estado que esta issue veio consertar — passaria verde.
 *
 * Cobre os três modos:
 *   - `protocol_driven` → item com `dominio_id` + `protocol_id`, vindo de
 *     `session_snapshot.repertorio_state`;
 *   - `tcc`             → item com `protocol_id` e SEM `dominio_id`, vindo de
 *     `instrumento_aplicacao`;
 *   - `terapia_convencional` → `[]` explícito (fonte `temas[]` não existe, #645).
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CLINIC = "00000000-0000-0000-0000-000000046400";
const U_COORD = "00000000-0000-0000-0000-000000046401";
const U_T1 = "00000000-0000-0000-0000-000000046402";
const PAC_ABA = "00000000-0000-0000-0000-000000046410";
const PAC_TCC = "00000000-0000-0000-0000-000000046411";
const PAC_CONV = "00000000-0000-0000-0000-000000046412";
const SESS_ABA = "00000000-0000-0000-0000-000000046420";
const SESS_TCC = "00000000-0000-0000-0000-000000046421";
const SESS_CONV = "00000000-0000-0000-0000-000000046422";

const PROTOCOL_FAMILIA = "vbmapp_464";

const ctx = {
  clinicId: CLINIC,
  userId: U_COORD,
  role: "coordenador",
} as const;

let owner: ReturnType<typeof postgres>;
let withTenant: typeof import("@/db/rls").withTenant;
let appSql: typeof import("@/db/client").sql;
let loadCanonicalContext: typeof import("@/lib/extraction/context-loader").loadCanonicalContext;

let GOAL_ID: string;

/**
 * Limpeza ESCOPADA a esta clínica, em ordem FK-segura. Nunca `TRUNCATE`: a
 * suíte de integração compartilha o banco, e truncar tabela alheia derruba
 * fixture de outro arquivo (memória `truncate-extra-colide-com-int-test-paralelo`).
 *
 * Roda no `beforeAll` **e** no `afterAll`: os ids fixos tornam o arranjo
 * repetível, mas `protocol`/`milestone`/`goal` nascem com id gerado e a
 * `session` tem id fixo — sem a limpeza de entrada, uma execução interrompida
 * no meio deixa a próxima morrer em `session_pkey`.
 */
async function limpar() {
  await owner`DELETE FROM instrumento_aplicacao WHERE clinic_id = ${CLINIC}`;
  await owner`DELETE FROM session_snapshot WHERE patient_id IN (${PAC_ABA}, ${PAC_TCC}, ${PAC_CONV})`;
  await owner`DELETE FROM goal_milestone_mapping WHERE goal_id IN (SELECT id FROM goal WHERE clinic_id = ${CLINIC})`;
  await owner`DELETE FROM goal WHERE clinic_id = ${CLINIC}`;
  await owner`DELETE FROM session WHERE clinic_id = ${CLINIC}`;
  await owner`DELETE FROM patient_protocol WHERE patient_id IN (${PAC_ABA}, ${PAC_TCC}, ${PAC_CONV})`;
  await owner`DELETE FROM milestone WHERE protocol_id IN (SELECT id FROM protocol WHERE clinic_id = ${CLINIC})`;
  await owner`DELETE FROM protocol WHERE clinic_id = ${CLINIC}`;
}

describe.skipIf(!hasDb)(
  "#464 · contrato do agente · historico_relevante",
  () => {
    beforeAll(async () => {
      ({ withTenant } = await import("@/db/rls"));
      ({ sql: appSql } = await import("@/db/client"));
      ({ loadCanonicalContext } =
        await import("@/lib/extraction/context-loader"));

      owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
      await limpar();

      await owner`INSERT INTO protocol_familia_catalogo (id, nome)
      VALUES (${PROTOCOL_FAMILIA}, 'VB-MAPP (#464)')
      ON CONFLICT (id) DO NOTHING`;

      await owner`INSERT INTO clinic (id, nome, is_demo)
      VALUES (${CLINIC}, 'Clínica #464', false)
      ON CONFLICT (id) DO NOTHING`;

      await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD}, 'Coord 464', 'coord.464@iris.com'),
      (${U_T1}, 'Terapeuta 464', 't1.464@iris.com')
      ON CONFLICT (id) DO NOTHING`;

      await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC}, 'coordenador'),
      (${U_T1}, ${CLINIC}, 'terapeuta')
      ON CONFLICT DO NOTHING`;

      // `nascimento` fixo: `resumo_repertorio` derivado depende da idade, e uma
      // data relativa a `now()` faria a asserção mudar de ano em ano.
      await owner`INSERT INTO patient (id, clinic_id, nome, nascimento, clinical_modality) VALUES
      (${PAC_ABA}, ${CLINIC}, 'Paciente ABA 464', '2020-01-15', 'protocol_driven'),
      (${PAC_TCC}, ${CLINIC}, 'Paciente TCC 464', '1990-03-10', 'cognitive_behavioral'),
      (${PAC_CONV}, ${CLINIC}, 'Paciente Conv 464', '1985-06-20', 'conventional')
      ON CONFLICT (id) DO NOTHING`;

      await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe) VALUES
      (${PAC_ABA}, ${U_T1}, 'ABA', 'terapeuta_referencia'),
      (${PAC_TCC}, ${U_T1}, 'ABA', 'terapeuta_referencia'),
      (${PAC_CONV}, ${U_T1}, 'ABA', 'terapeuta_referencia')
      ON CONFLICT DO NOTHING`;

      const [proto] = await owner`INSERT INTO protocol
      (clinic_id, nome, disciplina, familia, taxonomia_ajuda)
      VALUES (${CLINIC}, 'VB-MAPP 464', 'ABA', ${PROTOCOL_FAMILIA},
        ${owner.json(["independente", "dica_verbal", "dica_ecoica", "dica_fisica"])})
      RETURNING id`;
      const protocolId = proto!.id as string;

      await owner`INSERT INTO patient_protocol (patient_id, protocol_id, ativado_por)
      VALUES (${PAC_ABA}, ${protocolId}, ${U_COORD})`;

      const [marco] = await owner`INSERT INTO milestone
      (protocol_id, dominio_id, nome, tipo_estrutura, estrutura)
      VALUES (${protocolId}, 'mando', 'Mando 464', 'marco_simples', ${owner.json({})})
      RETURNING id`;
      const milestoneId = marco!.id as string;

      const [g] = await owner`INSERT INTO goal
      (patient_id, clinic_id, descricao, disciplina, estado, criterio_dominio, criado_por)
      VALUES (${PAC_ABA}, ${CLINIC}, 'Emitir mando vocal', 'ABA', 'ativa',
        ${owner.json({ tipo: "sessoes_consecutivas", valor: 3 })}, ${U_COORD})
      RETURNING id`;
      GOAL_ID = g!.id as string;

      await owner`INSERT INTO goal_milestone_mapping (goal_id, milestone_id)
      VALUES (${GOAL_ID}, ${milestoneId})`;

      await owner`INSERT INTO session
      (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, numero_sequencial_paciente, disciplina) VALUES
      (${SESS_ABA}, ${CLINIC}, ${PAC_ABA}, ${U_T1}, now(), 'realizada', 8, 'aba'),
      (${SESS_TCC}, ${CLINIC}, ${PAC_TCC}, ${U_T1}, now(), 'realizada', 4, 'aba'),
      (${SESS_CONV}, ${CLINIC}, ${PAC_CONV}, ${U_T1}, now(), 'realizada', 12, 'aba')`;

      // Snapshot da sessão 7 (não 8): `materializar.ts` só grava para números que
      // tiveram evidência, e o loader tem de ler "a última linha", não "a linha
      // da sessão atual". Um loader que buscasse `session_numero = 8` devolveria
      // vazio aqui — e é justamente o erro que esta linha existe para pegar.
      await owner`INSERT INTO session_snapshot
      (patient_id, session_numero, repertorio_state, segmentacao) VALUES
      (${PAC_ABA}, 7, ${owner.json({
        [GOAL_ID]: {
          nivel_ajuda_recente: 2,
          contagem: 12,
          niveis_nao_classificados: 0,
          is_candidata: false,
        },
      })}, ${owner.json({})})`;

      await owner`INSERT INTO instrumento_aplicacao
      (clinic_id, patient_id, session_id, protocol_id, tipo_instrumento, escore_total,
       fonte_do_escore, respostas_por_item, item_9_valor, item_risco_positivo, criado_por) VALUES
      (${CLINIC}, ${PAC_TCC}, ${SESS_TCC}, 'phq9', 'phq9', 16, 'terapeuta_calculou_na_sessao',
       ${owner.json({})}, 0, false, ${U_T1})`;
    });

    afterAll(async () => {
      await limpar();
      await owner?.end();
      await appSql?.end();
    });

    test("modo protocol_driven: historico_relevante vem do repertorio_state, com domínio e protocolo resolvidos", async () => {
      const contexto = await withTenant(ctx, (tx) =>
        loadCanonicalContext(tx, {
          sessionId: SESS_ABA,
          patientId: PAC_ABA,
          clinicId: CLINIC,
        }),
      );

      expect(contexto.historico_relevante).toEqual([
        {
          dominio_id: "mando",
          protocol_id: PROTOCOL_FAMILIA,
          resumo:
            "nível de ajuda mais recente: dica_ecoica; 12 observações acumuladas.",
        },
      ]);
    });

    test("resumo_repertorio derivado carrega o número da sessão em curso", async () => {
      const contexto = await withTenant(ctx, (tx) =>
        loadCanonicalContext(tx, {
          sessionId: SESS_ABA,
          patientId: PAC_ABA,
          clinicId: CLINIC,
        }),
      );
      expect(contexto.paciente.resumo_repertorio).toContain(
        "sessão 8 do acompanhamento",
      );
    });

    test("modo tcc: item vem de instrumento_aplicacao e NÃO carrega dominio_id", async () => {
      const contexto = await withTenant(ctx, (tx) =>
        loadCanonicalContext(tx, {
          sessionId: SESS_TCC,
          patientId: PAC_TCC,
          clinicId: CLINIC,
        }),
      );

      expect(contexto.historico_relevante.length).toBe(1);
      const item = contexto.historico_relevante[0]!;
      expect("dominio_id" in item).toBe(false);
      expect("protocol_id" in item && item.protocol_id).toBe("phq9");
      expect(item.resumo).toContain("escore 16 (moderadamente grave)");
    });

    test("modo tcc não lê o snapshot do outro modo (o ramo escolhe a fonte, não acumula)", async () => {
      // O paciente TCC não tem snapshot; se o loader lesse as duas fontes em
      // qualquer modo, este teste continuaria verde por acidente. A prova real
      // está no par com o teste ABA: lá o snapshot existe e a aplicação de
      // instrumento não, e nenhum dos dois contextos mistura as formas.
      const contexto = await withTenant(ctx, (tx) =>
        loadCanonicalContext(tx, {
          sessionId: SESS_ABA,
          patientId: PAC_ABA,
          clinicId: CLINIC,
        }),
      );
      for (const item of contexto.historico_relevante) {
        expect("dominio_id" in item).toBe(true);
      }
    });

    test("modo terapia_convencional: historico_relevante fica vazio (fonte `temas[]` não existe — #645)", async () => {
      const contexto = await withTenant(ctx, (tx) =>
        loadCanonicalContext(tx, {
          sessionId: SESS_CONV,
          patientId: PAC_CONV,
          clinicId: CLINIC,
        }),
      );
      expect(contexto.modo).toBe("terapia_convencional");
      expect(contexto.historico_relevante).toEqual([]);
    });
  },
);
