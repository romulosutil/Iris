-- #318 — o código CRU da recusa, persistido.
--
-- `billing_cycle.erro` é texto livre, e texto livre cobrindo situações
-- distintas é o defeito que a #318 existe para matar: `LIKE '%teto%'` não é
-- consulta. A classificação (`classificarRecusa`) roda na ESCRITA, no webhook;
-- a tela lê depois, noutro request. Sem o código persistido não há como a UI
-- dizer "suba o limite no app do seu banco" em vez de "você está devendo".
--
-- Guarda o CÓDIGO, nunca o grupo: do código sempre se re-deriva o grupo (o mapa
-- evolui com o catálogo), do grupo não se recupera o código. `text` e não
-- `enum` porque o catálogo é ABERTO — o OpenAPI do Asaas declara
-- `refusalReason` como `string` sem `enum` e a doc avisa que valores entram sem
-- aviso prévio; um enum transformaria código novo do gateway em erro de escrita
-- num caminho que não pode falhar.
--
-- Nullable e sem default, igual a `erro` (0071:106): ciclo nunca recusado não
-- tem código.
ALTER TABLE "billing_cycle" ADD COLUMN "recusa_codigo" text;--> statement-breakpoint

-- GRANTs explícitos, no idioma da `subscription` (0088:28-29, 0089:33-34) e não
-- no da própria `billing_cycle` (a 0098 não emitiu nenhum).
--
-- São REDUNDANTES hoje: `billing_cycle` tem privilégio DE TABELA (0071:237 para
-- `app_role`, 0071:244 + 0075:67 para `iris_auth`) e nenhum REVOKE jamais tocou
-- esta tabela, então a coluna nova já entraria coberta. Custam uma linha e
-- sobrevivem ao dia em que alguém converter a tabela para privilégio granular —
-- a armadilha do CLAUDE.md, §Migrações item 4 ("permission denied for table X"
-- que na verdade é grant de COLUNA faltando).
GRANT SELECT ("recusa_codigo") ON "billing_cycle" TO app_role;--> statement-breakpoint
GRANT SELECT ("recusa_codigo"), INSERT ("recusa_codigo"), UPDATE ("recusa_codigo") ON "billing_cycle" TO iris_auth;
