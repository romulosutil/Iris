-- ============================================================================
-- 0082 — app_conta_somente_leitura falha ABERTA com GUC inválido (#215)
-- ============================================================================
--
-- Sintoma: com `app.clinic_id` presente mas não-UUID (string vazia — o valor
-- que sobra quando alguém "limpa" o tenant —, lixo, UUID truncado), chamar
-- `app_conta_somente_leitura()` pela role de aplicação estoura
-- `invalid input syntax for type uuid: ""` (SQLSTATE 22P02).
--
-- Por que isso importa mais do que uma sonda que falha: a função é chamada de
-- dentro do trigger `app_barreira_somente_leitura` (0073/0074). A exceção não
-- fica contida — ela aborta a transação de ESCRITA inteira, em clínica
-- pagante, por um GUC malformado. E é o oposto exato da decisão de projeto
-- registrada na 0073: tenant não resolvível tem que falhar ABERTO (`false`),
-- senão o webhook que promove a assinatura para `active` — a única saída do
-- bloqueio — fica trancado e a conta segue em somente-leitura DEPOIS de pagar.
--
-- ---------------------------------------------------------------------------
-- Dois achados que mudaram o desenho do fix
-- ---------------------------------------------------------------------------
--
-- 1. O guard já existia no arquivo — e nunca chegou no banco. O
--    `CASE ... ~ '^[0-9a-fA-F]{8}-...'` foi escrito EDITANDO a `0073` no lugar
--    (commit b53b294), depois de a `0073` já ter sido aplicada. O Drizzle
--    aplica por `tag` do `_journal.json` e nunca reexecuta um tag já
--    registrado em `drizzle.__drizzle_migrations`: editar migração aplicada
--    não dá erro, não dá aviso e não roda. Base criada do zero (dev, CI) tem o
--    guard; base que veio migrando (produção) tem a versão que estoura — e o
--    `git diff` mostra o código certo o tempo todo. Os `GRANT EXECUTE` para
--    `iris_auth` e para `app_barreira_somente_leitura` entraram no mesmo
--    commit e têm o mesmo problema, por isso são reaplicados abaixo.
--
-- 2. Só o guard não resolve. Medido em `pg_policies`: a policy `clinic_read`
--    é `id = current_setting('app.clinic_id')::uuid` — sem `missing_ok` e com
--    o mesmo cast. Sob `app_role`, o simples `FROM clinic` da função dispara a
--    policy e o 22P02 vem DELA, antes de o `CASE` da função decidir qualquer
--    coisa. Guard interno que ainda assim toca a tabela é guard que não guarda.
--
-- Daí o desenho: resolver o tenant PRIMEIRO e sair por `RETURN false` sem
-- tocar em `clinic`/`subscription` quando ele não é resolvível. `plpgsql` (e
-- não `sql`) justamente pelo curto-circuito explícito.
--
-- Continua sem `SECURITY DEFINER`, mesmo raciocínio da 0073: a função não
-- escreve nada e lê pelas policies tenant-scoped de `app_role`. DEFINER aqui
-- rodaria como o dono (superuser + BYPASSRLS) e passaria a enxergar todos os
-- tenants (`conta-somente-leitura-rls.int.test.ts` mede `prosecdef = false`).
--
-- As 43 policies que fazem o mesmo cast sem `missing_ok` continuam expostas ao
-- mesmo 22P02 por outros caminhos de leitura — é débito próprio, registrado no
-- BACKLOG, e não entra aqui: mexer em 43 policies para consertar uma função é
-- trocar um erro barulhento por um risco de isolamento silencioso.
--
-- Escrita à mão de propósito: função e grant não moram em `src/db/schema.ts`,
-- o Drizzle não os modela e `db:generate` não os produziria. Nada aqui toca o
-- snapshot.

-- ==================== app_clinic_id_atual ====================
-- Fonte única do "tenant corrente, ou NULL se não der para resolver".
-- `missing_ok = true` (GUC ausente → NULL, não 42704) + regex antes do cast
-- (GUC presente mas inválido → NULL, não 22P02).
CREATE OR REPLACE FUNCTION app_clinic_id_atual()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT CASE
           WHEN current_setting('app.clinic_id', true) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
           THEN current_setting('app.clinic_id', true)::uuid
           ELSE NULL
         END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_clinic_id_atual() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_clinic_id_atual() TO app_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_clinic_id_atual() TO iris_auth;
--> statement-breakpoint

-- ==================== app_conta_somente_leitura ====================
-- A regra de negócio é a MESMA da 0073, linha por linha — inclusive a folga de
-- `+ 1 day` que mantém esta rede estritamente mais permissiva que
-- `src/lib/trial.ts`, e o teto `criado_em + 14 days` de quem nunca iniciou o
-- trial. O que muda é só o curto-circuito antes de tocar as tabelas.
CREATE OR REPLACE FUNCTION app_conta_somente_leitura()
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE
  cid uuid;
  ctx record;
BEGIN
  cid := app_clinic_id_atual();

  -- Sem tenant resolvível: PERMITE, e sem ler `clinic` — é aqui que o 22P02
  -- da policy `clinic_read` deixa de acontecer.
  IF cid IS NULL THEN
    RETURN false;
  END IF;

  SELECT c.isento_trial, c.trial_comeco_em, c.trial_dias, c.criado_em,
         (SELECT s.status::text FROM subscription s WHERE s.clinic_id = c.id) AS status
    INTO ctx
    FROM clinic c
   WHERE c.id = cid;

  -- Sem linha visível (tenant inexistente, ou invisível para esta role):
  -- PERMITE. Mesma decisão da 0073.
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN NOT (
    ctx.isento_trial
    OR ctx.trial_dias IS NULL
    OR COALESCE(ctx.status, 'free_tier') IN ('active', 'past_due')
    OR (
      COALESCE(ctx.status, 'free_tier') <> 'canceled'
      AND now() < COALESCE(ctx.trial_comeco_em, ctx.criado_em + interval '14 days')
                  + ((ctx.trial_dias + 1) * interval '1 day')
    )
  );
END;
$$;
--> statement-breakpoint

-- `CREATE OR REPLACE` preserva os grants existentes; estes são os que a edição
-- in-place da 0073 nunca entregou em base já migrada (achado 1 do cabeçalho).
REVOKE ALL ON FUNCTION app_conta_somente_leitura() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_conta_somente_leitura() TO app_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_conta_somente_leitura() TO iris_auth;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_barreira_somente_leitura() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_barreira_somente_leitura() TO app_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_barreira_somente_leitura() TO iris_auth;
