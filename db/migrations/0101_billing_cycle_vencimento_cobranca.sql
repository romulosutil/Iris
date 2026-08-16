-- #318 — o vencimento que MANDAMOS ao gateway, persistido.
--
-- É o marco do backstop de D+7 (`aplicarBackstopDePrazo`): em D+7 do vencimento
-- o `POST /pix/automatic/paymentInstructions/{id}/retries` passa a devolver 400
-- pelo limite `7D`, então o trilho automático está PROVADAMENTE esgotado, seja
-- qual for o motivo original da recusa. O número não é escolha nossa.
--
-- Nenhum carimbo que já existia nesta tabela serve, e o motivo é erro de SINAL:
-- `cobranca_emitida_em` e `apurado_em` marcam a EMISSÃO, que acontece de 2 a 10
-- dias ANTES do vencimento; `fim` é o fim do período apurado, anterior à
-- cobrança; `criado_em` é a abertura do ciclo, ~30 dias antes; `cobrado_em` só
-- existe depois de PAGO. Medir D+7 de qualquer um deles carimbaria a clínica de
-- inadimplente antes da data em que ela tinha de pagar — no cluster de fim de
-- ano, com folga (é a mesma sazonalidade do bug que a #317 fechou).
--
-- Recalcular `vencimentoCobrancaDeCiclo(cobranca_emitida_em)` também não serve:
-- a função depende do calendário bancário e das constantes da janela, então
-- mexer nelas reescreveria retroativamente o vencimento de cobranças JÁ
-- emitidas. Guardar o valor que saiu é a única leitura que não se move sozinha.
--
-- Nullable e sem default: ciclo sem cobrança emitida não tem vencimento, e é
-- isso que o mantém FORA do backstop. Linhas anteriores a esta migração ficam
-- `NULL` e nunca são varridas — de propósito, e SEM backfill: derivar o
-- vencimento de `cobranca_emitida_em` seria justamente o recálculo recusado
-- acima, e o trilho de Pix Automático ainda não faturou em produção.
ALTER TABLE "billing_cycle" ADD COLUMN "vencimento_cobranca" timestamp with time zone;--> statement-breakpoint

-- A varredura do backstop filtra por `status` e compara `vencimento_cobranca`.
-- Nenhum índice desta tabela começa por `status` (os que há são por
-- `clinic_id`), e ela roda todo dia sobre a tabela inteira. Mesmo formato e
-- mesma razão de `subscription_carencia_idx` (0099).
CREATE INDEX "billing_cycle_backstop_idx" ON "billing_cycle" USING btree ("status","vencimento_cobranca");--> statement-breakpoint

-- GRANTs explícitos, no idioma da `subscription` (0088:28-29, 0089:33-34) e da
-- 0100 logo antes desta.
--
-- São REDUNDANTES hoje: `billing_cycle` tem privilégio DE TABELA (0071:237 para
-- `app_role`, 0071:244 + 0075:67 para `iris_auth`) e nenhum REVOKE jamais tocou
-- esta tabela. Custam uma linha e sobrevivem ao dia em que alguém converter a
-- tabela para privilégio granular — a armadilha do CLAUDE.md §Migrações item 4
-- ("permission denied for table X" que na verdade é grant de COLUNA faltando).
GRANT SELECT ("vencimento_cobranca") ON "billing_cycle" TO app_role;--> statement-breakpoint
GRANT SELECT ("vencimento_cobranca"), INSERT ("vencimento_cobranca"), UPDATE ("vencimento_cobranca") ON "billing_cycle" TO iris_auth;
