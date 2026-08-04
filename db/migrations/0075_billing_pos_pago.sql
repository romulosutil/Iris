-- ============================================================================
-- 0075 — Trilho de cobrança pós-pago + critério de faturamento "criou ou
--        interagiu" (#163 + #159)
-- ============================================================================
--
-- ## Parte 1 — o trilho vira pós-pago de verdade
--
-- O schema da 0071 JÁ tinha sido desenhado para isto: `billing_cycle_status`
-- tem o valor `apurado` (que o código nunca produzia) e
-- `billing_cycle.provider_charge_id` estava previsto e nunca foi preenchido. A
-- implementação é que cortou caminho e ficou pré-paga:
--
--   • a ativação criava um preapproval de valor FIXO (1 paciente = R$ 39) —
--     ou seja, cobrava antes de o ciclo existir;
--   • o fechamento só ajustava o valor da PRÓXIMA cobrança do gateway, que o
--     Mercado Pago gera com muita antecedência, com o valor velho;
--   • o ciclo era marcado `cobrado` + `cobrado_em` no instante do ajuste, sem
--     que nenhuma cobrança tivesse sido emitida ou confirmada. O `billing_cycle`
--     é o memorial auditável da fatura e afirmava um fato que não aconteceu.
--
-- O fluxo passa a ser: apurar → emitir cobrança avulsa → gravar
-- `provider_charge_id` → aguardar → `pago` só pelo webhook.
--
-- ## Parte 2 — o critério de faturamento perde o (c)
--
-- Havia TRÊS definições incompatíveis em produção (a função aqui, o FAQ público
-- e a query de MRR do backoffice). A decidida é: fatura-se quem foi
-- (a) cadastrado no ciclo OU (b) teve interação registrada nele. O critério
-- (c) "não arquivado" SAI.
--
-- Consequência aceita conscientemente: clínica em recesso paga R$ 0 — mês sem
-- sessão, check-in, evolução ou cadastro novo zera a fatura, mesmo com 40
-- pacientes na base. É mais generoso que a regra publicada hoje, e o texto
-- público precisa ser reescrito junto (foi, nesta mesma entrega).

-- ==================== Novos estados de ciclo ====================
-- `cobrado` fica como valor LEGADO: há memorial de fatura gravado com ele e
-- reescrever o passado apagaria o registro de por que alguém foi cobrado.
-- A partir daqui o fluxo usa `apurado → aguardando_pagamento → pago | falhou`.
ALTER TYPE billing_cycle_status ADD VALUE IF NOT EXISTS 'aguardando_pagamento';
--> statement-breakpoint
ALTER TYPE billing_cycle_status ADD VALUE IF NOT EXISTS 'pago';
--> statement-breakpoint

-- ==================== Colunas da cobrança avulsa ====================
-- `provider_charge_id` é o que permite RECONCILIAR: o webhook chega falando de
-- uma cobrança, não de uma assinatura, e hoje não há como saber a que ciclo ela
-- pertence. O UNIQUE parcial é a guarda de idempotência da emissão.
ALTER TABLE billing_cycle ADD COLUMN IF NOT EXISTS provider_charge_id text;
--> statement-breakpoint
ALTER TABLE billing_cycle ADD COLUMN IF NOT EXISTS cobranca_emitida_em timestamptz;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS billing_cycle_provider_charge_idx
  ON billing_cycle (provider_charge_id) WHERE provider_charge_id IS NOT NULL;
--> statement-breakpoint

-- `provider_customer_id` volta a significar "cliente no gateway". Estava sendo
-- usado como cache da URL de checkout (com comentário no código assumindo o
-- desvio) — o cache ganha coluna própria, e o campo volta ao nome que tem.
ALTER TABLE subscription ADD COLUMN IF NOT EXISTS checkout_url text;
--> statement-breakpoint
UPDATE subscription
   SET checkout_url = provider_customer_id, provider_customer_id = NULL
 WHERE provider_customer_id LIKE 'http%';
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON billing_cycle TO iris_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON subscription TO iris_auth;
--> statement-breakpoint

-- ==================== billing_apurar_ciclo — critério (a) ou (b) ====================
-- Substitui a versão da 0071. Muda SÓ o critério; o resto (SECURITY DEFINER, o
-- `clinic_id` vindo da própria linha de `billing_cycle` e nunca de parâmetro, a
-- idempotência do delete-and-reinsert) é preservado intacto — ver o comentário
-- longo da 0071 para o porquê de cada um.
--
-- O valor `ativo_nao_arquivado` do enum `billing_motivo_ativo` deixa de ser
-- PRODUZIDO, mas o enum NÃO muda: `billing_cycle_patient.motivo` é memorial de
-- fatura emitida, e renomear/remover reescreveria retroativamente o registro de
-- por que alguém foi cobrado.
CREATE OR REPLACE FUNCTION billing_apurar_ciclo(p_cycle_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic uuid;
  v_inicio timestamptz;
  v_fim timestamptz;
  v_total integer;
BEGIN
  SELECT clinic_id, inicio, fim INTO v_clinic, v_inicio, v_fim
    FROM billing_cycle WHERE id = p_cycle_id;

  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'billing_apurar_ciclo: ciclo % inexistente', p_cycle_id;
  END IF;

  DELETE FROM billing_cycle_patient WHERE cycle_id = p_cycle_id;

  INSERT INTO billing_cycle_patient (cycle_id, patient_id, clinic_id, motivo)
  SELECT p_cycle_id, p.id, p.clinic_id,
         CASE
           WHEN p.criado_em >= v_inicio AND p.criado_em < v_fim
             THEN 'criado_no_ciclo'::billing_motivo_ativo
           ELSE 'interacao_no_ciclo'::billing_motivo_ativo
         END
    FROM patient p
   WHERE p.clinic_id = v_clinic
     AND (
       (p.criado_em >= v_inicio AND p.criado_em < v_fim)
       OR EXISTS (
         SELECT 1 FROM session s
          WHERE s.patient_id = p.id
            AND (
              (s.agendada_para >= v_inicio AND s.agendada_para < v_fim)
              OR (s.check_in_em >= v_inicio AND s.check_in_em < v_fim)
              OR (s.criado_em   >= v_inicio AND s.criado_em   < v_fim)
            )
       )
       OR EXISTS (
         SELECT 1 FROM evidence e
          WHERE e.patient_id = p.id
            AND e.aprovado_em >= v_inicio AND e.aprovado_em < v_fim
       )
       OR EXISTS (
         SELECT 1 FROM session_note sn
          JOIN session s2 ON s2.id = sn.session_id
          WHERE s2.patient_id = p.id
            AND sn.criado_em >= v_inicio AND sn.criado_em < v_fim
       )
     );

  SELECT count(*) INTO v_total
    FROM billing_cycle_patient WHERE cycle_id = p_cycle_id;

  UPDATE billing_cycle
     SET pacientes_contados = v_total,
         apurado_em = now(),
         status = 'apurado'
   WHERE id = p_cycle_id;

  RETURN v_total;
END; $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION billing_apurar_ciclo(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION billing_apurar_ciclo(uuid) TO iris_auth;
--> statement-breakpoint

COMMENT ON COLUMN billing_cycle_patient.motivo IS
  'Memorial: POR QUE este paciente entrou na fatura deste ciclo. A partir da 0075 só dois valores são produzidos — criado_no_ciclo e interacao_no_ciclo. `ativo_nao_arquivado` permanece no enum como registro histórico das faturas emitidas sob o critério antigo (#163).';
