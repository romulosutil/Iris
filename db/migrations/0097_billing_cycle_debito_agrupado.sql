-- 0097 — `billing_cycle.debito_agrupado_em`: uma cobrança que cobre N ciclos
-- devidos (#290, gate de débito na reativação).
--
-- ## O problema que esta coluna resolve
--
-- A `0096` criou `devido`: o ciclo interrompido pelo cancelamento, congelado em
-- pro-rata e SEM cobrança emitida. Quem cobra é o gate de reativação — pagar o
-- que se deve é a porta de entrada de volta.
--
-- Só que o débito pode ser mais de um ciclo. A #290 decidiu que débito abaixo do
-- piso de cobrança do gateway **acumula** (não caduca, não é perdoado e não
-- trava a reativação): a clínica que cancela no dia 2 deve ~R$ 2,60, volta sem
-- pagar porque nenhum gateway emite cobrança tão pequena, e o débito espera o
-- próximo cancelamento para ser cobrado somado.
--
-- Cobrar isso como N cobranças seria N QR Codes na tela para a mesma dívida. E
-- gravar o MESMO `provider_charge_id` nas N linhas é impossível: a `0075` criou
-- `billing_cycle_provider_charge_idx`, UNIQUE parcial sobre `provider_charge_id`
-- — que é justamente a guarda de idempotência da emissão, e não se abre mão dela
-- para caber um agrupamento.
--
-- ## O desenho: âncora
--
-- Uma cobrança só, do total, gravada em `provider_charge_id` do ciclo `devido`
-- MAIS ANTIGO (a âncora). Os demais apontam para a âncora por esta coluna e são
-- liquidados junto quando o webhook confirma o pagamento dela.
--
-- Âncora = mais antiga, e não mais recente, por DETERMINISMO: a mesma entrada
-- elege sempre a mesma âncora, então a reentrada do gate encontra a cobrança já
-- emitida (`externalReference = 'debito:<ancora>'`) em vez de eleger outro ciclo
-- e emitir uma segunda cobrança da mesma dívida.
--
-- ## Por que não uma tabela `billing_debito`
--
-- O débito já está modelado: é a soma dos ciclos em `devido`. Uma entidade
-- paralela duplicaria a fonte da verdade do valor e do memorial
-- (`pacientes_contados`, `inicio`, `fim`) que a `0096` acabou de consolidar na
-- linha do ciclo — e valor de cobrança em dois lugares é valor que descola.
--
-- ## Notas de execução
--
-- `ON DELETE SET NULL`, e não `CASCADE`: apagar um ciclo jamais pode apagar
-- outro. (Na prática nada apaga `billing_cycle`; a FK para `clinic` é
-- `restrict`.)
--
-- GRANT: `billing_cycle` tem grant de TABELA para `iris_auth` (`0071:244`,
-- `0075:67`), não coluna a coluna — a coluna nova já entra coberta. `app_role`
-- tem SELECT na tabela, com a policy `billing_cycle_select` resolvendo o tenant
-- pelo helper (`0085`). Nada novo a conceder, e nenhuma policy a mexer.
ALTER TABLE "billing_cycle" ADD COLUMN "debito_agrupado_em" uuid;--> statement-breakpoint
ALTER TABLE "billing_cycle" ADD CONSTRAINT "billing_cycle_debito_agrupado_em_fk" FOREIGN KEY ("debito_agrupado_em") REFERENCES "public"."billing_cycle"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_cycle_debito_agrupado_idx" ON "billing_cycle" USING btree ("debito_agrupado_em");--> statement-breakpoint
-- Um ciclo não pode ser a própria âncora: `debito_agrupado_em` significa "meu
-- débito foi cobrado JUNTO COM o da linha X", e a autorreferência faria a
-- liquidação em cascata do webhook morder o próprio rabo.
ALTER TABLE "billing_cycle" ADD CONSTRAINT "billing_cycle_debito_agrupado_nao_reflexivo" CHECK ("billing_cycle"."debito_agrupado_em" IS NULL OR "billing_cycle"."debito_agrupado_em" <> "billing_cycle"."id");--> statement-breakpoint

COMMENT ON COLUMN "billing_cycle"."debito_agrupado_em" IS
  'Âncora do agrupamento de débito (#290): o débito desta linha foi cobrado junto com o do ciclo apontado, que é quem carrega `provider_charge_id`. NULL no ciclo normal e na própria âncora.';
