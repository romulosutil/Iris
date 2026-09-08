-- #378 (D2): vínculo de pagamento do trilho cartão de crédito.
--
-- Cartão não tem autorização como o Pix Automático tem. O "vínculo" é o par
-- (`provider_customer_id`, token), e o token pertence ao cliente para o qual
-- nasceu — o Asaas recusa usá-lo em cobrança de outro cliente.
--
-- Colunas próprias em vez de reaproveitar `provider_subscription_id`: aquela
-- coluna significa "id da autorização Pix" e é UNIQUE. Guardar token nela
-- repetiria o D21, quando `checkout_url` carregava BR Code, que não é URL.
--
-- Bandeira e 4 últimos dígitos são o que a tela mostra ("Visa •••• 8829"), e é
-- exatamente o que o Asaas devolve: medido no sandbox em 08/09/2026, o corpo
-- traz `creditCardNumber` com 4 dígitos e `creditCardBrand`. PAN e CVV nunca
-- entram em processo do Iris — o cartão é digitado na fatura hospedada.
ALTER TABLE "subscription" ADD COLUMN "credit_card_token" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "credit_card_bandeira" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "credit_card_ultimos4" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "credit_card_atualizado_em" timestamp with time zone;--> statement-breakpoint

-- Assinatura de cartão ATIVA sem token é a linha que fecha ciclo e não consegue
-- cobrar: sem token não há `POST /payments` possível, e o ciclo venceria em
-- silêncio. Antes de ativar ela existe legitimamente sem token — `free_tier`
-- (nunca ativou) e `setup_pending` (fatura hospedada emitida, cartão ainda não
-- digitado; o token só chega pelo webhook, D4).
--
-- Linha de Pix passa pelo primeiro ramo. `metodo_pagamento` NULL faz a
-- expressão inteira ser NULL, e CHECK com resultado NULL é SATISFEITO — que é o
-- comportamento desejado aqui (linha sem método declarado não é linha de
-- cartão), mas é a armadilha que já mordeu este repo antes, então fica escrito.
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_cartao_ativo_tem_token" CHECK ("subscription"."metodo_pagamento" <> 'cartao' OR "subscription"."status" IN ('free_tier', 'setup_pending') OR "subscription"."credit_card_token" IS NOT NULL);--> statement-breakpoint

-- Espelha os GRANTs da 0088/0089: o privilégio de `subscription` hoje é de
-- tabela (0071/0075), então isto é redundante — e explícito para o dia em que
-- alguém revogar no nível de tabela e passar a granular (CLAUDE.md, §Migrações
-- item 4). Quem escreve nestas colunas é `iris_auth`, o papel do fluxo de
-- billing; `app_role` só lê, para a tela mostrar o cartão mascarado.
GRANT SELECT ("credit_card_token", "credit_card_bandeira", "credit_card_ultimos4", "credit_card_atualizado_em") ON "subscription" TO app_role;--> statement-breakpoint
GRANT SELECT ("credit_card_token", "credit_card_bandeira", "credit_card_ultimos4", "credit_card_atualizado_em"),
      INSERT ("credit_card_token", "credit_card_bandeira", "credit_card_ultimos4", "credit_card_atualizado_em"),
      UPDATE ("credit_card_token", "credit_card_bandeira", "credit_card_ultimos4", "credit_card_atualizado_em")
  ON "subscription" TO iris_auth;
