-- Reconciliação do snapshot do Drizzle (issue #186 / débito D1).
--
-- Contexto: a partir da Fase 7 as migrações passaram a ser escritas à mão e o
-- snapshot em `db/migrations/meta/` parou na 0041. Como `drizzle-kit generate`
-- diffa schema.ts contra o ÚLTIMO snapshot, ele passou a propor recriar tudo o
-- que as migrações manuais criaram (79 statements, 128+ linhas) — SQL que
-- derrubaria produção se aplicado.
--
-- Esta migração acompanha o snapshot 0078, gerado a partir de `src/db/schema.ts`
-- (portanto, correto por construção). O que sobrou de SQL aqui é só a
-- divergência REAL entre schema.ts e o banco, medida — não presumida — assim:
-- banco vazio → 0000..0077 aplicadas → cada statement do generate executado em
-- transação com ROLLBACK → comparação campo a campo snapshot × catálogo do
-- Postgres. Dos 79 statements propostos, 60 eram redundantes (objeto já existe)
-- e o restante se resolve nas duas classes abaixo.
--
-- Classe 1 — nomes de constraint. As migrações manuais criaram FK/PK/UNIQUE sem
-- nomear, então o Postgres aplicou o padrão dele (`_fkey`, `_pkey`, `_key`),
-- enquanto o Drizzle nomeia (`_fk`, `_pk`, `_unique`). A definição é idêntica;
-- só o nome diverge. Sem renomear, um `generate` futuro que altere uma dessas
-- FKs emitiria `DROP CONSTRAINT "..._fk"` — nome que não existe em produção.
--
-- Classe 2 — `clinic.passo_grade_min`. schema.ts declara `.default(60)` desde
-- a equalização dos calendários em grade de 60min, mas nenhuma migração levou
-- isso ao banco, que segue com o `DEFAULT 30` da 0023. Só o default muda aqui:
-- linhas existentes ficam como estão (mudar a grade de clínicas já ativas é
-- decisão de produto, não de reconciliação de schema).
--
-- Fora de escopo (documentado, não corrigido): a FK
-- `evidence_query.resultante_evidence_revision_id` tem nome de 70 caracteres no
-- schema.ts e o Postgres trunca identificadores em 63. O banco guarda a versão
-- truncada e o Postgres aplica a mesma truncagem a qualquer DDL futura, então o
-- comportamento é consistente — renomear não resolveria.

-- Classe 1: alinhar nomes de constraint ao que o Drizzle espera.
-- Idempotente: só renomeia se o nome antigo existir e o novo ainda não.
DO $$
DECLARE
  par record;
BEGIN
  FOR par IN
    SELECT * FROM (VALUES
      ('alerta_risco_clinico', 'alerta_risco_clinico_clinic_id_fkey', 'alerta_risco_clinico_clinic_id_clinic_id_fk'),
      ('alerta_risco_clinico', 'alerta_risco_clinico_session_id_fkey', 'alerta_risco_clinico_session_id_session_id_fk'),
      ('alerta_risco_clinico', 'alerta_risco_clinico_reconhecido_por_fkey', 'alerta_risco_clinico_reconhecido_por_app_user_id_fk'),
      ('alerta_risco_clinico', 'alerta_risco_clinico_atualizado_por_fkey', 'alerta_risco_clinico_atualizado_por_app_user_id_fk'),
      ('billing_cycle', 'billing_cycle_clinic_id_fkey', 'billing_cycle_clinic_id_clinic_id_fk'),
      ('billing_cycle', 'billing_cycle_subscription_id_fkey', 'billing_cycle_subscription_id_subscription_id_fk'),
      ('billing_cycle_patient', 'billing_cycle_patient_cycle_id_fkey', 'billing_cycle_patient_cycle_id_billing_cycle_id_fk'),
      ('billing_cycle_patient', 'billing_cycle_patient_patient_id_clinic_id_fkey', 'billing_cycle_patient_patient_fk'),
      ('billing_cycle_patient', 'billing_cycle_patient_pkey', 'billing_cycle_patient_cycle_id_patient_id_pk'),
      ('clinic', 'clinic_responsavel_tecnico_id_fkey', 'clinic_responsavel_tecnico_id_app_user_id_fk'),
      ('clinic', 'clinic_protocolo_emergencia_declarado_por_fkey', 'clinic_protocolo_emergencia_declarado_por_app_user_id_fk'),
      ('professional_consent', 'professional_consent_user_id_fkey', 'professional_consent_user_id_app_user_id_fk'),
      ('professional_consent', 'professional_consent_clinic_id_fkey', 'professional_consent_clinic_id_clinic_id_fk'),
      ('subscription', 'subscription_clinic_id_fkey', 'subscription_clinic_id_clinic_id_fk'),
      ('subscription', 'subscription_clinic_id_key', 'subscription_clinic_id_unique'),
      ('subscription', 'subscription_provider_subscription_id_key', 'subscription_provider_subscription_id_unique'),
      ('two_factor', 'two_factor_user_id_fkey', 'two_factor_user_id_app_user_id_fk'),
      ('asaas_webhook_event', 'asaas_webhook_event_asaas_event_id_key', 'asaas_webhook_event_asaas_event_id_unique'),
      ('mercadopago_webhook_event', 'mercadopago_webhook_event_provider_event_id_key', 'mercadopago_webhook_event_provider_event_id_unique')
    ) AS t(tabela, nome_antigo, nome_novo)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = par.nome_antigo AND conrelid = par.tabela::regclass
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = par.nome_novo AND conrelid = par.tabela::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I RENAME CONSTRAINT %I TO %I',
        par.tabela, par.nome_antigo, par.nome_novo
      );
    END IF;
  END LOOP;
END $$;--> statement-breakpoint

-- Classe 2: default declarado em schema.ts que nunca chegou ao banco.
ALTER TABLE "clinic" ALTER COLUMN "passo_grade_min" SET DEFAULT 60;
