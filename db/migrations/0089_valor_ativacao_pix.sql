-- Débito D22: a ativação do Pix Automático cobra, e o valor não era guardado.
--
-- A Jornada 3 do Bacen só marca uma autorização de Pix Automático como ativa
-- depois que o QR imediato é LIQUIDADO — não existe autorização de graça. O
-- adapter do Asaas já cobrava R$ 0,01 (`VALOR_ATIVACAO_PADRAO_CENTAVOS`), mas
-- descartava o número no retorno: a porta não tinha onde colocá-lo, a linha não
-- tinha coluna, e a tela mostrava um QR sem dizer que dinheiro ia sair.
--
-- A coluna existe porque a reentrada idempotente de `iniciarAtivacao` devolve o
-- BR Code JÁ EMITIDO. O valor está gravado dentro do payload EMV do QR, então
-- reler a constante do adapter mostraria o preço de hoje para um QR emitido com
-- o preço de ontem. Guardar o que foi cobrado é a única leitura honesta.
--
-- Nula de propósito: o trilho de redirect (Mercado Pago) registra o meio de
-- pagamento sem debitar, e forçar 0 ali confundiria "não cobrou" com "cobrou
-- zero". Quem lê trata NULL em linha de Pix como "preço desconhecido" e se
-- recusa a renderizar o QR (`autorizacaoPersistida`).
ALTER TABLE "subscription" ADD COLUMN "valor_ativacao_centavos" integer;--> statement-breakpoint

-- Backfill: toda linha que já tem BR Code foi cobrada em um centavo, porque é o
-- único valor que o adapter já emitiu desde que o trilho existe. Isto registra
-- histórico, não inventa preço — sem ele, essas linhas cairiam no fail-closed
-- de `autorizacaoPersistida` e perderiam o QR pendente na reentrada.
UPDATE "subscription"
SET "valor_ativacao_centavos" = 1
WHERE "pix_copia_e_cola" IS NOT NULL
  AND "valor_ativacao_centavos" IS NULL;--> statement-breakpoint

-- Espelha exatamente o GRANT da 0088, que criou `pix_copia_e_cola`: o
-- privilégio de `subscription` hoje é de tabela (0071/0075), então isto é
-- redundante — e explícito para o dia em que alguém revogar no nível de tabela
-- e passar a granular (armadilha registrada no CLAUDE.md, §Migrações item 4).
GRANT SELECT ("valor_ativacao_centavos") ON "subscription" TO app_role;--> statement-breakpoint
GRANT SELECT ("valor_ativacao_centavos"), INSERT ("valor_ativacao_centavos"), UPDATE ("valor_ativacao_centavos") ON "subscription" TO iris_auth;
