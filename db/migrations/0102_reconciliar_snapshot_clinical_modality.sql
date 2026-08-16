-- 0102 — reconciliação do snapshot do Drizzle para `clinical_modality`, e
-- rede de segurança para as bases que pularam a `0096` em silêncio.
--
-- ## Por que existe
--
-- A `0096_patient_clinical_modality` (PR #305) foi commitada SEM o
-- `meta/0096_snapshot.json` correspondente. Como `drizzle-kit generate` diffa
-- `src/db/schema.ts` contra o ÚLTIMO snapshot da cadeia, e o último snapshot
-- (agora a `0101`) não conhece `clinical_modality`, o `pnpm db:generate` passou
-- a propor recriar o enum e a coluna a cada execução — o mesmo desencontro que
-- a `0078` fechou para as migrações manuais da Fase 7 (#186 / D1). É a
-- armadilha nº 1 do `CLAUDE.md`: snapshot fora de sincronia gera DDL que
-- derrubaria produção se alguém aplicasse o arquivo proposto.
--
-- Esta migração acompanha o `meta/0102_snapshot.json`, gerado a partir do
-- `schema.ts` (portanto correto por construção). Com ele na ponta da cadeia,
-- `db:generate` volta a responder `No schema changes, nothing to migrate`.
--
-- ## Por que o SQL não é vazio (o `when` da `0096` é menor que o desta linha)
--
-- O Drizzle não aplica o que está em disco: aplica as entradas do
-- `_journal.json` cujo `when` é MAIOR que o `created_at` da última migração já
-- aplicada naquele banco. A `0096` entrou em `main` com `when` 1786625656975 —
-- MENOR que o das migrações desta linha de billing (a partir de
-- 1786731685223), que já rodaram antes dela em qualquer base que tenha
-- acompanhado a #290.
--
-- Nessas bases a `0096` é **pulada sem erro e sem aviso**: exatamente o
-- incidente da `0055` (#128/#165). O sintoma seria `column "clinical_modality"
-- does not exist` em runtime, num banco cuja tabela `drizzle.__drizzle_migrations`
-- não acusa nada de errado.
--
-- Por isso o DDL é repetido aqui de forma IDEMPOTENTE: em banco que aplicou a
-- `0096` na ordem, tudo abaixo é no-op; em banco que a pulou, esta migração é
-- quem cria o enum, a coluna e o grant. Verificar com
-- `information_schema.columns` depois do deploy, não no `git log`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clinical_modality') THEN
    CREATE TYPE "public"."clinical_modality" AS ENUM('conventional', 'protocol_driven');
  END IF;
END $$;--> statement-breakpoint

ALTER TABLE "patient" ADD COLUMN IF NOT EXISTS "clinical_modality" "clinical_modality" DEFAULT 'protocol_driven' NOT NULL;--> statement-breakpoint

-- `patient` tem UPDATE revogado por tabela e concedido coluna a coluna desde a
-- `0044` — coluna nova sem grant explícito estoura `permission denied for table
-- patient` (armadilha nº 4 do `CLAUDE.md`). Regrant é no-op onde a `0096` já
-- passou.
GRANT UPDATE (clinical_modality) ON patient TO app_role;
