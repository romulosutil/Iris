-- #175 — o relógio do trial passa a começar no 1º paciente, não no signup.
--
-- A 0057 criou `clinic.trial_comeco_em` como `NOT NULL DEFAULT now()` e, para
-- as clínicas que já existiam (nenhuma delas passou pelo self-service), gravou
-- o sentinela `'2020-01-01'`, escolhido para que `diasRestantesDeTrial()`
-- retornasse negativo e a faixa não aparecesse. Quando a faixa ganhou o estado
-- "trial encerrado" (negativo = MOSTRAR), esse sentinela virou uma clínica em
-- trial vencido para sempre — achado do Jules na PR #176, paliado em `ad789a6`
-- com um corte de data em `src/lib/trial.ts`. Esta migração é o fix estrutural:
--
--   1. `trial_comeco_em` vira NULLABLE e perde o DEFAULT. NULL passa a
--      significar, de verdade, "cadastrou, ainda não tem 1º paciente".
--   2. `isento_trial` marca quem nunca contratou trial (legado pré-0057).
--      Sem essa flag, zerar o sentinela para NULL faria o legado cair no teto
--      de 14 dias sobre `criado_em` e virar trial vencido de novo — o mesmo bug
--      por outro caminho. Isento fica fora do relógio E do gate de pagamento.
--
-- Depois desta migração o corte de data (`CORTE_TRIAL_REAL`) sai do código:
-- as duas estratégias não coexistem.

ALTER TABLE clinic
  ALTER COLUMN trial_comeco_em DROP NOT NULL,
  ALTER COLUMN trial_comeco_em DROP DEFAULT;
--> statement-breakpoint

ALTER TABLE clinic
  ADD COLUMN isento_trial boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- Backfill do legado. O critério é o mesmo corte de data que o código usava:
-- nenhuma conta self-service pode ser anterior a 30/07/2026 (data em que a
-- 0057 nasceu), então `trial_comeco_em < '2026-07-01'` só pega o sentinela.
-- A comparação é por corte, não por igualdade com '2020-01-01': a coluna é
-- `timestamptz` e o valor gravado depende do timezone da sessão que rodou a
-- 0057, então igualdade seria frágil.
UPDATE clinic
   SET isento_trial = true,
       trial_comeco_em = NULL
 WHERE trial_comeco_em IS NOT NULL
   AND trial_comeco_em < timestamptz '2026-07-01 00:00:00+00';
--> statement-breakpoint

-- Grant de COLUNA faltando aparece como "permission denied for table clinic",
-- diagnóstico caro (ver 0057).
GRANT SELECT (isento_trial) ON clinic TO app_role, iris_auth;
--> statement-breakpoint
GRANT UPDATE (isento_trial) ON clinic TO iris_auth;
--> statement-breakpoint

-- ==================== app_iniciar_trial ====================
-- `clinic` só tem policy de SELECT para `app_role` (0002) — de propósito: o app
-- não escreve na própria clínica no caminho normal. Iniciar o relógio do trial
-- no cadastro do 1º paciente é a exceção, e ela entra como SECURITY DEFINER em
-- vez de uma policy de UPDATE em `clinic`, para que a superfície de escrita
-- continue sendo exatamente UMA coluna e UMA transição (NULL -> now()).
--
-- Sendo DEFINER, o guard interno É a fronteira de autorização: espelha o
-- predicado de `clinic_read` (0002) — `id = current_setting('app.clinic_id')`.
-- A função nunca aceita clinic_id por parâmetro justamente para não existir
-- caminho de forjar tenant.
--
-- Idempotente e livre de corrida: o `WHERE trial_comeco_em IS NULL` é atômico,
-- então dois pacientes cadastrados em paralelo no onboarding não reiniciam nem
-- duplicam o relógio — o segundo UPDATE não casa nenhuma linha. Clínica isenta
-- nunca inicia trial.
CREATE OR REPLACE FUNCTION app_iniciar_trial()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE clinic
     SET trial_comeco_em = now()
   WHERE id = current_setting('app.clinic_id')::uuid
     AND trial_comeco_em IS NULL
     AND isento_trial = false;
END; $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_iniciar_trial() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_iniciar_trial() TO app_role;
