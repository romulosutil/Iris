-- Fase 7 / #36 — o webhook do Asaas passa a APLICAR efeito, não só registrar.
--
-- Até aqui `asaas_webhook_event` era só histórico bruto: a rota autenticava,
-- deduplicava e respondia 200. Com o `AsaasProvider` implementado, a rota passa
-- a conciliar a cobrança do ciclo — e precisa do mesmo par de colunas que
-- `mercadopago_webhook_event` já tem, com o MESMO nome, porque a varredura
-- `reprocessarEventosPendentes` é uma função só parametrizada pela tabela do
-- provedor ativo.
--
-- Semântica: `aplicado_em` NULL com `processado_em` preenchido = entrega
-- durável, efeito ainda não aplicado. É o predicado que a varredura seleciona.
-- `erro_aplicacao` guarda o motivo da última tentativa; preenchido COM
-- `aplicado_em` também preenchido significa "não vai melhorar com retry"
-- (recusa 4xx definitiva, evento sem id utilizável), e por isso sai da fila.
ALTER TABLE "asaas_webhook_event" ADD COLUMN "aplicado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "asaas_webhook_event" ADD COLUMN "erro_aplicacao" text;--> statement-breakpoint

-- A `0066` deu a `iris_auth` apenas `SELECT, INSERT` nesta tabela — nunca
-- `UPDATE`, porque até agora nada era atualizado. Sem este grant a varredura
-- falharia com `permission denied for table asaas_webhook_event`, mensagem que
-- não diz qual coluna faltou (armadilha já paga em `patient`/0044 e
-- `app_user`/0057). O grant é COLUNA A COLUNA de propósito: o payload bruto e a
-- chave de dedup continuam imutáveis depois de gravados, que é o que torna a
-- reentrega do Asaas inofensiva.
GRANT UPDATE ("aplicado_em", "erro_aplicacao") ON "asaas_webhook_event" TO iris_auth;
