-- #322 (D-7) — as três colunas da retentativa extradia do Pix Automático.
--
-- Nenhum estado novo, nenhum enum novo: a retentativa não é um status do ciclo,
-- é um ORÇAMENTO gasto dentro dos status que já existem (`falhou`).
--
-- `retentativas_comandadas` é o teto de 3 comandos que o Asaas impõe por
-- cobrança E a base do compare-and-set da D-4 — a reserva é
-- `SET retentativas_comandadas = n + 1 WHERE id = ? AND retentativas_comandadas
-- = n`, e zero linhas afetadas significa que outra passada do job ganhou a
-- corrida e esta pula sem chamar o gateway. `NOT NULL DEFAULT 0` porque "nunca
-- retentou" é 0, não desconhecido: `NULL` quebraria a aritmética do CAS em toda
-- linha pré-existente, e são todas.
--
-- `ultima_retentativa_em` marca o ATO de reservar, não o desfecho: a ordem da
-- D-4 é reserva → chamada → desfecho (o contrário da regra da #319, e
-- deliberadamente, porque aqui o efeito é externo e irreversível), então o
-- carimbo existe mesmo quando a chamada falha depois.
--
-- `ultima_retentativa_vencimento` é `date` e não `timestamptz`: a validação 1 do
-- Asaas exige datas DIFERENTES entre retentativas da mesma cobrança, e o que se
-- compara é dia civil. Guardar instante reintroduziria fuso numa comparação que
-- não tem hora.
--
-- Sem backfill: o trilho de Pix Automático ainda não faturou em produção, e
-- linha antiga com 0 tentativas gastas é exatamente a verdade.
ALTER TABLE "billing_cycle" ADD COLUMN "retentativas_comandadas" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_cycle" ADD COLUMN "ultima_retentativa_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing_cycle" ADD COLUMN "ultima_retentativa_vencimento" date;--> statement-breakpoint

-- GRANTs explícitos, no idioma das 0100:29-30 e 0101:42-43 (as duas migrações
-- anteriores que acrescentaram coluna a esta tabela).
--
-- A role que ESCREVE em `billing_cycle` é `iris_auth`, não `app_role`: o
-- caminho de escrita do ciclo é o job/webhook de billing. `app_role` só lê — é o
-- que a 0071 (`237` vs. `244`) estabeleceu e o que a 0100/0101 repetiram.
--
-- São REDUNDANTES hoje: `billing_cycle` tem privilégio DE TABELA (0071:237 para
-- `app_role`, 0071:244 + 0075:67 para `iris_auth`) e nenhum REVOKE jamais tocou
-- esta tabela. Custam duas linhas e sobrevivem ao dia em que alguém converter a
-- tabela para privilégio granular — a armadilha do CLAUDE.md, §Migrações item 4
-- ("permission denied for table X" que na verdade é grant de COLUNA faltando).
GRANT SELECT ("retentativas_comandadas", "ultima_retentativa_em", "ultima_retentativa_vencimento") ON "billing_cycle" TO app_role;--> statement-breakpoint
GRANT SELECT ("retentativas_comandadas", "ultima_retentativa_em", "ultima_retentativa_vencimento"), INSERT ("retentativas_comandadas", "ultima_retentativa_em", "ultima_retentativa_vencimento"), UPDATE ("retentativas_comandadas", "ultima_retentativa_em", "ultima_retentativa_vencimento") ON "billing_cycle" TO iris_auth;
