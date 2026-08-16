-- 0097 — `billing_cycle_status.devido`: o destino do ciclo interrompido pelo
-- cancelamento (#287 Problema 1, desenho decidido na #290).
--
-- Antes desta migração o cancelamento só trocava `subscription.status` para
-- `canceled`. O `billing_cycle` em `aberto` ficava órfão PARA SEMPRE, porque
-- `fecharCiclosVencendo` varre `subscription.status = 'active'` e nunca mais
-- enxerga a assinatura. Clínica que usa 20 dias do ciclo e revoga a autorização
-- no app do banco no dia 20 não gerava fatura nenhuma — e nada ficava vermelho.
--
-- `devido` é o estado terminal desse ciclo: apurado, com o valor congelado em
-- pro-rata dos dias usados, e SEM cobrança emitida. Não emitir é deliberado — a
-- autorização do Pix Automático acabou de ser revogada, não existe trilho para
-- cobrar naquele instante. A cobrança acontece no gate de reativação (#290).
--
-- Por que valor novo no enum, e não reuso:
--   * `apurado` é estado de passagem do job de fechamento — ficaria elegível a
--     uma nova varredura e à emissão de cobrança num trilho morto;
--   * `falhou` afirma um fato que não aconteceu (cobrança emitida e recusada);
--   * `pago` seria mentira contábil.
--
-- O memorial do cálculo fica derivável da própria linha: `pacientes_contados`
-- (contagem cheia do ciclo), `inicio`/`fim` (a régua de dias) e
-- `subscription.cancelada_em` (o corte). `valor_centavos` guarda o resultado.
ALTER TYPE "public"."billing_cycle_status" ADD VALUE IF NOT EXISTS 'devido';--> statement-breakpoint

COMMENT ON TYPE "public"."billing_cycle_status" IS
  'Fluxo pós-pago: aberto → apurado → aguardando_pagamento → pago, com `falhou` no ramo de recusa. `cobrado` é legado (0075). `devido` (0097) é o ciclo interrompido pelo cancelamento: apurado, congelado em pro-rata e sem cobrança emitida — quem cobra é o gate de reativação (#287/#290).';
