-- #36 (Fase 7) — recepção de webhook do Asaas para o Pix Automático.
--
-- Asaas reentrega evento em qualquer falha de rede ou 5xx, e reentrega é a
-- regra, não a exceção. Sem chave de deduplicação persistida, um retry vira
-- efeito duplicado em faturamento. O UNIQUE em `asaas_event_id` é a barreira:
-- a corrida entre duas entregas simultâneas do MESMO evento termina em
-- violação de unicidade, não em processamento duplo.
--
-- Guarda o payload bruto porque a apuração do valor cobrado ainda não existe
-- (depende da tabela `subscription`, #159): quando ela chegar, o histórico de
-- eventos já recebidos precisa poder ser reprocessado sem pedir reenvio ao
-- Asaas.
CREATE TABLE asaas_webhook_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asaas_event_id text NOT NULL UNIQUE,
  evento text NOT NULL,
  payload jsonb NOT NULL,
  processado_em timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX asaas_webhook_event_processado_idx
  ON asaas_webhook_event (processado_em);
--> statement-breakpoint

ALTER TABLE asaas_webhook_event ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE asaas_webhook_event FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Plano de BILLING/identidade, como auth_throttle (0061): só `iris_auth` toca.
-- `app_role` — a conexão que carrega dado de paciente via withTenant — não
-- recebe grant nenhum. O webhook não tem tenant (chega do Asaas, não de uma
-- sessão), então também não pode passar por withTenant; ele usa `authDb`.
GRANT SELECT, INSERT ON asaas_webhook_event TO iris_auth;
--> statement-breakpoint

CREATE POLICY asaas_webhook_event_auth_all ON asaas_webhook_event
  FOR ALL TO iris_auth USING (true) WITH CHECK (true);
