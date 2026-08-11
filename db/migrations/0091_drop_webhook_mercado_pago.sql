-- Remove a tabela de eventos de webhook do Mercado Pago (#36, T18 / débito D24).
--
-- POR QUÊ AGORA: a 0071 criou `mercadopago_webhook_event` como espelho de
-- `asaas_webhook_event` porque a varredura de reprocessamento era uma função só,
-- parametrizada pela tabela do provedor ativo. O T16 deletou o adapter
-- (`provider/mercado-pago.ts`) e a rota (`/api/hooks/mercadopago`), e
-- `reprocessarEventosPendentes` passou a varrer só `asaas_webhook_event`.
-- Depois disso NENHUM caminho de código escreve ou lê esta tabela — o único
-- resquício era a declaração em `src/db/schema.ts`, que sai junto (esta migração
-- foi gerada por `pnpm db:generate`; o `DROP` abaixo é o que ele emitiu, com o
-- guard e o `RESTRICT` acrescentados à mão).
--
-- O trilho do Mercado Pago esteve ativo de 03/08 a 10/08/2026 e NUNCA faturou
-- ninguém: o `preapproval` da única clínica em `setup_pending` jamais foi
-- autorizado (a 0090 devolveu essa linha para `free_tier`). Não há cobrança,
-- conciliação nem evento aplicado a preservar.
--
-- MEDIÇÃO (Postgres local, 11/08/2026 — regra 3 do CLAUDE.md):
--   SELECT count(*) FROM mercadopago_webhook_event                      -->  0
--   SELECT count(*) ... WHERE processado_em IS NULL                     -->  0
--   FKs apontando para a tabela (pg_constraint.confrelid)               -->  nenhuma
--   asaas_webhook_event (a irmã que fica)                               -->  1 linha
--
-- Produção não é alcançável da máquina de desenvolvimento, então a contagem lá
-- é feita PELA PRÓPRIA MIGRAÇÃO, no momento de aplicar: se houver qualquer
-- linha, o bloco abaixo estoura e o stage `migrate` aborta o deploy. Assim
-- "remoção de código morto" nunca vira descarte silencioso de evento não
-- conciliado — e a decisão de dropar × manter como histórico volta para o
-- Rômulo com o número na mão, que é a condição escrita no T18.
DO $$
DECLARE
  v_total bigint;
BEGIN
  SELECT count(*) INTO v_total FROM mercadopago_webhook_event;

  IF v_total > 0 THEN
    RAISE EXCEPTION
      'mercadopago_webhook_event tem % evento(s) gravado(s); o DROP foi desenhado para tabela vazia. Decidir com o Rômulo entre preservar como histórico e descartar antes de reaplicar (issue #36, T18).',
      v_total;
  END IF;
END
$$;
--> statement-breakpoint
-- Sem CASCADE de propósito: a medição não achou dependente algum (nenhuma FK,
-- nenhuma view). Se aparecer um em produção, o certo é a migração falhar e o
-- dependente ser examinado — não ser destruído junto em silêncio. As policies,
-- os índices e os grants da 0071 caem com a tabela, que é o desejado.
DROP TABLE "mercadopago_webhook_event";
