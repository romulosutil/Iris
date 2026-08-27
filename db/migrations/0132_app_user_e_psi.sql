ALTER TABLE "app_user" ADD COLUMN "e_psi_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "e_psi_number" text;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "e_psi_declarado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_e_psi_check" CHECK (NOT "app_user"."e_psi_verified" OR "app_user"."e_psi_number" IS NOT NULL);--> statement-breakpoint

-- D56 / Res. CFP 009/2024 — declaração de cadastro ativo no e-Psi.
-- Acima: DDL gerada por `pnpm db:generate` a partir de `src/db/schema.ts`.
-- Abaixo: escrito à mão (Drizzle não modela GRANT). O snapshot NÃO é tocado.
--
-- O QUE FOI MEDIDO, e não presumido, antes de escrever estas linhas:
--
--   SELECT grantee, privilege_type FROM information_schema.table_privileges
--    WHERE table_name='app_user' AND grantee='app_role';
--   -->  DELETE, INSERT, SELECT, UPDATE   (privilégio de TABELA, não de coluna)
--
-- Ou seja: ao contrário de `patient` (0044) e de `clinic` (0079), `app_user`
-- NUNCA teve o UPDATE revogado no nível de tabela. Os GRANTs de coluna da 0057
-- eram — e seguem sendo — redundantes. Coluna nova em `app_user` já nasce
-- coberta pelo privilégio de tabela; a mensagem "permission denied for table
-- app_user" NÃO é o modo de falha aqui.
--
-- QUEM BARRA A ESCRITA, então, é a RLS, não o GRANT. `app_user` tem
-- `FORCE ROW LEVEL SECURITY` e uma única policy para `app_role`:
-- `app_user_read`, `FOR SELECT` (0002, predicado reescrito pela 0085). Sem
-- policy `FOR UPDATE`, o UPDATE afeta 0 linhas EM SILÊNCIO. Medido:
--
--   BEGIN;
--   SET LOCAL ROLE app_role;
--   SELECT set_config('app.clinic_id', '1111…', true);
--   UPDATE app_user SET e_psi_verified = true WHERE id = '2222…';
--   -->  UPDATE 0
--   ROLLBACK;
--
-- É por isso que o caminho de escrita é a função `app_declarar_e_psi` (0133,
-- SECURITY DEFINER) e não um UPDATE por `withTenant`. Ver o cabeçalho da 0133.
--
-- Os GRANTs abaixo são defesa em profundidade, no mesmo idioma da 0057: se um
-- dia alguém revogar `app_user` no nível de tabela (alinhando com `patient` e
-- `clinic`), a leitura das colunas de e-Psi continua funcionando sem precisar
-- de outra migração. Hoje são no-op, e estão declarados como tal.
GRANT SELECT (e_psi_verified, e_psi_number, e_psi_declarado_em)
  ON app_user TO app_role;--> statement-breakpoint
GRANT SELECT (e_psi_verified, e_psi_number, e_psi_declarado_em),
      UPDATE (e_psi_verified, e_psi_number, e_psi_declarado_em)
  ON app_user TO iris_auth;
