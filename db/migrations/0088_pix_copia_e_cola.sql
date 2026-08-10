-- Débito D21: `subscription.checkout_url` guardava duas coisas diferentes.
--
-- O Asaas não devolve URL de checkout para uma autorização de Pix Automático —
-- devolve o BR Code (copia-e-cola). Como a porta de billing só tinha
-- `checkoutUrl`, o adapter gravava o BR Code ali. O nome mentia: qualquer
-- leitor que confiasse nele renderizaria um link quebrado.
--
-- A partir daqui `checkout_url` só carrega URL, e o copia-e-cola tem coluna
-- própria. As duas são mutuamente exclusivas por construção (a forma vem do
-- provedor), e nenhuma das duas é obrigatória.
ALTER TABLE "subscription" ADD COLUMN "pix_copia_e_cola" text;--> statement-breakpoint

-- Backfill do que o adapter do Asaas já pode ter gravado no lugar errado.
-- O filtro é a forma do dado, não o provedor: um BR Code do Pix começa com
-- `000201` (payload format indicator do EMV), nunca com `http`. Hoje o trilho
-- ativo é o Mercado Pago e o esperado é 0 linha — o UPDATE existe para que uma
-- base que já tenha rodado Asaas não fique com dado mentindo na coluna errada.
UPDATE "subscription"
SET "pix_copia_e_cola" = "checkout_url",
    "checkout_url" = NULL
WHERE "checkout_url" IS NOT NULL
  AND "checkout_url" NOT LIKE 'http%';--> statement-breakpoint

-- Coluna nova em tabela cujo privilégio é de tabela (0071/0075), não coluna a
-- coluna — o GRANT é redundante hoje, e explícito para o dia em que alguém
-- revogar no nível de tabela e passar a granular (armadilha registrada no
-- CLAUDE.md, §Migrações item 4).
GRANT SELECT ("pix_copia_e_cola") ON "subscription" TO app_role;--> statement-breakpoint
GRANT SELECT ("pix_copia_e_cola"), INSERT ("pix_copia_e_cola"), UPDATE ("pix_copia_e_cola") ON "subscription" TO iris_auth;
