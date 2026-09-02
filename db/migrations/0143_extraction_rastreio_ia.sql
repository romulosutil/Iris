-- #535 (auditoria 360, DA-02): rastreio da chamada de IA por extração.
--
-- Gerado por `pnpm db:generate` a partir de `src/db/schema.ts` (snapshot 0143);
-- só o cabeçalho é manual. Colunas nullable: linhas anteriores e providers
-- sem modelo (NullProvider) ficam NULL.
--
-- GRANT — medido em `information_schema` ANTES desta migração (regra 4 do
-- CLAUDE.md): `extraction` tem SELECT/INSERT/DELETE concedidos POR TABELA
-- (0006) e só o UPDATE é por coluna (0006/0012/0037/0142). Coluna nova herda
-- SELECT/INSERT da tabela; as cinco colunas abaixo são escritas apenas no
-- INSERT da consolidação (nunca em UPDATE), então NÃO precisam de GRANT
-- adicional. Verificado depois de aplicar: `column_privileges` lista as cinco
-- com SELECT e INSERT para `app_role`.
ALTER TABLE "extraction" ADD COLUMN "modelo" text;--> statement-breakpoint
ALTER TABLE "extraction" ADD COLUMN "prompt_versao" text;--> statement-breakpoint
ALTER TABLE "extraction" ADD COLUMN "latencia_ms" integer;--> statement-breakpoint
ALTER TABLE "extraction" ADD COLUMN "tokens_entrada" integer;--> statement-breakpoint
ALTER TABLE "extraction" ADD COLUMN "tokens_saida" integer;