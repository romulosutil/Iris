/**
 * D16 (#229) — trava do helper de tenant nas policies de RLS. Objeto sob teste:
 * a migração `0085_policies_tenant_helper.sql`, que criou
 * `app_tenant_nao_resolvido()` + `app_clinic_id_exigido()` e reescreveu as 48
 * policies que resolviam o tenant com `current_setting('app.clinic_id')::uuid`
 * cru.
 *
 * O que o predicado cru fazia de errado — e por que isso não é estética:
 *   * GUC ausente          → 42704 `unrecognized configuration parameter`
 *   * GUC presente e lixo  → 22P02 `invalid input syntax for type uuid`
 * Nos dois casos a exceção nasce DENTRO da policy, antes de qualquer guard
 * interno decidir (foi o que fez o guard de `app_conta_somente_leitura()` não
 * bastar na #215), e a mensagem não nomeia o tenant — o diagnóstico custa caro
 * justamente no incidente em que já se está sem contexto. `P0001` com mensagem
 * própria é o contrato novo.
 *
 * E a alternativa tentadora — trocar por `app_clinic_id_atual()`, que devolve
 * NULL — é pior: num predicado de isolamento, `clinic_id = NULL` é NULL, a
 * linha some em silêncio e ninguém fica sabendo. Daí o par de testes: o helper
 * LEVANTA, e levanta com o código certo.
 *
 * Nada aqui asseria o texto do `.sql`: tudo é medido em `pg_policies` e em
 * SELECT de verdade sob `app_role`. "Está no `git log`" não prova que a
 * migração rodou (precedente: a `0055`, #165).
 *
 * Todo caso de dado roda dentro de `BEGIN … ROLLBACK`: a suíte compartilha a
 * base com arquivos que dão TRUNCATE em `clinic`, e o isolamento não precisa de
 * dado persistido para ser exercitado.
 *
 * Roda com `pnpm test:rls`. Gate de env em `integration-env.ts` (as três URLs).
 */
import { afterAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { hasDb } from "./integration-env";

// Role DONA: superusuário + BYPASSRLS. É por ela que o seed dos dois tenants
// passa por cima da própria RLS que está sob teste.
const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })
  : null;

/**
 * As 52 policies tenant-scoped, escritas à mão como literal (48 da 0085 + 4 de
 * `tcc_rpd_entry`, #306).
 *
 * Por que literal e não `SELECT ... FROM pg_policies` em runtime: computar o
 * esperado a partir da mesma fonte que se está medindo faz o teste concordar
 * consigo mesmo — passaria com 52, com 51 e com 3. Este array é o oráculo, e
 * ele só muda por decisão humana registrada no diff.
 *
 * A comparação de CONJUNTO EXATO (não `toContain`) pega os dois lados do erro:
 *   * uma policy que REGREDIU para a forma crua some da lista viva → falha;
 *   * uma policy NOVA, tenant-scoped, escrita na forma crua nunca entra na
 *     lista viva → o teste 1 falha (ela aparece com `%app.clinic_id%`);
 *   * uma policy nova escrita CORRETAMENTE aparece na lista viva e não no
 *     literal → falha também, de propósito: acrescentar a linha aqui é o
 *     reconhecimento explícito de que mais uma tabela entrou no regime.
 */
const POLICIES_COM_HELPER = [
  "agendamento_recorrente.agendamento_recorrente_delete",
  "agendamento_recorrente.agendamento_recorrente_insert",
  "agendamento_recorrente.agendamento_recorrente_select",
  "agendamento_recorrente.agendamento_recorrente_update",
  "alerta_risco_clinico.alerta_risco_scope",
  "app_user.app_user_read",
  "audio_capture.audio_insert",
  "audio_capture.audio_select",
  "audio_capture.audio_update",
  "audit_log.audit_insert",
  "audit_log.audit_select",
  "billing_cycle.billing_cycle_select",
  "billing_cycle_patient.billing_cycle_patient_select",
  "bloqueio.bloqueio_delete",
  "bloqueio.bloqueio_insert",
  "bloqueio.bloqueio_select",
  "bloqueio.bloqueio_update",
  "clinic.clinic_read",
  "extraction.extraction_delete",
  "extraction.extraction_insert",
  "extraction.extraction_select",
  "extraction.extraction_update",
  "goal.goal_insert",
  "goal.goal_select",
  "goal.goal_update",
  "janela_trabalho.janela_trabalho_delete",
  "janela_trabalho.janela_trabalho_insert",
  "janela_trabalho.janela_trabalho_select",
  "janela_trabalho.janela_trabalho_update",
  "patient.patient_delete",
  "patient.patient_insert",
  "patient.patient_select",
  "patient.patient_update",
  "patient_alvo_disciplina.patient_alvo_disciplina_insert",
  "patient_alvo_disciplina.patient_alvo_disciplina_select",
  "patient_alvo_disciplina.patient_alvo_disciplina_update",
  "professional_consent.professional_consent_select",
  "protocol.protocol_read",
  "protocol.protocol_write",
  "session.session_delete",
  "session.session_insert",
  "session.session_select",
  "session.session_update",
  "session_note.session_note_insert",
  "session_note.session_note_select",
  "session_note.session_note_update",
  "subscription.subscription_select",
  "tcc_rpd_entry.tcc_rpd_entry_delete",
  "tcc_rpd_entry.tcc_rpd_entry_insert",
  "tcc_rpd_entry.tcc_rpd_entry_select",
  "tcc_rpd_entry.tcc_rpd_entry_update",
  "user_role.user_role_read",
];

// ─── identificadores fixos, legíveis por issue (#229 = ...0229) ─────────────
const CLINICA_A = "00000000-0000-0000-0000-000000229a01";
const CLINICA_B = "00000000-0000-0000-0000-000000229b01";
const USER_A = "00000000-0000-0000-0000-000000229ac1";
const USER_B = "00000000-0000-0000-0000-000000229bc1";
const PAC_A = "00000000-0000-0000-0000-0000002290a1";
const PAC_B = "00000000-0000-0000-0000-0000002290b1";
const SESS_A = "00000000-0000-0000-0000-0000002295a1";
const SESS_B = "00000000-0000-0000-0000-0000002295b1";
const AUD_A = "00000000-0000-0000-0000-000000229da1";
const AUD_B = "00000000-0000-0000-0000-000000229db1";

/**
 * Os 4 estados de GUC que o predicado cru não sobrevivia. `null` = nunca
 * definido nesta transação (o 42704 do `current_setting` sem o 2º argumento);
 * os outros três são o GUC PRESENTE e fora do formato uuid (o 22P02).
 */
const GUCS_RUINS = [
  ["ausente", null],
  ["vazio", ""],
  ["lixo", "nao-e-uuid"],
  ["truncado", "00000000-0000-0000-0000-0000001"],
] as const;

/** Sentinela de rollback: distingue "quero desfazer" de "o teste explodiu". */
const ROLLBACK = Symbol("rollback");

/**
 * Roda `fn` numa transação que SEMPRE é revertida. O valor devolvido por `fn`
 * atravessa o rollback (é dado do teste, não do banco).
 */
async function emTransacao<T>(
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  let resultado!: T;
  try {
    await owner!.begin(async (tx) => {
      resultado = await fn(tx);
      throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
  return resultado;
}

/**
 * Semeia DOIS tenants completos (clínica, usuário, papel, paciente, sessão,
 * trilha) dentro da transação corrente.
 *
 * As quatro tabelas do caso 4 precisam ter linha das DUAS clínicas — e não é
 * detalhe de cobertura: uma tabela VAZIA nunca chega a avaliar o `qual` da
 * policy, então o SELECT com GUC malformado voltaria `0` sem levantar e a
 * asserção de `P0001` ficaria vácua (verde sem testar nada). O oráculo de
 * não-vacuidade é lido pela role dona antes de trocar de papel.
 */
async function semear(tx: postgres.TransactionSql) {
  await tx`INSERT INTO clinic (id, nome, is_demo) VALUES
    (${CLINICA_A}, 'Clínica A #229', false),
    (${CLINICA_B}, 'Clínica B #229', false)`;

  // `app_user` é a tabela do Better-Auth: coluna `name`, não `nome`.
  await tx`INSERT INTO app_user (id, name, email) VALUES
    (${USER_A}, 'Coord A #229', 'coord.a.229@t.com'),
    (${USER_B}, 'Coord B #229', 'coord.b.229@t.com')`;

  await tx`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
    (${USER_A}, ${CLINICA_A}, 'coordenador'),
    (${USER_B}, ${CLINICA_B}, 'coordenador')`;

  await tx`INSERT INTO patient (id, clinic_id, nome) VALUES
    (${PAC_A}, ${CLINICA_A}, 'Paciente A #229'),
    (${PAC_B}, ${CLINICA_B}, 'Paciente B #229')`;

  await tx`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina) VALUES
    (${SESS_A}, ${CLINICA_A}, ${PAC_A}, ${USER_A}, now(), 'realizada', 'desconhecida'),
    (${SESS_B}, ${CLINICA_B}, ${PAC_B}, ${USER_B}, now(), 'realizada', 'desconhecida')`;

  await tx`INSERT INTO audit_log (id, clinic_id, ator_id, acao, entidade, entidade_id) VALUES
    (${AUD_A}, ${CLINICA_A}, ${USER_A}, 'criar', 'patient', ${PAC_A}),
    (${AUD_B}, ${CLINICA_B}, ${USER_B}, 'criar', 'patient', ${PAC_B})`;
}

/**
 * Assume o papel de aplicação para a clínica dada, com os GUCs que as policies
 * exigem. `SET LOCAL` + `set_config(..., true)`: tudo morre no rollback.
 *
 * Por padrão `app.user_id` recebe um uuid VÁLIDO de propósito, mesmo quando o
 * teste está exercitando um `app.clinic_id` malformado: várias policies também
 * castam o `app.user_id`, e um lixo ali levantaria 22P02 pelo motivo errado —
 * o teste ficaria verde/vermelho por acidente em vez de medir o helper de
 * tenant. Passar `null` em `papel`/`userId` PULA o `set_config` daquele GUC:
 * é o que os testes de semântica GUC-ausente usam para deixar exatamente o
 * GUC sob teste sem valor, sem contaminar os demais.
 */
async function comoApp(
  tx: postgres.TransactionSql,
  clinicId: string | null,
  papel: string | null = "coordenador",
  userId: string | null = USER_A,
) {
  if (clinicId !== null) {
    await tx`SELECT set_config('app.clinic_id', ${clinicId}, true)`;
  }
  if (papel !== null) {
    await tx`SELECT set_config('app.user_role', ${papel}, true)`;
  }
  if (userId !== null) {
    await tx`SELECT set_config('app.user_id', ${userId}, true)`;
  }
  await tx`SET LOCAL ROLE app_role`;
}

/** Volta para a role dona dentro da mesma transação (para ler o oráculo). */
async function comoDono(tx: postgres.TransactionSql) {
  await tx`RESET ROLE`;
}

/**
 * As 4 tabelas exercitadas com dado de verdade no caso 4.
 *
 * LIMITE DE COBERTURA, declarado em vez de escondido: as outras ~20 tabelas do
 * regime tenant-scoped NÃO ganham teste de comportamento aqui. Elas estão
 * cobertas (a) estruturalmente pelos casos 1 e 2, que medem o texto vivo de
 * TODAS as policies em `pg_policies`, e (b) funcionalmente pelas suítes de
 * isolamento já existentes (`fase2-rls`, `fase4-rls`, …). Semear a cadeia de FK
 * completa de cada uma custaria mais manutenção do que compra de sinal: o
 * mecanismo sob teste é o mesmo em todas — a chamada do helper dentro do
 * `qual` —, e essas quatro cobrem os formatos que existem (`id = ...` em
 * `clinic`, `clinic_id = ...` puro, com papel, e com FK de paciente).
 */
/**
 * As 16 funções que resolvem o tenant pelo helper (`0087`, resíduo do D16).
 *
 * Todas são `SECURITY DEFINER` menos nenhuma — e é justamente por isso que elas
 * importam: uma função DEFINER roda com os direitos do dono, ou seja, IGNORA a
 * RLS. O predicado de clínica dentro dela não é uma checagem redundante em cima
 * do RLS, é a própria fronteira de autorização (CLAUDE.md §Migrações, item 5).
 * Um `NULL` silencioso ali não "não vê linha": ele decide errado.
 *
 * Mesma disciplina do literal de policies: conjunto EXATO, escrito à mão. Uma
 * função nova que entre no regime tenant-scoped precisa de uma linha aqui.
 */
const FUNCOES_COM_HELPER = [
  "app_alerta_risco_visivel",
  "app_cpf_hash_usado_em_outro_trial",
  "app_criar_alerta_risco",
  "app_desarquivar_paciente",
  "app_iniciar_trial",
  "app_paciente_expurgavel",
  "app_patient_in_clinic",
  "app_protocol_in_clinic",
  "app_proximo_numero_sequencial",
  "app_risco_estagio2_ativo",
  "app_salvar_config_emergencia",
  // #36 (0090) — grava o CPF/CNPJ da clínica na ativação da assinatura.
  "app_salvar_cpf_cnpj_clinica",
  // #262 (0095) — grava dados cadastrais/fiscais da clínica (página Dados).
  "app_salvar_dados_clinica",
  "app_session_clinica_visivel",
  "app_session_terapeuta_id",
  "app_user_in_clinic",
];

/**
 * As 12 funções que chamam app_user_role_exigido() (0093 + 0094, D23).
 */
const FUNCOES_COM_USER_ROLE_HELPER = [
  "app_alerta_risco_visivel",
  "app_alerta_visivel",
  "app_aplicar_candidatura",
  "app_aplicar_snapshot",
  "app_desarquivar_paciente",
  "app_purgar_paciente",
  "app_purgar_report",
  "app_report_visivel",
  "app_salvar_config_emergencia",
  "app_salvar_cpf_cnpj_clinica",
  // #262 (0095) — exige papel coordenador para editar dados da clínica.
  "app_salvar_dados_clinica",
  "app_session_clinica_visivel",
];

/**
 * As 6 funções que chamam app_user_id_exigido() (0093 + 0094, D23).
 */
const FUNCOES_COM_USER_ID_EXIGIDO_HELPER = [
  "app_alerta_risco_visivel",
  "app_desarquivar_paciente",
  "app_is_on_team",
  "app_purgar_paciente",
  "app_purgar_report",
  "app_session_clinica_visivel",
];

/**
 * As 3 funções que chamam app_user_id_atual() (0093, D23).
 */
const FUNCOES_COM_USER_ID_ATUAL_HELPER = [
  "app_criar_alerta_risco",
  "app_salvar_config_emergencia",
  "app_user_id_exigido",
];

const TABELAS_COM_DADO = [
  { tabela: "clinic", idA: CLINICA_A, idB: CLINICA_B },
  { tabela: "patient", idA: PAC_A, idB: PAC_B },
  { tabela: "session", idA: SESS_A, idB: SESS_B },
  { tabela: "audit_log", idA: AUD_A, idB: AUD_B },
] as const;

describe.skipIf(!hasDb)("#229 · helper de tenant nas policies de RLS", () => {
  afterAll(async () => {
    await owner?.end();
  });

  // ─── 1. invariante repo-wide ──────────────────────────────────────────────
  test("nenhuma policy resolve o tenant com current_setting('app.clinic_id') cru", async () => {
    // `%app.clinic_id%` é padrão de LIKE do SQL, não regex: o ponto é literal.
    // (Num `grep`/`RegExp` ele seria curinga e o padrão casaria demais.)
    const [row] = await owner!<{ n: number }[]>`
      SELECT count(*)::int AS n
        FROM pg_policies
       WHERE qual LIKE '%app.clinic_id%'
          OR with_check LIKE '%app.clinic_id%'`;

    expect(row!.n).toBe(0);
  });

  // ─── 2. trava por policy: conjunto EXATO ──────────────────────────────────
  test("as 52 policies tenant-scoped chamam app_clinic_id_exigido() — conjunto exato", async () => {
    const rows = await owner!<{ alvo: string }[]>`
      SELECT tablename || '.' || policyname AS alvo
        FROM pg_policies
       WHERE qual LIKE '%app_clinic_id_exigido%'
          OR with_check LIKE '%app_clinic_id_exigido%'
       ORDER BY 1`;

    expect(rows.map((r) => r.alvo)).toEqual(POLICIES_COM_HELPER);
    // Redundante de propósito: se o literal for editado por engano (linha
    // duplicada, colagem parcial), o número na mensagem de falha diz o que
    // aconteceu sem precisar ler o diff inteiro.
    expect(POLICIES_COM_HELPER.length).toBe(52);
  });

  // ─── 2b. o ponto cego que a #229 deixou aberto ────────────────────────────
  //
  // Os casos 1 e 2 varrem `pg_policies` e só. Isso é menos cobertura do que
  // parece: a maioria das policies tenant-scoped NÃO compara `clinic_id`
  // direto — ela delega a uma função `SECURITY DEFINER` (`app_patient_in_clinic`,
  // `app_user_in_clinic`, `app_session_clinica_visivel`, …). O texto dessas
  // funções nunca aparece em `pg_policies.qual`, então o cast cru sobreviveu
  // lá dentro à `0085` inteira e ao guard inteiro: o 42704/22P02 continuava
  // saindo de dentro da avaliação da policy, um frame mais fundo. Mesma
  // história para VIEW — `audit_log_mascarado` roda com direitos do dono e o
  // `WHERE` dela É a fronteira de tenant, e ela também é invisível a
  // `pg_policies`. Corrigido pela `0087`; estes três casos são a trava.
  test("nenhuma FUNÇÃO resolve o tenant com current_setting('app.clinic_id') cru", async () => {
    // Regex do Postgres (`~`), não LIKE: aqui o `.` precisa ser escapado, e o
    // `\s*\)` é o que distingue a forma 1-arg (que levanta 42704) da 2-arg.
    //
    // ATENÇÃO à barra DUPLA: isto é um template literal do JS antes de ser
    // texto SQL. `\(` vira `(` e `\s` vira `s` na conversão — a regex chegaria
    // mutilada ao Postgres, casaria com nada, e o teste passaria VAZIO em vez
    // de passar limpo. Foi o que aconteceu na primeira escrita deste caso.
    const rows = await owner!<{ proname: string }[]>`
      SELECT p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.prosrc ~ 'current_setting\\(''app\\.clinic_id''\\s*\\)'
       ORDER BY 1`;

    expect(rows.map((r) => r.proname)).toEqual([]);
  });

  test("nenhuma FUNÇÃO casta o GUC leniente para uuid sem guard de formato", async () => {
    // `current_setting('app.clinic_id', true)::uuid` engana: o `missing_ok`
    // mata o 42704 e faz o código PARECER defendido, mas o GUC presente e fora
    // do formato (string vazia, lixo, uuid truncado) ainda estoura 22P02. Foi
    // assim que `app_assinatura_bloqueia_cadastro` passou batido na primeira
    // varredura da `0087`.
    //
    // `app_clinic_id_atual` é a ÚNICA exceção legítima: o cast dela mora dentro
    // do `CASE` que já validou o formato por regex — é o guard, não um usuário
    // dele.
    const rows = await owner!<{ proname: string }[]>`
      SELECT p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.prosrc ~ 'current_setting\\(''app\\.clinic_id''\\s*,\\s*true\\s*\\)\\s*::'
       ORDER BY 1`;

    expect(rows.map((r) => r.proname)).toEqual(["app_clinic_id_atual"]);
  });

  test("nenhuma VIEW resolve o tenant com current_setting('app.clinic_id') cru", async () => {
    const rows = await owner!<{ relname: string }[]>`
      SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relkind IN ('v', 'm')
         AND pg_get_viewdef(c.oid) ~ 'current_setting\\(''app\\.clinic_id'''
       ORDER BY 1`;

    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  test("as 16 funções tenant-scoped chamam app_clinic_id_exigido() — conjunto exato", async () => {
    // Mesmo raciocínio do literal de policies: o oráculo é escrito à mão para
    // que uma função NOVA que entre no regime (ou uma que saia) precise de uma
    // linha aqui, no diff, e não passe por osmose.
    const rows = await owner!<{ proname: string }[]>`
      SELECT p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.prosrc ~ 'app_clinic_id_exigido\\(\\)'
       ORDER BY 1`;

    expect(rows.map((r) => r.proname)).toEqual(FUNCOES_COM_HELPER);
    expect(FUNCOES_COM_HELPER.length).toBe(16);
  });

  // ─── 2c. D23: guards de papel e identidade (0093) ──────────────────────────
  test("nenhuma FUNÇÃO pública usa current_setting('app.user_role') 1-arg sem missing_ok", async () => {
    const rows = await owner!<{ proname: string }[]>`
      SELECT p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.prosrc ~ 'current_setting\\(''app\\.user_role''\\s*\\)'
       ORDER BY 1`;

    expect(rows.map((r) => r.proname)).toEqual([]);
  });

  test("nenhuma FUNÇÃO pública casta current_setting('app.user_id') para uuid sem guard", async () => {
    // `app_user_id_atual` é a ÚNICA exceção legítima: o cast dela mora dentro
    // do CASE que já validou o formato por regex.
    const rows = await owner!<{ proname: string }[]>`
      SELECT p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND (
           p.prosrc ~ 'current_setting\\(''app\\.user_id''\\s*,\\s*true\\s*\\)\\s*::'
           OR p.prosrc ~ 'current_setting\\(''app\\.user_id''\\s*\\)\\s*::'
         )
       ORDER BY 1`;

    expect(rows.map((r) => r.proname)).toEqual(["app_user_id_atual"]);
  });

  test("as 12 funções de papel chamam app_user_role_exigido() — conjunto exato", async () => {
    const rows = await owner!<{ proname: string }[]>`
      SELECT p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.prosrc ~ 'app_user_role_exigido\\(\\)'
       ORDER BY 1`;

    expect(rows.map((r) => r.proname)).toEqual(FUNCOES_COM_USER_ROLE_HELPER);
    expect(FUNCOES_COM_USER_ROLE_HELPER.length).toBe(12);
  });

  test("as 6 funções de autorização por identidade chamam app_user_id_exigido() — conjunto exato", async () => {
    const rows = await owner!<{ proname: string }[]>`
      SELECT p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.prosrc ~ 'app_user_id_exigido\\(\\)'
       ORDER BY 1`;

    expect(rows.map((r) => r.proname)).toEqual(
      FUNCOES_COM_USER_ID_EXIGIDO_HELPER,
    );
    expect(FUNCOES_COM_USER_ID_EXIGIDO_HELPER.length).toBe(6);
  });

  test("as 3 funções com identidade leniente chamam app_user_id_atual() — conjunto exato", async () => {
    const rows = await owner!<{ proname: string }[]>`
      SELECT p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.prosrc ~ 'app_user_id_atual\\(\\)'
       ORDER BY 1`;

    expect(rows.map((r) => r.proname)).toEqual(
      FUNCOES_COM_USER_ID_ATUAL_HELPER,
    );
    expect(FUNCOES_COM_USER_ID_ATUAL_HELPER.length).toBe(3);
  });

  test("audit_log_mascarado isola por tenant e levanta P0001 sem GUC", async () => {
    // A view mais perigosa do schema: SEM `security_invoker` de propósito
    // (0046), logo o RLS de `audit_log` não se aplica e este `WHERE` é tudo o
    // que separa as clínicas. É também o objeto que nenhum caso anterior
    // tocava.
    await emTransacao(async (tx) => {
      await semear(tx);

      // Oráculo de não-vacuidade: a role dona enxerga as duas linhas. Sem isto,
      // um `toEqual([AUD_A])` continuaria verde numa tabela vazia por acidente.
      const todas = await tx<{ id: string }[]>`
        SELECT id FROM audit_log WHERE id IN (${AUD_A}, ${AUD_B}) ORDER BY id`;
      expect(todas).toHaveLength(2);

      await comoApp(tx, CLINICA_A);
      const vistas = await tx<{ id: string }[]>`
        SELECT id FROM audit_log_mascarado WHERE id IN (${AUD_A}, ${AUD_B})`;
      expect(vistas.map((r) => r.id)).toEqual([AUD_A]);
    });

    // GUC ausente: antes da 0087 isto era 42704 vindo de dentro da view.
    await emTransacao(async (tx) => {
      await semear(tx);
      await comoApp(tx, null);
      await expect(
        tx`SELECT id FROM audit_log_mascarado`,
      ).rejects.toMatchObject({ code: "P0001" });
    });

    // GUC presente e lixo: antes era 22P02. Cobre o outro lado do par.
    await emTransacao(async (tx) => {
      await semear(tx);
      await comoApp(tx, "nao-e-uuid");
      await expect(
        tx`SELECT id FROM audit_log_mascarado`,
      ).rejects.toMatchObject({ code: "P0001" });
    });
  });

  // ─── 3. semântica dos dois helpers, sob app_role ──────────────────────────
  test("app_clinic_id_atual() devolve NULL nos 4 estados ruins de GUC", async () => {
    const r = await emTransacao(async (tx) => {
      // Sem `app.clinic_id` nesta transação: é o caso "ausente", e por isso ele
      // roda ANTES de qualquer set_config.
      await comoApp(tx, null);

      const out: Record<string, string | null> = {};
      for (const [caso, valor] of GUCS_RUINS) {
        await tx.savepoint(async (sp) => {
          if (valor !== null) {
            await sp`SELECT set_config('app.clinic_id', ${valor}, true)`;
          }
          const [row] = await sp<{ v: string | null }[]>`
            SELECT app_clinic_id_atual()::text AS v`;
          out[caso] = row!.v;
        });
      }
      return out;
    });

    expect(r).toEqual({
      ausente: null,
      vazio: null,
      lixo: null,
      truncado: null,
    });
  });

  test("app_clinic_id_exigido() levanta P0001 nos 4 estados ruins (nunca 22P02 nem 42704)", async () => {
    // O ponto INTEIRO da 0085 está no código do erro, não em "estourou". Antes,
    // GUC ausente dava 42704 e GUC lixo dava 22P02 — dois erros genéricos do
    // Postgres, nascidos dentro da policy, sem nomear o tenant. Um `rejects
    // .toThrow()` genérico aqui passaria contra o código PRÉ-correção.
    const r = await emTransacao(async (tx) => {
      await comoApp(tx, null);

      const out: Record<string, string> = {};
      for (const [caso, valor] of GUCS_RUINS) {
        try {
          await tx.savepoint(async (sp) => {
            if (valor !== null) {
              await sp`SELECT set_config('app.clinic_id', ${valor}, true)`;
            }
            await sp`SELECT app_clinic_id_exigido()`;
          });
          out[caso] = "sem-erro";
        } catch (e) {
          out[caso] = (e as postgres.PostgresError).code;
        }
      }
      return out;
    });

    for (const [caso] of GUCS_RUINS) {
      expect(r[caso]).toBe("P0001");
      expect(r[caso]).not.toBe("22P02");
      expect(r[caso]).not.toBe("42704");
    }
  });

  test("app_clinic_id_exigido() devolve o uuid quando o GUC está bem formado", async () => {
    // Contraprova: o COALESCE tem que curto-circuitar. Sem este caso, uma
    // função que levantasse SEMPRE passaria nos dois testes acima e trancaria o
    // produto inteiro.
    const v = await emTransacao(async (tx) => {
      await comoApp(tx, CLINICA_A);
      const [row] = await tx<{ v: string }[]>`
        SELECT app_clinic_id_exigido()::text AS v`;
      return row!.v;
    });

    expect(v).toBe(CLINICA_A);
  });

  // ─── 3b. mudança de comportamento leniente → estrita, na prática ──────────
  describe("subscription_select: de leniente (0 linhas) para estrita (P0001)", () => {
    // `subscription` é a tabela mais barata das 4 que a 0085 endureceu: FK
    // única é `clinic_id`, sem paciente/sessão/coordenador no meio. Antes da
    // 0085 essa policy usava `current_setting('app.clinic_id', true)` — GUC
    // ausente ou lixo devolvia 0 linhas em silêncio, não erro. Este teste
    // prova a mudança de COMPORTAMENTO em runtime, não só o texto da policy
    // (já coberto pelo caso 2): ele distingue "0 linhas" de "P0001", que é
    // exatamente o que a forma leniente vs. estrita diferem.
    const CLINICA_SUB = "00000000-0000-0000-0000-000000229c01";
    const SUB_ID = "00000000-0000-0000-0000-000000229cc1";

    test("GUC ausente: SELECT levanta P0001, NÃO devolve 0 linhas", async () => {
      // Conexão dedicada, NUNCA usada para `app.clinic_id` antes: uma vez que
      // uma sessão toca um GUC customizado (mesmo dentro de uma transação
      // depois revertida), o Postgres cria um "placeholder" para ele — daí em
      // diante `current_setting(..., true)` devolve `''` (string vazia), não
      // `NULL`, mesmo sem SET nenhum na transação corrente. Reusar a conexão
      // `owner` (compartilhada, `max: 1`, e já tocada por outros casos deste
      // arquivo) tornaria "ausente" indistinguível de "vazio" por acidente de
      // ordem de execução — não pelo que este teste quer medir.
      const fresh = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
      try {
        const r = await (async () => {
          let resultado!: {
            oraculo: number;
            codigo: string;
            linhas: number;
            guc: string | null;
          };
          try {
            await fresh.begin(async (tx) => {
              await tx`INSERT INTO clinic (id, nome, is_demo) VALUES
                (${CLINICA_SUB}, 'Clínica Sub #229', false)`;
              await tx`INSERT INTO subscription (id, clinic_id, status) VALUES
                (${SUB_ID}, ${CLINICA_SUB}, 'free_tier')`;

              // Oráculo de não-vacuidade, lido ANTES de trocar de papel. Sem
              // isso, um SELECT que devolvesse 0 linhas silenciosamente (o
              // comportamento leniente pré-0085) passaria por engano.
              const [oraculo] = await tx<{ n: number }[]>`
                SELECT count(*)::int AS n FROM subscription WHERE id = ${SUB_ID}`;

              // Confere, medindo (não supondo), que o GUC realmente está
              // ausente nesta conexão nova — é a premissa do caso.
              const [g] = await tx<{ v: string | null }[]>`
                SELECT current_setting('app.clinic_id', true) AS v`;

              await tx`SELECT set_config('app.user_role', 'coordenador', true)`;
              await tx`SELECT set_config('app.user_id', ${USER_A}, true)`;
              await tx`SET LOCAL ROLE app_role`;

              // Savepoint: a query aborta a transação no servidor mesmo que a
              // exceção seja capturada em JS.
              let codigo = "sem-erro";
              let linhas = -1;
              try {
                await tx.savepoint(async (sp) => {
                  const rows = await sp<{ id: string }[]>`
                    SELECT id FROM subscription WHERE id = ${SUB_ID}`;
                  linhas = rows.length;
                });
              } catch (e) {
                codigo = (e as postgres.PostgresError).code;
              }

              resultado = { oraculo: oraculo!.n, codigo, linhas, guc: g!.v };
              throw ROLLBACK;
            });
          } catch (e) {
            if (e !== ROLLBACK) throw e;
          }
          return resultado;
        })();

        expect(r.guc).toBeNull();
        expect(r.oraculo).toBe(1);
        // O ponto central: NÃO é "sem-erro com 0 linhas" (comportamento
        // leniente pré-0085) — é P0001, levantado dentro da policy.
        expect(r.linhas).toBe(-1);
        expect(r.codigo).toBe("P0001");
        expect(r.codigo).not.toBe("sem-erro");
      } finally {
        await fresh.end();
      }
    });

    test("GUC lixo: SELECT levanta P0001, não 22P02 e não devolve 0 linhas", async () => {
      const r = await emTransacao(async (tx) => {
        await tx`INSERT INTO clinic (id, nome, is_demo) VALUES
          (${CLINICA_SUB}, 'Clínica Sub #229', false)`;
        await tx`INSERT INTO subscription (id, clinic_id, status) VALUES
          (${SUB_ID}, ${CLINICA_SUB}, 'free_tier')`;

        const [oraculo] = await tx<{ n: number }[]>`
          SELECT count(*)::int AS n FROM subscription WHERE id = ${SUB_ID}`;

        await comoApp(tx, "nao-e-uuid");

        let codigo = "sem-erro";
        let linhas = -1;
        try {
          await tx.savepoint(async (sp) => {
            const rows = await sp<{ id: string }[]>`
              SELECT id FROM subscription WHERE id = ${SUB_ID}`;
            linhas = rows.length;
          });
        } catch (e) {
          codigo = (e as postgres.PostgresError).code;
        }

        await comoDono(tx);
        return { oraculo: oraculo!.n, codigo, linhas };
      });

      expect(r.oraculo).toBe(1);
      expect(r.linhas).toBe(-1);
      expect(r.codigo).toBe("P0001");
      expect(r.codigo).not.toBe("22P02");
      expect(r.codigo).not.toBe("sem-erro");
    });
  });

  // ─── 3c. D23: semântica dos helpers de papel e identidade, sob app_role ───
  describe("semântica dos helpers de papel e identidade (0093)", () => {
    test("app_user_role_atual() devolve NULL nos estados ruins de GUC", async () => {
      const r = await emTransacao(async (tx) => {
        await comoApp(tx, CLINICA_A, "coordenador", USER_A);

        const out: Record<string, string | null> = {};
        const estados = [
          ["vazio", ""],
          ["espacos", "   "],
        ] as const;

        for (const [caso, valor] of estados) {
          await tx.savepoint(async (sp) => {
            await sp`SELECT set_config('app.user_role', ${valor}, true)`;
            const [row] = await sp<{ v: string | null }[]>`
              SELECT app_user_role_atual() AS v`;
            out[caso] = row!.v;
          });
        }
        return out;
      });

      expect(r).toEqual({
        vazio: null,
        espacos: null,
      });
    });

    test("app_user_role_exigido() levanta P0001 nos estados ruins (nunca 42704)", async () => {
      const r = await emTransacao(async (tx) => {
        await comoApp(tx, CLINICA_A, "coordenador", USER_A);

        const out: Record<string, string> = {};
        const estados = [
          ["vazio", ""],
          ["espacos", "   "],
        ] as const;

        for (const [caso, valor] of estados) {
          try {
            await tx.savepoint(async (sp) => {
              await sp`SELECT set_config('app.user_role', ${valor}, true)`;
              await sp`SELECT app_user_role_exigido()`;
            });
            out[caso] = "sem-erro";
          } catch (e) {
            out[caso] = (e as postgres.PostgresError).code;
          }
        }
        return out;
      });

      expect(r.vazio).toBe("P0001");
      expect(r.espacos).toBe("P0001");
    });

    test("app_user_role_exigido() devolve o papel quando o GUC está bem formado", async () => {
      const v = await emTransacao(async (tx) => {
        await comoApp(tx, CLINICA_A, "terapeuta", USER_A);
        const [row] = await tx<{ v: string }[]>`
          SELECT app_user_role_exigido() AS v`;
        return row!.v;
      });

      expect(v).toBe("terapeuta");
    });

    test("app_user_id_atual() devolve NULL nos 4 estados ruins de GUC", async () => {
      const r = await emTransacao(async (tx) => {
        await comoApp(tx, CLINICA_A, "coordenador", null);

        const out: Record<string, string | null> = {};
        for (const [caso, valor] of GUCS_RUINS) {
          await tx.savepoint(async (sp) => {
            if (valor !== null) {
              await sp`SELECT set_config('app.user_id', ${valor}, true)`;
            }
            const [row] = await sp<{ v: string | null }[]>`
              SELECT app_user_id_atual()::text AS v`;
            out[caso] = row!.v;
          });
        }
        return out;
      });

      expect(r).toEqual({
        ausente: null,
        vazio: null,
        lixo: null,
        truncado: null,
      });
    });

    test("app_user_id_exigido() levanta P0001 nos 4 estados ruins (nunca 22P02 nem 42704)", async () => {
      const r = await emTransacao(async (tx) => {
        await comoApp(tx, CLINICA_A, "coordenador", null);

        const out: Record<string, string> = {};
        for (const [caso, valor] of GUCS_RUINS) {
          try {
            await tx.savepoint(async (sp) => {
              if (valor !== null) {
                await sp`SELECT set_config('app.user_id', ${valor}, true)`;
              }
              await sp`SELECT app_user_id_exigido()`;
            });
            out[caso] = "sem-erro";
          } catch (e) {
            out[caso] = (e as postgres.PostgresError).code;
          }
        }
        return out;
      });

      for (const [caso] of GUCS_RUINS) {
        expect(r[caso]).toBe("P0001");
        expect(r[caso]).not.toBe("22P02");
        expect(r[caso]).not.toBe("42704");
      }
    });

    test("app_user_id_exigido() devolve o uuid quando o GUC está bem formado", async () => {
      const v = await emTransacao(async (tx) => {
        await comoApp(tx, CLINICA_A, "coordenador", USER_A);
        const [row] = await tx<{ v: string }[]>`
          SELECT app_user_id_exigido()::text AS v`;
        return row!.v;
      });

      expect(v).toBe(USER_A);
    });
  });

  // ─── 4. comportamento por tabela, com dado das duas clínicas ──────────────
  describe("isolamento e falha diagnosticável, medidos com dado real", () => {
    for (const { tabela, idA, idB } of TABELAS_COM_DADO) {
      test(`${tabela} · GUC A vê só A, GUC B não vê A, GUC malformado levanta P0001`, async () => {
        const r = await emTransacao(async (tx) => {
          await semear(tx);

          // Não-vacuidade, lida pela role dona ANTES de trocar de papel: sem
          // linha das duas clínicas, o `qual` da policy nunca é avaliado e o
          // caso (c) ficaria verde sem exercitar nada.
          const [oraculo] = await tx<{ n: number }[]>`
            SELECT count(*)::int AS n FROM ${tx(tabela)}
             WHERE id IN (${idA}, ${idB})`;

          await comoApp(tx, CLINICA_A);
          const [totalA] = await tx<{ n: number }[]>`
            SELECT count(*)::int AS n FROM ${tx(tabela)}`;
          const [bDeA] = await tx<{ n: number }[]>`
            SELECT count(*)::int AS n FROM ${tx(tabela)} WHERE id = ${idB}`;

          // Troca de tenant na MESMA sessão: a policy tem que reavaliar pelo
          // GUC corrente, não cachear a primeira resposta.
          await tx`SELECT set_config('app.clinic_id', ${CLINICA_B}, true)`;
          const [aDeB] = await tx<{ n: number }[]>`
            SELECT count(*)::int AS n FROM ${tx(tabela)} WHERE id = ${idA}`;
          const [totalB] = await tx<{ n: number }[]>`
            SELECT count(*)::int AS n FROM ${tx(tabela)}`;

          // GUC malformado: o SELECT mais banal possível tem que estourar
          // P0001. Vai em savepoint porque a exceção aborta a transação.
          let codigo = "sem-erro";
          try {
            await tx.savepoint(async (sp) => {
              await sp`SELECT set_config('app.clinic_id', 'nao-e-uuid', true)`;
              await sp`SELECT count(*) FROM ${sp(tabela)}`;
            });
          } catch (e) {
            codigo = (e as postgres.PostgresError).code;
          }

          await comoDono(tx);
          return {
            oraculo: oraculo!.n,
            totalA: totalA!.n,
            bDeA: bDeA!.n,
            aDeB: aDeB!.n,
            totalB: totalB!.n,
            codigo,
          };
        });

        // (0) o dado existe — a prova de que as asserções abaixo não são vácuas
        expect(r.oraculo).toBe(2);
        // (a) GUC = clínica A → exatamente a linha de A, e nada de B
        expect(r.totalA).toBe(1);
        expect(r.bDeA).toBe(0);
        // (b) GUC = clínica B → a linha de A some, e a de B aparece
        expect(r.aDeB).toBe(0);
        expect(r.totalB).toBe(1);
        // (c) GUC malformado → P0001 do helper, NÃO o 22P02 do cast cru
        expect(r.codigo).toBe("P0001");
        expect(r.codigo).not.toBe("22P02");
      });
    }
  });
});
