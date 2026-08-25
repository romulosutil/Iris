/**
 * Integração/RLS — revogação de consentimento (#133/#134/#135, migrações 0052 e
 * 0053) + correções do predicado de regime corrente e do gate por finalidade.
 *
 * O que esta suíte tem que provar, e por que cada asserção é escrita assim:
 *
 *  - O 0053 REESCREVEU (DROP + CREATE) 24 policies de escrita. O risco número um
 *    não é "a trava não funciona", é "a trava funciona e o guard de PAPEL ou de
 *    TENANT sumiu junto no copy-paste". Por isso os casos 1 e 2 rodam contra
 *    paciente DESTRAVADO: se falhassem por causa do gate, não provariam nada.
 *
 *  - Um teste que só afirma "a operação falhou" não distingue "falhou pelo
 *    motivo certo" de "a policy inteira quebrou". Então, sempre que possível,
 *    cada caso prova o PAR — a mesma operação, com o MESMO usuário e a MESMA
 *    fixture, falha travada e passa destravada. Quando o par não é possível
 *    (constraint, trigger, FK, GRANT), a asserção casa o NOME da constraint ou
 *    o texto da exceção, nunca um `.rejects.toThrow()` nu.
 *
 * Estado de trava é dado 100% por linhas de `consent`, então `travar`/`destravar`
 * mexem só em `consent` (como owner, que pode DELETE — `app_role` não pode). Cada
 * teste declara o estado de que precisa no início: a suíte não depende de ordem.
 *
 * Roda com `pnpm test:rls`. Exige DATABASE_URL apontando para uma role SEM
 * BYPASSRLS (iris_app) — com a role dona a RLS não se aplica e os casos
 * negativos viram vácuo. Auto-skip sem DB.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "../../src/db/rls";
import { hasDb } from "./integration-env";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })
  : null;

const CLINIC_A = "00000000-0000-0000-0000-0000000053a1";
const CLINIC_B = "00000000-0000-0000-0000-0000000053b1";

const U_COORD = "00000000-0000-0000-0000-000000053c01";
const U_TER = "00000000-0000-0000-0000-000000053701";
const U_RECEP = "00000000-0000-0000-0000-000000053501";
const U_COORD_B = "00000000-0000-0000-0000-000000053c02";

const P_LIVRE = "00000000-0000-0000-0000-0000000530a0"; // sem consent nenhum — nunca trava
const P_MENOR = "00000000-0000-0000-0000-0000000530a1";
const P_18 = "00000000-0000-0000-0000-0000000530a2";
const P_ADULTO = "00000000-0000-0000-0000-0000000530a3";
const P_PURGA = "00000000-0000-0000-0000-0000000530a4";
const P_TIE = "00000000-0000-0000-0000-0000000530a5";
const P_CHK = "00000000-0000-0000-0000-0000000530a6";
const P_B = "00000000-0000-0000-0000-0000000530b1";

const C_MENOR = "00000000-0000-0000-0000-000000053c11"; // concessão de regime de P_MENOR
const C_18_MENOR = "00000000-0000-0000-0000-000000053c12";
const C_ADULTO = "00000000-0000-0000-0000-000000053c13";
const C_PURGA = "00000000-0000-0000-0000-000000053c14";
const C_B = "00000000-0000-0000-0000-000000053c15";
const C_CHK = "00000000-0000-0000-0000-000000053c16";
// Empate de `assinado_em` no caso 10: LO < HI na ordenação de uuid.
const C_TIE_LO = "00000000-0000-0000-0000-0000000531aa";
const C_TIE_HI = "00000000-0000-0000-0000-0000000531bb";

const SESS_MENOR = "00000000-0000-0000-0000-0000005301a1";
const SESS_ADULTO = "00000000-0000-0000-0000-0000005301a3";
const SESS_LIVRE = "00000000-0000-0000-0000-0000005301a0";
const PROTO = "00000000-0000-0000-0000-000000530f01";
const MILE = "00000000-0000-0000-0000-000000530d01";
const EXTR_MENOR = "00000000-0000-0000-0000-000000530e01";
const EV_MENOR = "00000000-0000-0000-0000-000000530e02";
const REP_MENOR = "00000000-0000-0000-0000-000000530e03";
const GOAL_MENOR = "00000000-0000-0000-0000-000000530e04";
const NOTE_MENOR = "00000000-0000-0000-0000-000000530e05";
const FAMILIA = "aba_marcos_desenvolvimento";

const ctx = (role: string, userId: string, clinicId = CLINIC_A) =>
  ({ role, userId, clinicId }) as TenantContext;
const coord = ctx("coordenador", U_COORD);
const ter = ctx("terapeuta", U_TER);
const recep = ctx("admin_recepcao", U_RECEP);
const coordB = ctx("coordenador", U_COORD_B, CLINIC_B);

/** Insere a linha de revogação que derruba `consentId`. Deixa o histórico intacto. */
const revogar = (patientId: string, consentId: string) =>
  owner!`INSERT INTO consent (patient_id, tipo, versao_termo, consent_revogado_id)
    VALUES (${patientId}, 'revogacao_consentimento', 'revogacao-teste', ${consentId})`;

/** Desfaz as revogações do paciente — só o owner consegue (append-only p/ app_role). */
const desrevogar = (patientId: string) =>
  owner!`DELETE FROM consent WHERE patient_id = ${patientId}
    AND tipo::text = 'revogacao_consentimento'`;

/**
 * Devolve a mensagem REAL do Postgres de uma promise que tem de rejeitar.
 *
 * Sem isto, `rejects.toThrow(/row-level security/)` é inútil no caminho Drizzle:
 * o driver embrulha tudo em `Error("Failed query: ...")` e a causa fica em
 * `.cause`. Um teste que casasse só a mensagem de topo casaria QUALQUER falha —
 * sintaxe, coluna inexistente, tipo errado — e passaria por engano. Aqui a
 * cadeia inteira é achatada, e a asserção depois casa o texto específico.
 * Se a operação NÃO rejeitar, isto falha alto: silêncio não é aprovação.
 */
async function erroDe(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const partes: string[] = [];
    let atual: unknown = e;
    while (atual && typeof atual === "object") {
      const o = atual as {
        message?: unknown;
        detail?: unknown;
        cause?: unknown;
      };
      if (o.message) partes.push(String(o.message));
      if (o.detail) partes.push(String(o.detail));
      atual = o.cause;
    }
    return partes.join(" | ");
  }
  throw new Error(
    "esperava rejeição do Postgres, mas a operação foi bem-sucedida",
  );
}

/** Lê o predicado de trava pelos olhos de um usuário real (passa por RLS + tenant). */
async function travado(c: TenantContext, patientId: string) {
  const r = await withTenant(c, (tx) =>
    tx.execute(
      sql`SELECT app_prontuario_somente_leitura(${patientId}::uuid)::text AS v`,
    ),
  );
  return (r as unknown as { v: string }[])[0]?.v;
}

async function finalidadeRevogada(
  c: TenantContext,
  patientId: string,
  finalidade: string,
) {
  const r = await withTenant(c, (tx) =>
    tx.execute(
      sql`SELECT app_finalidade_revogada(${patientId}::uuid, ${finalidade})::text AS v`,
    ),
  );
  return (r as unknown as { v: string }[])[0]?.v;
}

/** INSERT de extraction pelo terapeuta dono. Devolve as linhas de RETURNING. */
const inserirExtraction = (sessionId: string, trecho: string) =>
  withTenant(ter, (tx) =>
    tx.execute(sql`INSERT INTO extraction
      (session_id, clinic_id, subtipo, trecho_fonte, confianca, payload)
      VALUES (${sessionId}::uuid, ${CLINIC_A}::uuid, 'evidencia', ${trecho}, 'alta', '{}'::jsonb)
      RETURNING id`),
  );

/** INSERT de goal pelo coordenador. Caminho `app_prontuario_somente_leitura(patient_id)`. */
const inserirGoal = (patientId: string, descricao: string) =>
  withTenant(coord, (tx) =>
    tx.execute(sql`INSERT INTO goal (patient_id, clinic_id, descricao, criterio_dominio, criado_por)
      VALUES (${patientId}::uuid, ${CLINIC_A}::uuid, ${descricao}, '{}'::jsonb, ${U_COORD}::uuid)
      RETURNING id`),
  );

/** INSERT de report pelo coordenador. Caminho de finalidade `exportacao_relatorios`. */
const inserirReport = (patientId: string) =>
  withTenant(coord, (tx) =>
    tx.execute(sql`INSERT INTO report
      (clinic_id, patient_id, tipo, periodo_inicio, periodo_fim, status, payload)
      VALUES (${CLINIC_A}::uuid, ${patientId}::uuid, 'familia', '2026-01-01', '2026-01-31',
              'rascunho', '{}'::jsonb)
      RETURNING id`),
  );

describe.skipIf(!hasDb)(
  "0052/0053 · revogação de consentimento e gate de prontuário",
  () => {
    beforeAll(async () => {
      await owner!`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
      protocol, session, session_note, session_protocol_scope, audio_capture, extraction,
      evidence, evidence_revision, evidence_query, goal, goal_candidacy, milestone,
      milestone_candidacy, goal_milestone_mapping, patient_protocol,
      patient_clinical_profile, patient_alvo_disciplina, reinforcer_profile,
      session_snapshot, report, report_pdf, consent, audit_log, alerta_risco_clinico
      RESTART IDENTITY CASCADE`;
      await owner!`INSERT INTO protocol_familia_catalogo (id, nome)
      VALUES (${FAMILIA}, 'Marcos de desenvolvimento (ABA)') ON CONFLICT (id) DO NOTHING`;

      await owner!`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINIC_A}, 'Clínica 53 A', false), (${CLINIC_B}, 'Clínica 53 B', false)`;
      await owner!`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD}, 'Coord A', 'coord@rev53.test'),
      (${U_TER}, 'Terapeuta A', 'ter@rev53.test'),
      (${U_RECEP}, 'Recepção A', 'recep@rev53.test'),
      (${U_COORD_B}, 'Coord B', 'coordb@rev53.test')`;
      await owner!`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC_A}, 'coordenador'),
      (${U_TER}, ${CLINIC_A}, 'terapeuta'),
      (${U_RECEP}, ${CLINIC_A}, 'admin_recepcao'),
      (${U_COORD_B}, ${CLINIC_B}, 'coordenador')`;

      await owner!`INSERT INTO patient (id, clinic_id, nome, nascimento) VALUES
      (${P_LIVRE}, ${CLINIC_A}, 'Sem consent', '2015-01-01'),
      (${P_MENOR}, ${CLINIC_A}, 'Menor', '2015-01-01'),
      (${P_18}, ${CLINIC_A}, 'Fez 18', '2008-01-01'),
      (${P_ADULTO}, ${CLINIC_A}, 'Adulto', '1990-01-01'),
      (${P_PURGA}, ${CLINIC_A}, 'Purga', '1990-01-01'),
      (${P_TIE}, ${CLINIC_A}, 'Empate', '1990-01-01'),
      (${P_CHK}, ${CLINIC_A}, 'Constraints', '1990-01-01'),
      (${P_B}, ${CLINIC_B}, 'Paciente B', '2015-01-01')`;

      // Desde a 0128 (#352) `app_purgar_paciente` tem gate de retenção: sem
      // `alta_em` o sujeito é inelegível por construção, e o caso 9 passaria a
      // medir a recusa do gate em vez da interação com a revogação de consent.
      await owner!`UPDATE patient SET alta_em = '2005-01-01' WHERE id = ${P_PURGA}`;

      // Concessões de regime. Nenhuma revogação aqui: o estado inicial é DESTRAVADO
      // para todos, e cada teste trava o que precisar.
      await owner!`INSERT INTO consent (id, patient_id, tipo, responsavel_signatario, versao_termo) VALUES
      (${C_MENOR}, ${P_MENOR}, 'tratamento_dados_menor', 'Mãe', 'menor-v1'),
      (${C_18_MENOR}, ${P_18}, 'tratamento_dados_menor', 'Mãe', 'menor-v1'),
      (${C_PURGA}, ${P_PURGA}, 'tratamento_dados_menor', 'Mãe', 'menor-v1'),
      (${C_B}, ${P_B}, 'tratamento_dados_menor', 'Mãe', 'menor-v1'),
      (${C_CHK}, ${P_CHK}, 'tratamento_dados_menor', 'Mãe', 'menor-v1')`;
      await owner!`INSERT INTO consent (id, patient_id, tipo, versao_termo)
      VALUES (${C_ADULTO}, ${P_ADULTO}, 'autoconsentimento_titular_adulto', 'adulto-v1')`;

      await owner!`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe) VALUES
      (${P_LIVRE}, ${U_TER}, 'ABA', 'terapeuta_referencia'),
      (${P_MENOR}, ${U_TER}, 'ABA', 'terapeuta_referencia'),
      (${P_18}, ${U_TER}, 'ABA', 'terapeuta_referencia'),
      (${P_ADULTO}, ${U_TER}, 'ABA', 'terapeuta_referencia')`;

      await owner!`INSERT INTO protocol (id, clinic_id, nome, disciplina, familia)
      VALUES (${PROTO}, ${CLINIC_A}, 'VB-MAPP 53', 'ABA', ${FAMILIA})`;
      await owner!`INSERT INTO milestone (id, protocol_id, dominio_id, nome, tipo_estrutura, estrutura)
      VALUES (${MILE}, ${PROTO}, 'mando', 'Pedir item', 'marco_simples', ${owner!.json({ escala: [] })})`;

      await owner!`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina, numero_sequencial_paciente) VALUES
      (${SESS_LIVRE}, ${CLINIC_A}, ${P_LIVRE}, ${U_TER}, now(), 'realizada', 'desconhecida', 1),
      (${SESS_MENOR}, ${CLINIC_A}, ${P_MENOR}, ${U_TER}, now(), 'realizada', 'desconhecida', 1),
      (${SESS_ADULTO}, ${CLINIC_A}, ${P_ADULTO}, ${U_TER}, now(), 'realizada', 'desconhecida', 1)`;

      // Linhas pré-existentes de P_MENOR, para o sweep de SELECT (caso 7) e para o
      // DELETE de extraction (caso 6). Semeadas pelo owner porque o teste precisa
      // delas existindo INDEPENDENTE do estado de trava.
      await owner!`INSERT INTO extraction (id, session_id, clinic_id, subtipo, trecho_fonte, confianca, payload)
      VALUES (${EXTR_MENOR}, ${SESS_MENOR}, ${CLINIC_A}, 'evidencia', 'pediu água', 'alta', '{}')`;
      await owner!`INSERT INTO session_note (id, session_id, clinic_id, tipo, texto, autor_id)
      VALUES (${NOTE_MENOR}, ${SESS_MENOR}, ${CLINIC_A}, 'captura_rapida', 'nota', ${U_TER})`;
      await owner!`INSERT INTO goal (id, patient_id, clinic_id, descricao, criterio_dominio, criado_por)
      VALUES (${GOAL_MENOR}, ${P_MENOR}, ${CLINIC_A}, 'meta semeada', '{}', ${U_COORD})`;
      await owner!`INSERT INTO evidence (id, extraction_id, patient_id, session_id, session_numero,
      alvo_ordinal, classificacao_original, aprovado_por)
      VALUES (${EV_MENOR}, ${EXTR_MENOR}, ${P_MENOR}, ${SESS_MENOR}, 1, 1, '{}', ${U_COORD})`;
      await owner!`INSERT INTO report (id, clinic_id, patient_id, tipo, periodo_inicio, periodo_fim, status, payload)
      VALUES (${REP_MENOR}, ${CLINIC_A}, ${P_MENOR}, 'familia', '2026-01-01', '2026-01-31', 'rascunho', '{}')`;
      await owner!`INSERT INTO patient_clinical_profile (patient_id, diagnostico)
      VALUES (${P_MENOR}, 'F84')`;
      await owner!`INSERT INTO patient_alvo_disciplina (clinic_id, patient_id, disciplina, horas_alvo_semana, vigencia_inicio)
      VALUES (${CLINIC_A}, ${P_MENOR}, 'ABA', 10, '2026-01-01')`;
      await owner!`INSERT INTO patient_protocol (patient_id, protocol_id, ativado_por)
      VALUES (${P_MENOR}, ${PROTO}, ${U_COORD})`;
      await owner!`INSERT INTO milestone_candidacy (patient_id, milestone_id, is_candidate)
      VALUES (${P_MENOR}, ${MILE}, true)`;
      await owner!`INSERT INTO reinforcer_profile (extraction_id, patient_id, session_id, session_numero, item_atividade, valencia)
      VALUES (${EXTR_MENOR}, ${P_MENOR}, ${SESS_MENOR}, 1, 'bolha', 'alta')`;
      await owner!`INSERT INTO audio_capture (session_id, clinic_id) VALUES (${SESS_MENOR}, ${CLINIC_A})`;
      await owner!`INSERT INTO session_protocol_scope (session_id, protocol_id) VALUES (${SESS_MENOR}, ${PROTO})`;
      await owner!`INSERT INTO session_snapshot (patient_id, session_numero, repertorio_state, segmentacao)
      VALUES (${P_MENOR}, 1, '{}', '{}')`;
    });

    afterAll(async () => {
      await owner?.end();
      const { sql: appSql } = await import("../../src/db/client");
      await appSql?.end();
    });

    // =========================================================================
    // Caso 1 — o guard de PAPEL sobreviveu à reescrita das policies
    // =========================================================================
    // P_LIVRE não tem consent nenhum, logo NUNCA está travado: se o INSERT do
    // terapeuta falhasse por causa do gate, este teste passaria por engano. O par
    // com o coordenador é o que prova que a policy inteira não quebrou — se o
    // predicado tivesse virado `false`, o segundo INSERT também falharia.
    test("caso 1 · terapeuta continua SEM INSERT em session (guard de papel intacto)", async () => {
      expect(await travado(ter, P_LIVRE)).toBe("false");

      expect(
        await erroDe(
          withTenant(ter, (tx) =>
            tx.execute(sql`INSERT INTO session
            (clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina)
            VALUES (${CLINIC_A}::uuid, ${P_LIVRE}::uuid, ${U_TER}::uuid, now() + interval '10 days',
                  'agendada', 'ABA')
            RETURNING id`),
          ),
        ),
      ).toMatch(/row-level security policy for table "session"/);

      const ok = await withTenant(coord, (tx) =>
        tx.execute(sql`INSERT INTO session
        (clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina)
        VALUES (${CLINIC_A}::uuid, ${P_LIVRE}::uuid, ${U_TER}::uuid, now(), 'agendada', 'ABA')
        RETURNING id`),
      );
      expect(ok).toHaveLength(1);
    });

    test("caso 1b · terapeuta continua SEM INSERT em patient_alvo_disciplina (policy reescrita)", async () => {
      // Mesma armadilha do 1: paciente destravado, e o par com recepção prova que
      // a policy segue permitindo quem sempre pôde.
      expect(
        await erroDe(
          withTenant(ter, (tx) =>
            tx.execute(sql`INSERT INTO patient_alvo_disciplina
            (clinic_id, patient_id, disciplina, horas_alvo_semana, vigencia_inicio)
            VALUES (${CLINIC_A}::uuid, ${P_LIVRE}::uuid, 'ABA', 8, '2026-02-01') RETURNING id`),
          ),
        ),
      ).toMatch(
        /row-level security policy for table "patient_alvo_disciplina"/,
      );

      const ok = await withTenant(recep, (tx) =>
        tx.execute(sql`INSERT INTO patient_alvo_disciplina
        (clinic_id, patient_id, disciplina, horas_alvo_semana, vigencia_inicio)
        VALUES (${CLINIC_A}::uuid, ${P_LIVRE}::uuid, 'ABA', 8, '2026-02-01') RETURNING id`),
      );
      expect(ok).toHaveLength(1);
    });

    // =========================================================================
    // Caso 2 — o guard de TENANT sobreviveu, e a trava não vira oráculo
    // =========================================================================
    test("caso 2 · cross-tenant continua bloqueado nas tabelas tocadas", async () => {
      // P_B está TRAVADO na clínica B. Se o predicado de trava vazasse esse fato,
      // o coordenador de A leria "true" — e saberia que existe um prontuário
      // revogado em outro tenant. Tem que ler "false" (ramo fora-da-clínica).
      await revogar(P_B, C_B);
      expect(await travado(coordB, P_B)).toBe("true"); // dentro do tenant: travado
      expect(await travado(coord, P_B)).toBe("false"); // fora do tenant: não vaza

      // E a escrita cross-tenant continua barrada — por tenant, não pelo gate.
      expect(await erroDe(inserirGoal(P_B, "meta cross-tenant"))).toMatch(
        /row-level security policy for table "goal"/,
      );
      expect(await erroDe(inserirReport(P_B))).toMatch(
        /row-level security policy for table "report"/,
      );
      expect(
        await erroDe(
          withTenant(coord, (tx) =>
            tx.execute(sql`INSERT INTO patient_clinical_profile (patient_id, diagnostico)
            VALUES (${P_B}::uuid, 'F84') RETURNING id`),
          ),
        ),
      ).toMatch(
        /row-level security policy for table "patient_clinical_profile"/,
      );

      // Par: as MESMAS três escritas passam para um paciente da própria clínica.
      expect(await inserirGoal(P_LIVRE, "meta same-tenant")).toHaveLength(1);
      expect(await inserirReport(P_LIVRE)).toHaveLength(1);
      expect(
        await withTenant(coord, (tx) =>
          tx.execute(sql`INSERT INTO patient_clinical_profile (patient_id, diagnostico)
          VALUES (${P_LIVRE}::uuid, 'F84') RETURNING id`),
        ),
      ).toHaveLength(1);
    });

    // =========================================================================
    // Caso 3 — reversibilidade
    // =========================================================================
    test("caso 3 · revogar → nova concessão de regime → escrita clínica volta", async () => {
      await desrevogar(P_MENOR);
      expect(await travado(coord, P_MENOR)).toBe("false");
      expect(await inserirGoal(P_MENOR, "antes da revogação")).toHaveLength(1);

      await revogar(P_MENOR, C_MENOR);
      expect(await travado(coord, P_MENOR)).toBe("true");
      expect(await erroDe(inserirGoal(P_MENOR, "durante a trava"))).toMatch(
        /row-level security policy for table "goal"/,
      );

      // Reconsentimento é LINHA NOVA (consent é append-only) — não um UPDATE.
      const novo = "00000000-0000-0000-0000-000000053c21";
      await owner!`INSERT INTO consent (id, patient_id, tipo, responsavel_signatario, versao_termo)
      VALUES (${novo}, ${P_MENOR}, 'tratamento_dados_menor', 'Mãe', 'menor-v2')`;
      expect(await travado(coord, P_MENOR)).toBe("false");
      expect(
        await inserirGoal(P_MENOR, "depois do reconsentimento"),
      ).toHaveLength(1);

      await owner!`DELETE FROM consent WHERE id = ${novo}`;
      await desrevogar(P_MENOR);
    });

    // =========================================================================
    // Caso 4 — maioridade destrava (#135)
    // =========================================================================
    test("caso 4 · menor revogado que completa 18 e autoconsente destrava", async () => {
      await desrevogar(P_18);
      await owner!`DELETE FROM consent WHERE patient_id = ${P_18} AND id <> ${C_18_MENOR}`;

      await revogar(P_18, C_18_MENOR);
      expect(await travado(coord, P_18)).toBe("true");
      expect(
        await erroDe(inserirGoal(P_18, "travado por maioridade pendente")),
      ).toMatch(/row-level security policy for table "goal"/);

      const cAdulto18 = "00000000-0000-0000-0000-000000053c22";
      await owner!`INSERT INTO consent (id, patient_id, tipo, versao_termo)
      VALUES (${cAdulto18}, ${P_18}, 'autoconsentimento_titular_adulto', 'adulto-v1')`;
      expect(await travado(coord, P_18)).toBe("false");
      expect(
        await inserirGoal(P_18, "destravado pelo autoconsentimento"),
      ).toHaveLength(1);
    });

    // =========================================================================
    // Caso 16 — o §13: adulto que revoga o PRÓPRIO autoconsentimento não trava,
    // mesmo tendo histórico de representação (foi menor um dia).
    // =========================================================================
    // Este é o caso que o predicado "histórico" errava: ele travava porque EXISTE
    // uma linha `tratamento_dados_menor` no passado. O predicado correto olha só o
    // regime CORRENTE. Se alguém reverter para a versão histórica, este teste cai.
    test("caso 16 · ex-menor adulto que revoga o autoconsentimento NÃO trava (§13)", async () => {
      const cAdulto18 = "00000000-0000-0000-0000-000000053c22";
      // Estado herdado do caso 4 é recriado aqui para não depender de ordem.
      await desrevogar(P_18);
      await owner!`DELETE FROM consent WHERE patient_id = ${P_18} AND id <> ${C_18_MENOR}`;
      await revogar(P_18, C_18_MENOR);
      await owner!`INSERT INTO consent (id, patient_id, tipo, versao_termo)
      VALUES (${cAdulto18}, ${P_18}, 'autoconsentimento_titular_adulto', 'adulto-v1')`;
      expect(await travado(coord, P_18)).toBe("false");

      // Agora o adulto revoga o próprio autoconsentimento. Regime corrente =
      // autoconsentimento_titular_adulto (revogado) → NÃO é tipo representado →
      // NÃO trava. O registro clínico do adulto continua.
      await revogar(P_18, cAdulto18);
      expect(await travado(coord, P_18)).toBe("false");
      expect(
        await inserirGoal(P_18, "adulto revogado ainda grava"),
      ).toHaveLength(1);
    });

    // =========================================================================
    // Caso 5 — adulto revoga a FINALIDADE: clínica continua, IA e exportação não
    // =========================================================================
    test("caso 5 · adulto com finalidade revogada: session/session_note gravam; extração e exportação não", async () => {
      await owner!`DELETE FROM consent WHERE patient_id = ${P_ADULTO} AND id <> ${C_ADULTO}`;
      const cIa = "00000000-0000-0000-0000-000000053c31";
      const cExp = "00000000-0000-0000-0000-000000053c32";
      await owner!`INSERT INTO consent (id, patient_id, tipo, versao_termo) VALUES
      (${cIa}, ${P_ADULTO}, 'uso_ia_processamento', 'ia-v1'),
      (${cExp}, ${P_ADULTO}, 'exportacao_relatorios', 'exp-v1')`;

      // Antes: as duas finalidades vigentes → extração e relatório passam.
      expect(
        await finalidadeRevogada(coord, P_ADULTO, "uso_ia_processamento"),
      ).toBe("false");
      expect(
        await inserirExtraction(SESS_ADULTO, "antes da revogação"),
      ).toHaveLength(1);
      expect(await inserirReport(P_ADULTO)).toHaveLength(1);

      await revogar(P_ADULTO, cIa);
      await revogar(P_ADULTO, cExp);

      // O prontuário NÃO trava: o adulto nunca esteve sob representação.
      expect(await travado(coord, P_ADULTO)).toBe("false");
      expect(
        await finalidadeRevogada(coord, P_ADULTO, "uso_ia_processamento"),
      ).toBe("true");
      expect(
        await finalidadeRevogada(coord, P_ADULTO, "exportacao_relatorios"),
      ).toBe("true");

      // Escrita CLÍNICA continua — mesmo usuário, mesma sessão do INSERT que passou.
      expect(
        await withTenant(coord, (tx) =>
          tx.execute(sql`INSERT INTO session
          (clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina)
          VALUES (${CLINIC_A}::uuid, ${P_ADULTO}::uuid, ${U_TER}::uuid, now() + interval '30 days',
                  'agendada', 'ABA')
          RETURNING id`),
        ),
      ).toHaveLength(1);
      expect(
        await withTenant(ter, (tx) =>
          tx.execute(sql`INSERT INTO session_note (session_id, clinic_id, tipo, texto, autor_id)
          VALUES (${SESS_ADULTO}::uuid, ${CLINIC_A}::uuid, 'nota_consolidada', 'segue', ${U_TER}::uuid)
          RETURNING id`),
        ),
      ).toHaveLength(1);

      // Extração e exportação, não.
      expect(
        await erroDe(inserirExtraction(SESS_ADULTO, "depois da revogação")),
      ).toMatch(/row-level security policy for table "extraction"/);
      expect(await erroDe(inserirReport(P_ADULTO))).toMatch(
        /row-level security policy for table "report"/,
      );
    });

    // =========================================================================
    // Caso 17 — não-regressão: ZERO linha de finalidade ⇒ extração permitida
    // =========================================================================
    // Nenhum código do repo insere `uso_ia_processamento` hoje. Se o gate fosse
    // escrito com semântica positiva ("só extrai se houver consentimento de IA"),
    // TODO paciente existente pararia de extrair. Este teste é o que reprova essa
    // implementação.
    test("caso 17 · paciente sem NENHUMA linha de finalidade continua extraindo", async () => {
      const linhas =
        await owner!`SELECT 1 FROM consent WHERE patient_id = ${P_MENOR}
      AND tipo::text IN ('uso_ia_processamento','exportacao_relatorios')`;
      expect(linhas).toHaveLength(0);

      await desrevogar(P_MENOR);
      expect(
        await finalidadeRevogada(coord, P_MENOR, "uso_ia_processamento"),
      ).toBe("false");
      expect(
        await inserirExtraction(SESS_MENOR, "sem linha de finalidade"),
      ).toHaveLength(1);
      expect(await inserirReport(P_MENOR)).toHaveLength(1);
    });

    // =========================================================================
    // Caso 18 — finalidade revogada e depois reconsentida
    // =========================================================================
    test("caso 18 · finalidade revogada e reconsentida com linha nova volta a permitir extração", async () => {
      await desrevogar(P_ADULTO);
      await owner!`DELETE FROM consent WHERE patient_id = ${P_ADULTO} AND id <> ${C_ADULTO}`;
      const cIa1 = "00000000-0000-0000-0000-000000053c41";
      await owner!`INSERT INTO consent (id, patient_id, tipo, versao_termo, assinado_em)
      VALUES (${cIa1}, ${P_ADULTO}, 'uso_ia_processamento', 'ia-v1', now() - interval '2 days')`;
      await revogar(P_ADULTO, cIa1);
      expect(
        await finalidadeRevogada(coord, P_ADULTO, "uso_ia_processamento"),
      ).toBe("true");
      expect(
        await erroDe(inserirExtraction(SESS_ADULTO, "finalidade revogada")),
      ).toMatch(/row-level security policy for table "extraction"/);

      // Reconsentimento = linha NOVA e mais recente. A antiga continua revogada no
      // histórico — é a "mais recente" que manda.
      const cIa2 = "00000000-0000-0000-0000-000000053c42";
      await owner!`INSERT INTO consent (id, patient_id, tipo, versao_termo, assinado_em)
      VALUES (${cIa2}, ${P_ADULTO}, 'uso_ia_processamento', 'ia-v2', now())`;
      expect(
        await finalidadeRevogada(coord, P_ADULTO, "uso_ia_processamento"),
      ).toBe("false");
      expect(
        await inserirExtraction(SESS_ADULTO, "finalidade reconsentida"),
      ).toHaveLength(1);
    });

    // =========================================================================
    // Caso 19 — exportação revogada não fecha a LEITURA de report
    // =========================================================================
    test("caso 19 · com exportacao_relatorios revogada, report_select continua funcionando", async () => {
      await desrevogar(P_MENOR);
      const cExpM = "00000000-0000-0000-0000-000000053c51";
      await owner!`DELETE FROM consent WHERE id = ${cExpM}`;
      await owner!`INSERT INTO consent (id, patient_id, tipo, versao_termo)
      VALUES (${cExpM}, ${P_MENOR}, 'exportacao_relatorios', 'exp-v1')`;
      await revogar(P_MENOR, cExpM);
      expect(
        await finalidadeRevogada(coord, P_MENOR, "exportacao_relatorios"),
      ).toBe("true");

      // Escrita de relatório: barrada.
      expect(await erroDe(inserirReport(P_MENOR))).toMatch(
        /row-level security policy for table "report"/,
      );
      // Leitura de relatório: intocada (LGPD Art. 18, II).
      const lidos = await withTenant(coord, (tx) =>
        tx.execute(
          sql`SELECT id FROM report WHERE patient_id = ${P_MENOR}::uuid`,
        ),
      );
      expect(lidos.length).toBeGreaterThan(0);

      await desrevogar(P_MENOR);
      await owner!`DELETE FROM consent WHERE id = ${cExpM}`;
    });

    // =========================================================================
    // Caso 6 — DELETE em extraction bloqueado com prontuário travado
    // =========================================================================
    // DELETE barrado por RLS NÃO levanta erro: ele apaga zero linhas. Um teste que
    // só chamasse o DELETE e não olhasse a linha passaria com o gate ausente. Por
    // isso a asserção é sobre a EXISTÊNCIA da linha depois, e o par destravado
    // prova que o mesmo terapeuta consegue apagar quando pode.
    test("caso 6 · DELETE em extraction não apaga com prontuário travado, e apaga destravado", async () => {
      await desrevogar(P_MENOR);
      const alvo = "00000000-0000-0000-0000-000000530e11";
      await owner!`DELETE FROM extraction WHERE id = ${alvo}`;
      await owner!`INSERT INTO extraction (id, session_id, clinic_id, subtipo, trecho_fonte, confianca, payload)
      VALUES (${alvo}, ${SESS_MENOR}, ${CLINIC_A}, 'evidencia', 'alvo do delete', 'alta', '{}')`;

      await revogar(P_MENOR, C_MENOR);
      const apagadasTravado = await withTenant(ter, (tx) =>
        tx.execute(
          sql`DELETE FROM extraction WHERE id = ${alvo}::uuid RETURNING id`,
        ),
      );
      expect(apagadasTravado).toHaveLength(0);
      expect(
        await owner!`SELECT 1 FROM extraction WHERE id = ${alvo}`,
      ).toHaveLength(1);

      await desrevogar(P_MENOR);
      const apagadasDestravado = await withTenant(ter, (tx) =>
        tx.execute(
          sql`DELETE FROM extraction WHERE id = ${alvo}::uuid RETURNING id`,
        ),
      );
      expect(apagadasDestravado).toHaveLength(1);
      expect(
        await owner!`SELECT 1 FROM extraction WHERE id = ${alvo}`,
      ).toHaveLength(0);
    });

    // =========================================================================
    // Caso 7 — SELECT continua funcionando em TODAS as tabelas tocadas
    // =========================================================================
    test("caso 7 · com prontuário travado, SELECT continua em todas as tabelas do gate", async () => {
      await revogar(P_MENOR, C_MENOR);
      expect(await travado(coord, P_MENOR)).toBe("true");

      const porPaciente = [
        "session",
        "goal",
        "evidence",
        "report",
        "patient_clinical_profile",
        "patient_alvo_disciplina",
        "patient_protocol",
        "milestone_candidacy",
        "reinforcer_profile",
        "session_snapshot",
      ];
      for (const tabela of porPaciente) {
        const linhas = await withTenant(coord, (tx) =>
          tx.execute(sql`SELECT 1 AS x FROM ${sql.raw(`"${tabela}"`)}
          WHERE patient_id = ${P_MENOR}::uuid`),
        );
        expect(
          linhas.length,
          `SELECT em ${tabela} com prontuário travado`,
        ).toBeGreaterThan(0);
      }

      // Tabelas cujo vínculo é por session_id — lidas pelo terapeuta dono.
      for (const tabela of [
        "session_note",
        "extraction",
        "audio_capture",
        "session_protocol_scope",
      ]) {
        const linhas = await withTenant(ter, (tx) =>
          tx.execute(sql`SELECT 1 AS x FROM ${sql.raw(`"${tabela}"`)}
          WHERE session_id = ${SESS_MENOR}::uuid`),
        );
        expect(
          linhas.length,
          `SELECT em ${tabela} com prontuário travado`,
        ).toBeGreaterThan(0);
      }

      await desrevogar(P_MENOR);
    });

    // =========================================================================
    // Caso 8 — funções SECURITY DEFINER param no prontuário travado
    // =========================================================================
    // Estas funções rodam como a dona e NÃO passam por RLS: o gate das policies é
    // código morto para elas. A asserção casa a mensagem do guard novo — assim um
    // erro qualquer (tenant, equipe, meta de outro paciente) não é confundido com
    // "a trava funcionou".
    test("caso 8 · app_aplicar_candidatura e app_criar_alerta_risco param com paciente travado", async () => {
      await desrevogar(P_MENOR);
      const cand = () =>
        withTenant(coord, (tx) =>
          tx.execute(sql`SELECT app_aplicar_candidatura(${P_MENOR}::uuid, ${MILE}::uuid, NULL,
          true, now(), 3, 2)`),
        );
      const alerta = (trecho: string) =>
        withTenant(coord, (tx) =>
          tx.execute(sql`SELECT app_criar_alerta_risco(${P_MENOR}::uuid, ${SESS_MENOR}::uuid,
          'ideacao_suicida', 'ideacao_passiva', 'explicito', ${trecho}, 'detalhe de teste')`),
        );

      // Par positivo: destravado, as duas funcionam.
      await expect(cand()).resolves.toBeDefined();
      await expect(alerta("trecho destravado")).resolves.toBeDefined();

      await revogar(P_MENOR, C_MENOR);
      expect(await erroDe(cand())).toMatch(
        /somente-leitura: consentimento revogado/,
      );
      expect(await erroDe(alerta("trecho travado"))).toMatch(
        /somente-leitura: consentimento revogado/,
      );
      // E nenhum alerta novo entrou pelas costas.
      expect(
        await owner!`SELECT 1 FROM alerta_risco_clinico WHERE trecho_fonte = 'trecho travado'`,
      ).toHaveLength(0);

      await desrevogar(P_MENOR);
    });

    test("caso 8b · app_aplicar_snapshot também para com paciente travado", async () => {
      const snap = () =>
        withTenant(coord, (tx) =>
          tx.execute(
            sql`SELECT app_aplicar_snapshot(${P_MENOR}::uuid, 7, '{}'::jsonb, '{}'::jsonb)`,
          ),
        );
      await desrevogar(P_MENOR);
      await expect(snap()).resolves.toBeDefined();
      await revogar(P_MENOR, C_MENOR);
      expect(await erroDe(snap())).toMatch(
        /somente-leitura: consentimento revogado/,
      );
      await desrevogar(P_MENOR);
    });

    // =========================================================================
    // Caso 9 — expurgo funciona com revogação registrada
    // =========================================================================
    // A FK composta é `ON DELETE NO ACTION` justamente para isto: `RESTRICT`
    // checaria linha a linha e o par (revogação, revogada) quebraria o expurgo,
    // que é obrigação legal de eliminação.
    test("caso 9 · app_purgar_paciente funciona em paciente com revogação registrada", async () => {
      await revogar(P_PURGA, C_PURGA);
      expect(
        await owner!`SELECT 1 FROM consent WHERE patient_id = ${P_PURGA}`,
      ).toHaveLength(2);

      await withTenant(coord, (tx) =>
        tx.execute(
          sql`SELECT app_purgar_paciente(${P_PURGA}::uuid, 'teste de expurgo com revogação')`,
        ),
      );

      expect(
        await owner!`SELECT 1 FROM consent WHERE patient_id = ${P_PURGA}`,
      ).toHaveLength(0);
      expect(
        await owner!`SELECT 1 FROM patient WHERE id = ${P_PURGA}`,
      ).toHaveLength(0);
    });

    // =========================================================================
    // Caso 10 — desempate determinístico por `id`
    // =========================================================================
    // `assinado_em` tem DEFAULT now(), e now() é fixo dentro de uma transação:
    // duas concessões do mesmo BEGIN empatam. Sem `id DESC` a "mais recente" sairia
    // por ordem física do heap. Este teste não só exige determinismo — ele PINA a
    // direção: revogar o id MAIOR bloqueia, revogar o MENOR não. Um `id ASC`
    // inverteria as duas asserções.
    test("caso 10 · empate em assinado_em é desempatado por id DESC, de forma determinística", async () => {
      const t = "2026-05-05 12:00:00+00";
      await owner!`DELETE FROM consent WHERE patient_id = ${P_TIE}`;
      await owner!`INSERT INTO consent (id, patient_id, tipo, versao_termo, assinado_em) VALUES
      (${C_TIE_LO}, ${P_TIE}, 'uso_ia_processamento', 'ia-lo', ${t}),
      (${C_TIE_HI}, ${P_TIE}, 'uso_ia_processamento', 'ia-hi', ${t})`;

      // Revogando a de id MAIOR (a "mais recente" pelo desempate): bloqueia.
      await revogar(P_TIE, C_TIE_HI);
      for (let i = 0; i < 3; i++) {
        expect(
          await finalidadeRevogada(coord, P_TIE, "uso_ia_processamento"),
        ).toBe("true");
      }

      // Revogando só a de id MENOR: não bloqueia, porque não é a que manda.
      await desrevogar(P_TIE);
      await revogar(P_TIE, C_TIE_LO);
      for (let i = 0; i < 3; i++) {
        expect(
          await finalidadeRevogada(coord, P_TIE, "uso_ia_processamento"),
        ).toBe("false");
      }
    });

    // =========================================================================
    // Caso 11 — CHECK de coerência entre tipo e colunas
    // =========================================================================
    // Rodam como OWNER: o ponto é que nem quem bypassa RLS grava o estado inválido.
    // As asserções casam o NOME da constraint — sem isso, um INSERT que falhasse
    // por NOT NULL, FK ou enum passaria como "o CHECK funcionou".
    test("caso 11a · revogação SEM ponteiro é rejeitada pelo CHECK", async () => {
      await expect(
        owner!`INSERT INTO consent (patient_id, tipo, versao_termo, consent_revogado_id)
        VALUES (${P_CHK}, 'revogacao_consentimento', 'revogacao-sem-alvo', NULL)`,
      ).rejects.toThrow(/consent_responsavel_por_tipo/);
    });

    test("caso 11b · concessão COM ponteiro de revogação é rejeitada pelo CHECK", async () => {
      await expect(
        owner!`INSERT INTO consent (patient_id, tipo, responsavel_signatario, versao_termo, consent_revogado_id)
        VALUES (${P_CHK}, 'tratamento_dados_menor', 'Mãe', 'menor-v1', ${C_CHK})`,
      ).rejects.toThrow(/consent_responsavel_por_tipo/);
      await expect(
        owner!`INSERT INTO consent (patient_id, tipo, versao_termo, consent_revogado_id)
        VALUES (${P_CHK}, 'autoconsentimento_titular_adulto', 'adulto-v1', ${C_CHK})`,
      ).rejects.toThrow(/consent_responsavel_por_tipo/);
    });

    test("caso 11c · curatela SEM instrumento é rejeitada; COM instrumento passa", async () => {
      await expect(
        owner!`INSERT INTO consent (patient_id, tipo, responsavel_signatario, versao_termo, instrumento_representacao)
        VALUES (${P_CHK}, 'representacao_curador', 'Curador', 'curatela-v1', NULL)`,
      ).rejects.toThrow(/consent_responsavel_por_tipo/);
      // String vazia não é sentinela válida (o btrim somado ao IS NOT NULL).
      await expect(
        owner!`INSERT INTO consent (patient_id, tipo, responsavel_signatario, versao_termo, instrumento_representacao)
        VALUES (${P_CHK}, 'representacao_curador', 'Curador', 'curatela-v1', '   ')`,
      ).rejects.toThrow(/consent_responsavel_por_tipo/);
      // Par positivo: o CHECK não é um bloqueio geral de curatela.
      const ok = "00000000-0000-0000-0000-000000053c61";
      await owner!`DELETE FROM consent WHERE id = ${ok}`;
      await owner!`INSERT INTO consent (id, patient_id, tipo, responsavel_signatario, versao_termo, instrumento_representacao)
      VALUES (${ok}, ${P_CHK}, 'representacao_curador', 'Curador', 'curatela-v1', 'Termo 123/2026')`;
      expect(await owner!`SELECT 1 FROM consent WHERE id = ${ok}`).toHaveLength(
        1,
      );
      await owner!`DELETE FROM consent WHERE id = ${ok}`;
    });

    test("caso 11d · versao_termo é bicondicional com o tipo revogação", async () => {
      // Concessão disfarçada de revogação no relatório.
      await expect(
        owner!`INSERT INTO consent (patient_id, tipo, responsavel_signatario, versao_termo)
        VALUES (${P_CHK}, 'tratamento_dados_menor', 'Mãe', 'revogacao-disfarcada')`,
      ).rejects.toThrow(/consent_versao_termo_por_tipo/);
      // Revogação contada como termo assinado vigente.
      await expect(
        owner!`INSERT INTO consent (patient_id, tipo, versao_termo, consent_revogado_id)
        VALUES (${P_CHK}, 'revogacao_consentimento', 'menor-v1', ${C_CHK})`,
      ).rejects.toThrow(/consent_versao_termo_por_tipo/);
    });

    // =========================================================================
    // Caso 12 — trigger (o que o CHECK, que só vê a própria linha, não alcança)
    // =========================================================================
    test("caso 12a · revogar uma revogação é rejeitado pelo trigger", async () => {
      const rev = "00000000-0000-0000-0000-000000053c71";
      await owner!`DELETE FROM consent WHERE id = ${rev}`;
      await owner!`INSERT INTO consent (id, patient_id, tipo, versao_termo, consent_revogado_id)
      VALUES (${rev}, ${P_CHK}, 'revogacao_consentimento', 'revogacao-1', ${C_CHK})`;
      await expect(
        owner!`INSERT INTO consent (patient_id, tipo, versao_termo, consent_revogado_id)
        VALUES (${P_CHK}, 'revogacao_consentimento', 'revogacao-2', ${rev})`,
      ).rejects.toThrow(/Não é possível revogar uma revogação/);
      await owner!`DELETE FROM consent WHERE id = ${rev}`;
    });

    test("caso 12b · revogação apontando para si mesma é rejeitada pelo trigger", async () => {
      const eu = "00000000-0000-0000-0000-000000053c72";
      await expect(
        owner!`INSERT INTO consent (id, patient_id, tipo, versao_termo, consent_revogado_id)
        VALUES (${eu}, ${P_CHK}, 'revogacao_consentimento', 'revogacao-eu', ${eu})`,
      ).rejects.toThrow(/não pode apontar para si mesma/i);
    });

    // =========================================================================
    // Caso 13 — FK composta amarra revogação e alvo ao MESMO paciente
    // =========================================================================
    // Com `REFERENCES consent(id)` simples isto passaria, e um paciente teria o
    // consentimento derrubado por uma linha de outro prontuário.
    test("caso 13 · revogação apontando para consent de OUTRO paciente é rejeitada pela FK composta", async () => {
      await expect(
        owner!`INSERT INTO consent (patient_id, tipo, versao_termo, consent_revogado_id)
        VALUES (${P_CHK}, 'revogacao_consentimento', 'revogacao-cross', ${C_MENOR})`,
      ).rejects.toThrow(/consent_revogado_mesmo_paciente/);
      // Par: o MESMO INSERT, com o alvo do paciente certo, passa. Prova que a FK
      // discrimina o paciente e não bloqueia toda revogação.
      const ok = "00000000-0000-0000-0000-000000053c73";
      await owner!`DELETE FROM consent WHERE id = ${ok}`;
      await owner!`INSERT INTO consent (id, patient_id, tipo, versao_termo, consent_revogado_id)
      VALUES (${ok}, ${P_CHK}, 'revogacao_consentimento', 'revogacao-ok', ${C_CHK})`;
      expect(await owner!`SELECT 1 FROM consent WHERE id = ${ok}`).toHaveLength(
        1,
      );
      await owner!`DELETE FROM consent WHERE id = ${ok}`;
    });

    // =========================================================================
    // Caso 14 — consent continua append-only para app_role
    // =========================================================================
    // A asserção casa "permission denied": o REVOKE é a garantia, e um UPDATE
    // barrado por RLS (zero linhas, sem erro) NÃO satisfaria este teste.
    test("caso 14 · UPDATE e DELETE em consent continuam negados a app_role", async () => {
      expect(
        await erroDe(
          withTenant(coord, (tx) =>
            tx.execute(
              sql`UPDATE consent SET versao_termo = 'hackeada' WHERE id = ${C_CHK}::uuid`,
            ),
          ),
        ),
      ).toMatch(/permission denied for table consent/i);
      expect(
        await erroDe(
          withTenant(coord, (tx) =>
            tx.execute(sql`DELETE FROM consent WHERE id = ${C_CHK}::uuid`),
          ),
        ),
      ).toMatch(/permission denied for table consent/i);
      // Par: INSERT continua permitido a coordenador/recepção — a tabela não ficou
      // inteiramente fechada, senão a revogação e o reconsentimento seriam impossíveis.
      const ok = await withTenant(recep, (tx) =>
        tx.execute(sql`INSERT INTO consent (patient_id, tipo, versao_termo, consent_revogado_id)
        VALUES (${P_CHK}::uuid, 'revogacao_consentimento', 'revogacao-app', ${C_CHK}::uuid)
        RETURNING id`),
      );
      expect(ok).toHaveLength(1);
      await owner!`DELETE FROM consent WHERE patient_id = ${P_CHK}
      AND tipo::text = 'revogacao_consentimento'`;
      expect(
        await owner!`SELECT versao_termo FROM consent WHERE id = ${C_CHK}`,
      ).toEqual([{ versao_termo: "menor-v1" }]);
    });
  },
);
