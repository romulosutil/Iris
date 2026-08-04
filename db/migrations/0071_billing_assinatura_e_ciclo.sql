-- #36 (Fase 7, Fatia B) — assinatura, ciclo de faturamento e apuração de
-- pacientes ativos. É a tabela `subscription` que a 0066 e o `src/lib/trial.ts`
-- declararam pendente: sem ela, o webhook não tem onde aplicar efeito e a faixa
-- de trial não sabe distinguir trial vencido de assinante pagante.
--
-- Modelo comercial (pay-as-you-grow por paciente ativo, faixas MARGINAIS):
-- 1..15 = R$ 39,00/paciente; 16..40 = R$ 32,00; 41+ = R$ 25,00. O valor NUNCA
-- é calculado em SQL — a fonte da verdade é `src/lib/billing/calculator.ts`,
-- em centavos inteiros. O banco guarda o resultado (`valor_centavos`) e o
-- memorial de quem foi contado (`billing_cycle_patient`), para que uma fatura
-- contestada seja auditável sem depender de recomputar com a tabela de preços
-- de hoje — preço muda, fatura emitida não.
--
-- Plano de privilégios: billing é plano de identidade, como `auth_throttle`
-- (0061) e `asaas_webhook_event` (0066). Escrita é exclusiva de `iris_auth`
-- (conexão `authDb`, sem GUC de tenant). `app_role` recebe apenas SELECT da
-- PRÓPRIA clínica, porque duas telas do produto precisam ler: o gate do 1º
-- paciente e o extrato de cobrança. Nenhum UPDATE/INSERT para `app_role` —
-- se o app pudesse escrever `subscription.status`, o gate de pagamento seria
-- contornável de dentro do produto.

CREATE TYPE subscription_status AS ENUM (
  'free_tier',
  'setup_pending',
  'active',
  'past_due',
  'canceled'
);
--> statement-breakpoint

CREATE TYPE billing_cycle_status AS ENUM (
  'aberto',
  'apurado',
  'cobrado',
  'falhou'
);
--> statement-breakpoint

-- Por que gravar o motivo: "20 pacientes" numa fatura contestada não se defende
-- sozinho. O motivo diz se a linha entrou por cadastro novo, por atendimento no
-- ciclo, ou por já estar ativa (não arquivada) desde antes.
CREATE TYPE billing_motivo_ativo AS ENUM (
  'criado_no_ciclo',
  'interacao_no_ciclo',
  'ativo_nao_arquivado'
);
--> statement-breakpoint

-- ==================== subscription ====================
-- 1:1 com `clinic` (UNIQUE em clinic_id). Uma clínica não tem duas assinaturas
-- simultâneas; renovação reusa a mesma linha e abre um `billing_cycle` novo.
CREATE TABLE subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL UNIQUE REFERENCES clinic (id) ON DELETE RESTRICT,
  status subscription_status NOT NULL DEFAULT 'free_tier',
  -- Qual gateway respondeu por esta assinatura. Persistido (em vez de lido de
  -- env) porque a migração de provedor é assunto aberto no projeto: a conta
  -- Asaas ficou bloqueada e o trilho passou a ser Mercado Pago. Assinatura
  -- criada num provedor não pode ser reinterpretada por outro só porque a env
  -- mudou depois.
  provider text NOT NULL DEFAULT 'mercado_pago',
  -- `preapproval_id` no Mercado Pago. UNIQUE: o webhook resolve a clínica por
  -- este id, e dois tenants apontando para a mesma assinatura no gateway seria
  -- cobrança cruzada.
  provider_subscription_id text UNIQUE,
  provider_customer_id text,
  metodo_pagamento text,
  ciclo_dias integer NOT NULL DEFAULT 30,
  ciclo_atual_inicio timestamptz,
  ciclo_atual_fim timestamptz,
  -- Carência antes de bloquear por inadimplência. Configurável por clínica
  -- porque falha de Pix Automático/cartão frequentemente é do banco do cliente,
  -- e derrubar acesso a prontuário por isso é dano desproporcional.
  carencia_dias integer NOT NULL DEFAULT 7,
  past_due_desde timestamptz,
  ativada_em timestamptz,
  cancelada_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscription_ciclo_valido
    CHECK (ciclo_atual_fim IS NULL OR ciclo_atual_inicio IS NULL
           OR ciclo_atual_fim > ciclo_atual_inicio),
  CONSTRAINT subscription_carencia_nao_negativa CHECK (carencia_dias >= 0),
  CONSTRAINT subscription_ciclo_dias_positivo CHECK (ciclo_dias > 0)
);
--> statement-breakpoint

-- O job de fechamento varre por data de fim de ciclo entre assinaturas ativas.
CREATE INDEX subscription_renovacao_idx
  ON subscription (status, ciclo_atual_fim);
--> statement-breakpoint

-- ==================== billing_cycle ====================
CREATE TABLE billing_cycle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinic (id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL REFERENCES subscription (id) ON DELETE RESTRICT,
  inicio timestamptz NOT NULL,
  fim timestamptz NOT NULL,
  status billing_cycle_status NOT NULL DEFAULT 'aberto',
  pacientes_contados integer NOT NULL DEFAULT 0,
  valor_centavos integer NOT NULL DEFAULT 0,
  apurado_em timestamptz,
  cobrado_em timestamptz,
  provider_charge_id text,
  erro text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_cycle_intervalo_valido CHECK (fim > inicio),
  CONSTRAINT billing_cycle_valor_nao_negativo CHECK (valor_centavos >= 0),
  CONSTRAINT billing_cycle_contagem_nao_negativa CHECK (pacientes_contados >= 0)
);
--> statement-breakpoint

-- "1 cobrança consolidada por mês" é regra de negócio; aqui ela vira barreira
-- física. Uma reexecução do job de fechamento (retry, entrega duplicada) não
-- consegue abrir um segundo ciclo com o mesmo início para a mesma clínica.
CREATE UNIQUE INDEX billing_cycle_clinic_inicio_uq
  ON billing_cycle (clinic_id, inicio);
--> statement-breakpoint

CREATE INDEX billing_cycle_clinic_fim_idx
  ON billing_cycle (clinic_id, fim DESC);
--> statement-breakpoint

-- ==================== billing_cycle_patient ====================
-- Memorial da fatura: quais pacientes únicos foram contados e por quê.
-- FK COMPOSTA para (patient.id, patient.clinic_id) — usa o unique
-- `uq_patient_id_clinic`. Impede que um ciclo da clínica A contabilize um
-- paciente da clínica B mesmo que alguém escreva direto pela role de billing.
--
-- ON DELETE CASCADE é deliberado: o expurgo LGPD (`app_purgar_paciente`) é
-- destrutivo, e manter o id de um paciente expurgado num log de billing
-- ressuscitaria o vínculo que o expurgo apagou. A prova do valor cobrado
-- sobrevive no agregado (`billing_cycle.pacientes_contados` / `valor_centavos`),
-- que não é apagado.
CREATE TABLE billing_cycle_patient (
  cycle_id uuid NOT NULL REFERENCES billing_cycle (id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  clinic_id uuid NOT NULL,
  motivo billing_motivo_ativo NOT NULL,
  registrado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cycle_id, patient_id),
  FOREIGN KEY (patient_id, clinic_id)
    REFERENCES patient (id, clinic_id) ON DELETE CASCADE
);
--> statement-breakpoint

CREATE INDEX billing_cycle_patient_clinic_idx
  ON billing_cycle_patient (clinic_id, cycle_id);
--> statement-breakpoint

-- ==================== mercadopago_webhook_event ====================
-- Espelha `asaas_webhook_event` (0066) e pela mesma razão: o Mercado Pago
-- reentrega notificação em qualquer 5xx ou timeout, e reentrega é a regra.
-- O UNIQUE é a barreira contra efeito duplicado em faturamento — a corrida
-- entre duas entregas do MESMO evento termina em violação de unicidade, não
-- em dois processamentos.
CREATE TABLE mercadopago_webhook_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_event_id text NOT NULL UNIQUE,
  evento text NOT NULL,
  payload jsonb NOT NULL,
  -- Aplicação do efeito é separada da recepção: o handler grava e responde 200
  -- rápido (o MP desabilita webhook que responde devagar). `aplicado_em` NULL
  -- com `processado_em` preenchido = recebido, efeito ainda não aplicado —
  -- reprocessável sem pedir reenvio.
  aplicado_em timestamptz,
  erro_aplicacao text,
  processado_em timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX mercadopago_webhook_event_processado_idx
  ON mercadopago_webhook_event (processado_em);
--> statement-breakpoint

CREATE INDEX mercadopago_webhook_event_pendente_idx
  ON mercadopago_webhook_event (processado_em)
  WHERE aplicado_em IS NULL;
--> statement-breakpoint

-- ==================== RLS ====================
ALTER TABLE subscription ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE subscription FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE billing_cycle ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE billing_cycle FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE billing_cycle_patient ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE billing_cycle_patient FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mercadopago_webhook_event ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mercadopago_webhook_event FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Leitura tenant-scoped para o produto. Espelha o predicado de `clinic_read`
-- (0002): a clínica corrente do GUC, nada além.
CREATE POLICY subscription_select ON subscription
  FOR SELECT TO app_role
  USING (clinic_id = current_setting('app.clinic_id', true)::uuid);
--> statement-breakpoint

CREATE POLICY billing_cycle_select ON billing_cycle
  FOR SELECT TO app_role
  USING (clinic_id = current_setting('app.clinic_id', true)::uuid);
--> statement-breakpoint

CREATE POLICY billing_cycle_patient_select ON billing_cycle_patient
  FOR SELECT TO app_role
  USING (clinic_id = current_setting('app.clinic_id', true)::uuid);
--> statement-breakpoint

-- `iris_auth` é o plano de billing: enxerga e escreve tudo, sem GUC de tenant
-- (o webhook chega do gateway, não de uma sessão — não passa por withTenant).
CREATE POLICY subscription_auth_all ON subscription
  FOR ALL TO iris_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY billing_cycle_auth_all ON billing_cycle
  FOR ALL TO iris_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY billing_cycle_patient_auth_all ON billing_cycle_patient
  FOR ALL TO iris_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY mercadopago_webhook_event_auth_all ON mercadopago_webhook_event
  FOR ALL TO iris_auth USING (true) WITH CHECK (true);
--> statement-breakpoint

-- ==================== GRANTs ====================
-- SELECT (sem UPDATE/INSERT/DELETE) para `app_role`: policy sozinha não
-- concede privilégio, e privilégio sem policy não lê. Precisa dos dois.
GRANT SELECT ON subscription TO app_role;
--> statement-breakpoint
GRANT SELECT ON billing_cycle TO app_role;
--> statement-breakpoint
GRANT SELECT ON billing_cycle_patient TO app_role;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON subscription TO iris_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON billing_cycle TO iris_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON billing_cycle_patient TO iris_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON mercadopago_webhook_event TO iris_auth;
--> statement-breakpoint

-- `iris_auth` precisa ler `patient` e `session` para apurar o ciclo, mas NÃO
-- ganha grant nessas tabelas: a apuração passa por `billing_apurar_ciclo`,
-- SECURITY DEFINER, abaixo. Assim a role de billing nunca consegue fazer um
-- `SELECT nome FROM patient` — ela só obtém contagem e ids.

-- ==================== billing_apurar_ciclo ====================
-- Apuração de pacientes ativos de UM ciclo. SECURITY DEFINER porque roda no
-- job de fechamento, que não tem tenant (não passa por withTenant) e portanto
-- não tem GUC para uma policy avaliar. Sendo DEFINER, o guard interno É a
-- fronteira: o `clinic_id` vem da PRÓPRIA linha de `billing_cycle`, nunca de
-- parâmetro, então não existe caminho para forjar tenant chamando a função.
--
-- Definição oficial de "paciente ativo no ciclo" (#36) — basta UM critério:
--   (a) criado dentro do ciclo;
--   (b) teve interação no ciclo (sessão agendada, check-in, evolução em
--       prontuário ou evidência registrada);
--   (c) está ativo comercialmente (`arquivado_em IS NULL`).
-- O (c) é o que faz a nota da regra fechar: paciente ARQUIVADO só entra se
-- teve (a) ou (b). Arquivado e parado no ciclo não é faturado.
--
-- Idempotente: apagar e reinserir o memorial dentro da mesma chamada faz um
-- retry do job convergir ao mesmo resultado, em vez de duplicar linhas.
-- Não calcula preço — devolve a contagem para a calculadora em TypeScript.
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
           WHEN EXISTS (
             SELECT 1 FROM session s
              WHERE s.patient_id = p.id
                AND (
                  (s.agendada_para >= v_inicio AND s.agendada_para < v_fim)
                  OR (s.check_in_em >= v_inicio AND s.check_in_em < v_fim)
                  OR (s.criado_em   >= v_inicio AND s.criado_em   < v_fim)
                )
           ) OR EXISTS (
             SELECT 1 FROM evidence e
              WHERE e.patient_id = p.id
                AND e.aprovado_em >= v_inicio AND e.aprovado_em < v_fim
           ) OR EXISTS (
             SELECT 1 FROM session_note sn
              JOIN session s2 ON s2.id = sn.session_id
              WHERE s2.patient_id = p.id
                AND sn.criado_em >= v_inicio AND sn.criado_em < v_fim
           )
             THEN 'interacao_no_ciclo'::billing_motivo_ativo
           ELSE 'ativo_nao_arquivado'::billing_motivo_ativo
         END
    FROM patient p
   WHERE p.clinic_id = v_clinic
     AND (
       p.arquivado_em IS NULL
       OR (p.criado_em >= v_inicio AND p.criado_em < v_fim)
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

-- ==================== app_assinatura_bloqueia_cadastro ====================
-- Gate do 1º paciente lido de dentro do produto (`app_role`, dentro de
-- withTenant). Retorna true quando a clínica NÃO pode cadastrar paciente.
--
-- Não é SECURITY DEFINER de propósito: lê `subscription` pela policy de SELECT
-- de `app_role`, que já é tenant-scoped. Clínica isenta (legado) nunca é
-- bloqueada. Ausência de linha em `subscription` = free_tier.
--
-- Este gate é a SEGUNDA barreira. A primeira é o TypeScript, que precisa do
-- checkout URL para responder ao usuário; esta existe para que um caminho de
-- escrita novo (import em lote, seed, action futura) não nasça furando a regra
-- em silêncio.
CREATE OR REPLACE FUNCTION app_assinatura_bloqueia_cadastro()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN (SELECT isento_trial FROM clinic
           WHERE id = current_setting('app.clinic_id', true)::uuid) THEN false
    ELSE COALESCE(
      (SELECT s.status IN ('setup_pending', 'canceled')
         FROM subscription s
        WHERE s.clinic_id = current_setting('app.clinic_id', true)::uuid),
      false)
  END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_assinatura_bloqueia_cadastro() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_assinatura_bloqueia_cadastro() TO app_role;
--> statement-breakpoint

-- Backfill: toda clínica existente entra em `free_tier`. Isento continua
-- isento — a linha existe para o join não precisar de LEFT JOIN, e `free_tier`
-- não bloqueia nada.
INSERT INTO subscription (clinic_id, status)
SELECT id, 'free_tier' FROM clinic
ON CONFLICT (clinic_id) DO NOTHING;
