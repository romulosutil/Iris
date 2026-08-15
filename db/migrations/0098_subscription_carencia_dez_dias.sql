ALTER TABLE "subscription" ALTER COLUMN "carencia_dias" SET DEFAULT 10;--> statement-breakpoint
CREATE INDEX "subscription_carencia_idx" ON "subscription" USING btree ("status","past_due_desde");--> statement-breakpoint
-- Backfill escrito à mão (não altera o snapshot do Drizzle).
--
-- `SET DEFAULT` acima só vale para linha NOVA: as assinaturas já existentes
-- continuariam em 7 dias de carência. Nenhuma tela jamais permitiu customizar
-- `carencia_dias` — não há formulário, endpoint nem Server Action que escreva
-- essa coluna —, então toda linha em 7 é default herdado da criação, e não
-- escolha de ninguém. Por isso o backfill é seguro e fica restrito a `= 7`:
-- qualquer valor diferente só poderia ter vindo de um ajuste manual
-- deliberado no banco, e esse a migração preserva.
UPDATE "subscription" SET "carencia_dias" = 10 WHERE "carencia_dias" = 7;
