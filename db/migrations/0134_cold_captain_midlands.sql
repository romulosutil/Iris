ALTER TABLE "billing_cycle" ADD COLUMN "invoice_url" text;--> statement-breakpoint
-- GRANT redundante, e emitido de propósito.
--
-- `billing_cycle` tem GRANT de TABELA desde a 0071:237 (`app_role`) e
-- 0071:244 + 0075:67 (`iris_auth`), e nenhum REVOKE jamais tocou a tabela —
-- privilégio de tabela cobre coluna criada depois, então esta coluna já
-- nasceria legível sem nada disto. O grant explícito segue a convenção das
-- 0100, 0101 e 0106: a auditoria de privilégio desta tabela é feita lendo os
-- arquivos, e uma coluna sem linha própria parece uma coluna esquecida.
GRANT SELECT ("invoice_url") ON "billing_cycle" TO app_role;--> statement-breakpoint
GRANT SELECT ("invoice_url"), INSERT ("invoice_url"), UPDATE ("invoice_url") ON "billing_cycle" TO iris_auth;
