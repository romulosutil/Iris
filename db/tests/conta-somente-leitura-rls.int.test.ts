/**
 * #163 + #159 + #175 — barreira SQL da conta em SOMENTE-LEITURA, medida no
 * banco. Objeto sob teste: as migrações `0073_conta_somente_leitura.sql`
 * (função `app_conta_somente_leitura()` + trigger `app_barreira_somente_leitura()`
 * instalado em 18 tabelas) e `0074_habilitar_barreira_somente_leitura.sql`
 * (que liga os triggers).
 *
 * A política comercial que este arquivo protege: trial irrestrito a partir do
 * 1º paciente, sem cartão; vencido o trial sem assinatura ativa a conta cai em
 * SOMENTE-LEITURA — escrita clínica bloqueada, leitura e exportação livres.
 *
 * Por que testar isto no banco e não só no TypeScript: o guard de aplicação
 * (`src/lib/billing/guard-escrita.ts`) depende de alguém lembrar de aplicá-lo em
 * cada caminho de escrita novo. A precedente `app_assinatura_bloqueia_cadastro()`
 * (0071) foi criada, revogada de PUBLIC, concedida a `app_role` — e NUNCA foi
 * chamada por código, trigger ou CHECK: a única referência viva estava num
 * teste. Uma barreira que ninguém invoca é uma barreira que não existe. Daí a
 * regra deste arquivo: nada de asserir o texto do SQL; tudo é medido —
 * `pg_proc`, `pg_trigger`, e escrita de verdade que estoura (ou não).
 *
 * Modo de falha que estes testes existem para pegar (nesta ordem de custo):
 *   1. predicado errado que TRANCA clínica pagante (`active`/`past_due`);
 *   2. predicado que tranca clínica NOVA antes do 1º paciente — quebraria o
 *      onboarding inteiro, incluindo o `app_iniciar_trial()` que escreve em
 *      `clinic` no meio do cadastro;
 *   3. falhar FECHADO sem GUC de tenant — trancaria o próprio webhook que
 *      promove a assinatura para `active`, ou seja, a saída do bloqueio;
 *   4. barreira que não barra nada (trigger desabilitado / função permissiva).
 *
 * Todo caso de dado roda dentro de `BEGIN … ROLLBACK`: a suíte compartilha a
 * base com arquivos que dão TRUNCATE em `clinic`, e a barreira não precisa de
 * dado persistido para ser exercitada.
 *
 * Roda com `pnpm test:rls`. Gate de env em `integration-env.ts` (as três URLs).
 */
import { afterAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { hasDb } from "./integration-env";

// Role DONA: superusuário + BYPASSRLS. É exatamente por ela que o seed dos
// cenários passa por cima da própria barreira — e isso não é conveniência de
// teste, é a condição 2 do predicado sob teste (ver caso 8).
const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })
  : null;

// ─── identificadores fixos, legíveis por issue (#163 = ...0163) ─────────────
const C_VENCIDA = "00000000-0000-0000-0000-000000163a01"; // trial vencido, free_tier
const C_ISENTA = "00000000-0000-0000-0000-000000163a02"; // isento_trial = true
const C_NOVA = "00000000-0000-0000-0000-000000163a03"; // nunca iniciou o trial
const C_VIZINHA = "00000000-0000-0000-0000-000000163a04"; // tenant vizinho, saudável

const S_VENCIDA = "00000000-0000-0000-0000-000000163b01";
const S_ISENTA = "00000000-0000-0000-0000-000000163b02";
const S_NOVA = "00000000-0000-0000-0000-000000163b03";
const S_VIZINHA = "00000000-0000-0000-0000-000000163b04";

/**
 * As 18 tabelas que a 0073 lista como alvo. Escrita à mão de propósito: ler o
 * array do próprio SQL faria o teste concordar com o arquivo em vez de medir o
 * banco — e um `ALTER TABLE ... DISABLE TRIGGER` aplicado à mão em produção
 * passaria despercebido.
 */
const TABELAS_COM_BARREIRA = [
  "agendamento_recorrente",
  "bloqueio",
  "care_team_membership",
  "clinic",
  "evidence",
  "evidence_revision",
  "goal",
  "goal_candidacy",
  "goal_milestone_mapping",
  "janela_trabalho",
  "patient",
  "patient_alvo_disciplina",
  "patient_clinical_profile",
  "patient_protocol",
  "session",
  "session_note",
  "session_protocol_scope",
  "user_role",
].sort();

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
 * Semeia os quatro cenários de clínica dentro da transação corrente.
 *
 * `criado_em` bem no passado nas três primeiras: o ramo
 * `COALESCE(trial_comeco_em, criado_em + 14 days)` do predicado é o teto de
 * quem nunca cadastrou paciente, e uma clínica "criada agora" estaria dentro
 * dele — o cenário de trial VENCIDO ficaria verde por acidente.
 */
async function semear(tx: postgres.TransactionSql) {
  await tx`INSERT INTO clinic (id, nome, criado_em, trial_comeco_em, trial_dias, isento_trial) VALUES
    (${C_VENCIDA},  'Vencida #163',  now() - interval '400 days', now() - interval '90 days', 7, false),
    (${C_ISENTA},   'Isenta #163',   now() - interval '400 days', now() - interval '90 days', 7, true),
    (${C_VIZINHA},  'Vizinha #163',  now() - interval '400 days', now() - interval '90 days', 7, false),
    -- Clínica NOVA: nunca chamou app_iniciar_trial(), então trial_comeco_em é
    -- NULL e ela está a 1 dia do cadastro — dentro do teto de 14 dias.
    (${C_NOVA},     'Nova #163',     now() - interval '1 day',    NULL,                       7, false)`;

  await tx`INSERT INTO subscription (id, clinic_id, status, provider) VALUES
    (${S_VENCIDA},  ${C_VENCIDA},  'free_tier', NULL),
    (${S_ISENTA},   ${C_ISENTA},   'free_tier', NULL),
    (${S_NOVA},     ${C_NOVA},     'free_tier', NULL),
    (${S_VIZINHA},  ${C_VIZINHA},  'active', 'asaas')`;
}

/**
 * Assume o papel de aplicação para a clínica dada, com os GUCs que a RLS de
 * `patient` exige. `SET LOCAL` + `set_config(..., true)`: tudo morre no
 * rollback.
 *
 * `app_role` não é superusuário nem BYPASSRLS (medido em `pg_roles` no caso 1),
 * que é o que satisfaz a condição 2 do predicado da barreira.
 */
async function comoApp(
  tx: postgres.TransactionSql,
  clinicId: string | null,
  papel = "coordenador",
) {
  if (clinicId !== null) {
    await tx`SELECT set_config('app.clinic_id', ${clinicId}, true)`;
  }
  await tx`SELECT set_config('app.user_role', ${papel}, true)`;
  await tx`SET LOCAL ROLE app_role`;
}

/** Volta para a role dona dentro da mesma transação (para ler o oráculo). */
async function comoDono(tx: postgres.TransactionSql) {
  await tx`RESET ROLE`;
}

/** Lê o veredito da função pela conexão/role corrente. */
async function contaSomenteLeitura(tx: postgres.TransactionSql) {
  const [row] = await tx<{ ro: boolean }[]>`
    SELECT app_conta_somente_leitura() AS ro`;
  return row!.ro;
}

/**
 * Tenta cadastrar um paciente pela role de aplicação e devolve o erro, ou
 * `null` se passou. Não devolve "linhas afetadas": a barreira é
 * `RAISE EXCEPTION` de propósito, e "0 linhas em silêncio" (o modo de falha da
 * RLS) seria indistinguível de sucesso.
 *
 * O INSERT vai dentro de um SAVEPOINT: o `RAISE EXCEPTION` da barreira aborta a
 * transação inteira, e sem o savepoint o próprio teste não conseguiria ler o
 * oráculo depois (`current transaction is aborted`). Em caso de sucesso o
 * savepoint é liberado e a linha permanece — é o que permite contar as escritas
 * que DEVERIAM ter acontecido.
 */
async function tentarCadastrar(
  tx: postgres.TransactionSql,
  clinicId: string,
  nome: string,
): Promise<postgres.PostgresError | null> {
  try {
    await tx.savepoint(async (sp) => {
      await sp`INSERT INTO patient (clinic_id, nome) VALUES (${clinicId}, ${nome})`;
    });
    return null;
  } catch (e) {
    return e as postgres.PostgresError;
  }
}

describe.skipIf(!hasDb)("#163 · barreira da conta em somente-leitura", () => {
  afterAll(async () => {
    await owner?.end();
  });

  // ─── 1. as funções existem, e com o modo de segurança certo ───────────────
  test("app_conta_somente_leitura existe e NÃO é SECURITY DEFINER", async () => {
    const rows = await owner!<{ proname: string; prosecdef: boolean }[]>`
      SELECT proname, prosecdef FROM pg_proc
       WHERE proname IN ('app_conta_somente_leitura', 'app_barreira_somente_leitura')
       ORDER BY proname`;

    expect(rows.map((r) => r.proname)).toEqual([
      "app_barreira_somente_leitura",
      "app_conta_somente_leitura",
    ]);

    // O `prosecdef = false` não é detalhe de estilo. DEFINER aqui rodaria como
    // o dono (superuser + BYPASSRLS) e a função passaria a enxergar `clinic` e
    // `subscription` de TODOS os tenants — o predicado depende do GUC para
    // filtrar, mas qualquer mudança futura na leitura vazaria cross-tenant sem
    // aviso. CLAUDE.md §5 exige DEFINER quando a ESCRITA sai do que a RLS
    // permite; esta função não escreve nada.
    const conta = rows.find((r) => r.proname === "app_conta_somente_leitura");
    expect(conta!.prosecdef).toBe(false);

    // E a role de aplicação precisa conseguir EXECUTAR: sem o GRANT a barreira
    // estouraria "permission denied for function" em TODA escrita — falha
    // fechada e ruidosa, mas pelo motivo errado.
    const [priv] = await owner!<{ ok: boolean }[]>`
      SELECT has_function_privilege('app_role', 'app_conta_somente_leitura()', 'EXECUTE') AS ok`;
    expect(priv!.ok).toBe(true);

    // Premissa da condição 2 do predicado, medida e não assumida: `app_role`
    // não é superusuário nem BYPASSRLS. Se alguém promover a role, a barreira
    // inteira vira no-op e TODOS os testes de bloqueio abaixo passariam a
    // falhar — este é o diagnóstico.
    const [role] = await owner!<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'app_role'`;
    expect(role!.rolsuper).toBe(false);
    expect(role!.rolbypassrls).toBe(false);
  });

  // ─── 2. os 18 triggers estão instalados E ligados ─────────────────────────
  test("os 18 triggers de barreira existem e estão HABILITADOS", async () => {
    // A 0073 cria os triggers DESABILITADOS de propósito e a 0074 liga a chave.
    // Sem a checagem de `tgenabled` este teste ficaria verde com a 0074 nunca
    // aplicada — que é precisamente o incidente da 0055 (migração commitada,
    // ausente do `_journal.json`, nunca executada, issue fechada pelo diff).
    const rows = await owner!<{ tabela: string; tgenabled: string }[]>`
      SELECT tgrelid::regclass::text AS tabela, tgenabled
        FROM pg_trigger
       WHERE tgname = tgrelid::regclass::text || '_somente_leitura'
         AND NOT tgisinternal
       ORDER BY 1`;

    expect(rows.map((r) => r.tabela)).toEqual(TABELAS_COM_BARREIRA);
    // 'D' = disabled. Qualquer outro valor ('O', 'R', 'A') dispara.
    expect(rows.filter((r) => r.tgenabled === "D")).toEqual([]);
  });

  // ─── 3. o bloqueio de fato (trial vencido, sem assinatura) ────────────────
  test("trial VENCIDO + free_tier: cadastrar paciente ESTOURA", async () => {
    const erro = await emTransacao(async (tx) => {
      await semear(tx);
      await comoApp(tx, C_VENCIDA);
      expect(await contaSomenteLeitura(tx)).toBe(true);
      return tentarCadastrar(tx, C_VENCIDA, "Paciente barrado #163");
    });

    // O erro TEM que chegar. Um bloqueio silencioso (RETURN NULL no trigger, ou
    // policy que rejeita a linha) afetaria 0 linhas sem reclamar: a action
    // devolveria "salvo" e o prontuário simplesmente não existiria.
    expect(erro).not.toBeNull();
    expect(erro!.code).toBe("P0001");
    expect(erro!.message).toMatch(/somente-leitura/);
    // O nome da tabela vai na mensagem — é o que dá diagnóstico quando o
    // caminho de escrita bloqueado não é o cadastro de paciente.
    expect(erro!.message).toMatch(/patient/);
  });

  // ─── 4. assinatura ativa destrava ─────────────────────────────────────────
  test("status `active` na MESMA clínica destrava o cadastro", async () => {
    // Mesma linha de `clinic` do caso 3, com o trial igualmente vencido: a
    // única variável é o status da assinatura. Se este teste ficasse vermelho,
    // a clínica PAGANTE estaria trancada — o pior modo de falha possível de uma
    // regra de cobrança.
    const { ro, erro } = await emTransacao(async (tx) => {
      await semear(tx);
      await tx`UPDATE subscription SET status = 'active', provider = 'asaas' WHERE id = ${S_VENCIDA}`;
      await comoApp(tx, C_VENCIDA);
      const ro = await contaSomenteLeitura(tx);
      return {
        ro,
        erro: await tentarCadastrar(tx, C_VENCIDA, "Paciente ok #163"),
      };
    });

    expect(ro).toBe(false);
    expect(erro).toBeNull();
  });

  // ─── 5. past_due passa, canceled bloqueia ─────────────────────────────────
  test("`past_due` NÃO tranca o prontuário (inadimplência ≠ perda de acesso)", async () => {
    // Decisão de produto: cobrança em atraso vira régua de cobrança, não trava
    // clínica. Trancar o prontuário de quem atrasou um boleto colocaria dado
    // clínico de menor como refém de uma disputa financeira.
    const { ro, erro } = await emTransacao(async (tx) => {
      await semear(tx);
      await tx`UPDATE subscription SET status = 'past_due', provider = 'asaas' WHERE id = ${S_VENCIDA}`;
      await comoApp(tx, C_VENCIDA);
      const ro = await contaSomenteLeitura(tx);
      return {
        ro,
        erro: await tentarCadastrar(tx, C_VENCIDA, "Paciente past_due #163"),
      };
    });

    expect(ro).toBe(false);
    expect(erro).toBeNull();
  });

  test("`canceled` bloqueia MESMO com o trial nominalmente vigente", async () => {
    // Cancelamento é ato deliberado do cliente e vence a janela de trial: sem
    // esta cláusula, cancelar e recriar a assinatura devolveria trial novo, e o
    // produto viraria gratuito por reciclagem de conta.
    const { ro, erro } = await emTransacao(async (tx) => {
      await semear(tx);
      await tx`UPDATE clinic SET trial_comeco_em = now() WHERE id = ${C_VENCIDA}`;
      await tx`UPDATE subscription SET status = 'canceled', provider = 'asaas' WHERE id = ${S_VENCIDA}`;
      await comoApp(tx, C_VENCIDA);
      const ro = await contaSomenteLeitura(tx);
      return {
        ro,
        erro: await tentarCadastrar(tx, C_VENCIDA, "Paciente canceled #163"),
      };
    });

    expect(ro).toBe(true);
    expect(erro).not.toBeNull();
    expect(erro!.code).toBe("P0001");
  });

  // ─── 6. isenção ──────────────────────────────────────────────────────────
  test("`isento_trial = true` passa sempre, com trial vencido e free_tier", async () => {
    // Contas legadas/cortesia. Estado idêntico ao do caso 3 exceto pela flag —
    // é a flag que está sob teste, não a data.
    const { ro, erro } = await emTransacao(async (tx) => {
      await semear(tx);
      await comoApp(tx, C_ISENTA);
      const ro = await contaSomenteLeitura(tx);
      return {
        ro,
        erro: await tentarCadastrar(tx, C_ISENTA, "Paciente isento #163"),
      };
    });

    expect(ro).toBe(false);
    expect(erro).toBeNull();
  });

  // ─── 7. o caso que quebra o onboarding inteiro se estiver errado ──────────
  test("clínica NOVA (trial_comeco_em NULL) cadastra o 1º paciente E inicia o trial", async () => {
    // Este é o caminho do primeiro minuto de vida de toda conta: o cadastro do
    // 1º paciente é o que DISPARA `app_iniciar_trial()`. Duas armadilhas moram
    // aqui:
    //
    //   (i)  `trial_comeco_em IS NULL` não pode significar "trial já venceu".
    //        O predicado usa `criado_em + 14 days` como teto — dentro dele a
    //        conta escreve normalmente.
    //   (ii) `app_iniciar_trial()` escreve em `clinic`, e `clinic` TEM trigger
    //        de barreira. Como ela é SECURITY DEFINER do dono, `current_user`
    //        lá dentro é o superusuário — e é exatamente por isso que a
    //        condição 2 do predicado testa `rolsuper`/`rolbypassrls` em vez de
    //        confiar em `pg_has_role` sozinho (o Postgres considera o
    //        superusuário membro implícito de TODA role, então `pg_has_role`
    //        daria true e a função se auto-bloquearia).
    //
    // Os dois passos rodam na MESMA transação, na mesma ordem do produto.
    const r = await emTransacao(async (tx) => {
      await semear(tx);
      await comoApp(tx, C_NOVA);

      const ro = await contaSomenteLeitura(tx);
      const erroCadastro = await tentarCadastrar(tx, C_NOVA, "Primeiro #163");

      let erroTrial: postgres.PostgresError | null = null;
      try {
        await tx.savepoint(async (sp) => {
          await sp`SELECT app_iniciar_trial()`;
        });
      } catch (e) {
        erroTrial = e as postgres.PostgresError;
      }

      await comoDono(tx);
      const [clinica] = await tx<{ trial_comeco_em: Date | null }[]>`
        SELECT trial_comeco_em FROM clinic WHERE id = ${C_NOVA}`;
      return {
        ro,
        erroCadastro,
        erroTrial,
        trialComecouEm: clinica!.trial_comeco_em,
      };
    });

    expect(r.ro).toBe(false);
    expect(r.erroCadastro).toBeNull();
    expect(r.erroTrial).toBeNull();
    // Não basta "não estourou": a escrita em `clinic` tem que ter ACONTECIDO.
    // Um trigger que devolvesse NULL em vez de RAISE deixaria o UPDATE sumir em
    // silêncio e o trial nunca começaria — a conta ficaria em teto de 14 dias
    // para sempre.
    expect(r.trialComecouEm).not.toBeNull();
  });

  test("clínica NOVA fora do teto de 14 dias JÁ cai em somente-leitura", async () => {
    // Contraprova do caso anterior: o teto existe para que quem nunca cadastrou
    // paciente não fique com trial eterno. Sem este caso, "trial_comeco_em NULL
    // ⇒ nunca bloqueia" passaria despercebido e o produto seria de graça para
    // quem só criasse a conta.
    const { ro, erro } = await emTransacao(async (tx) => {
      await semear(tx);
      await tx`UPDATE clinic SET criado_em = now() - interval '400 days'
                WHERE id = ${C_NOVA}`;
      await comoApp(tx, C_NOVA);
      const ro = await contaSomenteLeitura(tx);
      return {
        ro,
        erro: await tentarCadastrar(tx, C_NOVA, "Tardio #163"),
      };
    });

    expect(ro).toBe(true);
    expect(erro).not.toBeNull();
  });

  // ─── 8. sem GUC de tenant: falha ABERTA, de propósito ─────────────────────
  test("sem GUC de tenant a função devolve false (falhar fechado trancaria o webhook)", async () => {
    // Sem `app.clinic_id` quem executa é o job, o seed, uma migração ou o
    // handler de webhook. Falhar FECHADO aqui trancaria justamente a escrita
    // que promove a assinatura para `active` — a única saída do bloqueio. A
    // conta ficaria presa em somente-leitura DEPOIS de pagar.
    //
    // (O exemplo do enunciado, `iris_auth`, não serve como sonda direta: ele
    // sequer tem EXECUTE nesta função — medido abaixo. A prova operacional é a
    // ausência de GUC, que é o que o predicado realmente olha.)
    const r = await emTransacao(async (tx) => {
      await semear(tx);
      // Só a role muda; nenhum `app.clinic_id` é definido nesta transação.
      await tx`SELECT set_config('app.user_role', 'coordenador', true)`;
      await tx`SET LOCAL ROLE app_role`;
      const ro = await contaSomenteLeitura(tx);
      await comoDono(tx);
      const [priv] = await tx<{ auth: boolean }[]>`
        SELECT has_function_privilege('iris_auth', 'app_conta_somente_leitura()', 'EXECUTE') AS auth`;
      // A role dona, sem GUC, escreve numa clínica em somente-leitura: é o
      // caminho do seed/migração/job, e a barreira não pode alcançá-lo.
      const erroDono = await tentarCadastrar(tx, C_VENCIDA, "Seed #163");
      return { ro, auth: priv!.auth, erroDono };
    });

    expect(r.ro).toBe(false);
    expect(r.erroDono).toBeNull();
    expect(r.auth).toBe(true);
  });

  // ─── 9. isolamento cross-tenant ──────────────────────────────────────────
  test("a barreira de uma clínica não vaza para a vizinha", async () => {
    // A função lê `clinic`/`subscription` pelas policies de SELECT de
    // `app_role`, que são tenant-scoped. O risco: um predicado que perdesse o
    // filtro por `app.clinic_id` (um `EXISTS` sem correlação, por exemplo)
    // trancaria TODOS os tenants assim que UMA clínica vencesse o trial.
    //
    // As duas clínicas coexistem na MESMA transação, com a vencida presente e
    // visível para a role dona — é o cenário que expõe o vazamento.
    const r = await emTransacao(async (tx) => {
      await semear(tx);

      await comoApp(tx, C_VIZINHA);
      const roVizinha = await contaSomenteLeitura(tx);
      const erroVizinha = await tentarCadastrar(
        tx,
        C_VIZINHA,
        "Paciente vizinho #163",
      );

      // Troca de tenant dentro da mesma sessão: a função tem que reavaliar
      // pelo GUC corrente, não cachear a primeira resposta.
      await tx`SELECT set_config('app.clinic_id', ${C_VENCIDA}, true)`;
      const roVencida = await contaSomenteLeitura(tx);
      const erroVencida = await tentarCadastrar(
        tx,
        C_VENCIDA,
        "Paciente vencido #163",
      );

      await comoDono(tx);
      const [n] = await tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM patient WHERE clinic_id = ${C_VIZINHA}`;
      return { roVizinha, erroVizinha, roVencida, erroVencida, nVizinha: n!.n };
    });

    expect(r.roVizinha).toBe(false);
    expect(r.erroVizinha).toBeNull();
    expect(r.nVizinha).toBe(1); // a escrita da vizinha aconteceu de verdade

    expect(r.roVencida).toBe(true);
    expect(r.erroVencida).not.toBeNull();
    expect(r.erroVencida!.code).toBe("P0001");
  });

  // ─── 10. GUC presente mas não-UUID: falha ABERTA, sem exceção (#215) ──────
  test("GUC de tenant inválido devolve false em vez de estourar 22P02", async () => {
    // O caso 8 cobre a AUSÊNCIA do GUC. Este cobre o GUC PRESENTE e inválido —
    // string vazia (o valor que `set_config` deixa quando alguém "limpa" o
    // tenant), lixo, UUID truncado. Sem o `CASE ... ~ '^[0-9a-f]{8}-...'`, o
    // `::uuid` estoura `invalid input syntax for type uuid` (SQLSTATE 22P02).
    //
    // Por que isso é pior que um erro qualquer: a função é chamada de dentro
    // do trigger `app_barreira_somente_leitura`, logo a exceção não fica na
    // sonda — ela aborta a transação de escrita inteira, em CLÍNICA PAGANTE,
    // por um GUC malformado. E é o oposto da decisão de projeto do caso 8:
    // tenant não resolvível tem que falhar ABERTO, senão o webhook que promove
    // a assinatura para `active` — a saída do bloqueio — fica trancado.
    //
    // Este teste roda contra o banco, não contra o arquivo: o guard existe no
    // `0073` desde 04/08/2026, mas foi escrito EDITANDO a migração já aplicada,
    // e o Drizzle nunca reexecuta um `tag` já registrado. Em base que veio
    // migrando (produção), o guard nunca chegou. A `0082` reaplica.
    const r = await emTransacao(async (tx) => {
      await semear(tx);
      await tx`SELECT set_config('app.user_role', 'coordenador', true)`;
      await tx`SET LOCAL ROLE app_role`;

      const out: Record<string, boolean | string> = {};
      for (const [caso, valor] of [
        ["vazio", ""],
        ["lixo", "nao-e-uuid"],
        ["truncado", "00000000-0000-0000-0000-0000001"],
      ] as const) {
        try {
          await tx.savepoint(async (sp) => {
            await sp`SELECT set_config('app.clinic_id', ${valor}, true)`;
            const [row] = await sp<{ ro: boolean }[]>`
              SELECT app_conta_somente_leitura() AS ro`;
            out[caso] = row!.ro;
          });
        } catch (e) {
          out[caso] = `erro:${(e as postgres.PostgresError).code}`;
        }
      }
      return out;
    });

    expect(r).toEqual({ vazio: false, lixo: false, truncado: false });
  });
});
