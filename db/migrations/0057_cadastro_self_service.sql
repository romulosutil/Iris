-- Fatia A (#163): relógio do trial na clínica e registro profissional no usuário.
-- Trial começa no signup. `trial_dias` é coluna (não constante) porque o valor
-- é hipótese de produto e vai mudar sem migração de código.
ALTER TABLE clinic
  ADD COLUMN trial_comeco_em timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN trial_dias integer NOT NULL DEFAULT 7;

-- Backfill: clínicas pré-existentes nunca tiveram período de trial (não integravam o
-- self-service signup). Configurar com um trial já expirado evita que vejam "seu teste
-- termina em N dias" ao renderizar a faixa de trial na Task 11 — ver trial.ts e faixa-trial.tsx
-- para o cálculo de dias restantes e a lógica de renderização. Um valor em 2020 garante
-- que diasRestantesDeTrial() retorne negativo, e o banner não apareça.
-- A migração roda antes de qualquer self-service signup poder existir, portanto todo
-- clinic.id existente neste ponto é pré-existente por definição.
UPDATE clinic SET trial_comeco_em = '2020-01-01';

-- Registro profissional declarado no cadastro (D6): não é verificado na API do
-- conselho — o valor está na trilha auditável, não na barreira.
ALTER TABLE app_user
  ADD COLUMN conselho text,
  ADD COLUMN registro_numero text,
  ADD COLUMN registro_uf text;

ALTER TABLE app_user
  ADD CONSTRAINT app_user_conselho_check
  CHECK (conselho IS NULL OR conselho IN ('crp','crfa','crefito','crm','outro'));

-- Grant de COLUNA faltando aparece como "permission denied for table app_user",
-- diagnóstico caro. Concede explicitamente para os dois papéis de runtime.
GRANT SELECT (conselho, registro_numero, registro_uf) ON app_user TO app_role;
GRANT SELECT (conselho, registro_numero, registro_uf),
      UPDATE (conselho, registro_numero, registro_uf) ON app_user TO iris_auth;
GRANT SELECT (trial_comeco_em, trial_dias) ON clinic TO app_role, iris_auth;
