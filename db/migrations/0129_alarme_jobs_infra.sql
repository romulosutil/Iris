-- 0129_alarme_jobs_infra.sql
-- Role e funções de leitura do detector de alarme automático (#294).
--
-- POR QUE FUNÇÃO SECURITY DEFINER, E NÃO `GRANT SELECT` NA TABELA:
-- billing_cycle (0071) e alerta_risco_clinico (0049) estão sob FORCE ROW LEVEL
-- SECURITY, e as policies de leitura são TO app_role / TO iris_auth. Um GRANT
-- de tabela para uma role nova não bate em policy nenhuma e devolve ZERO
-- LINHAS SEM ERRO — o detector reportaria "tudo ok" para sempre. Um alarme
-- que nunca dispara é pior que não ter alarme, porque cria a crença de que
-- alguém está olhando. Mesmo padrão já usado por iris_escalonamento (0049),
-- iris_arquivamento (0080) e iris_retencao: a role só ganha EXECUTE.
--
-- POR QUE O RETORNO É AGREGADO, E NÃO A LINHA INTEIRA: o corpo do e-mail de
-- alarme não pode carregar dado clínico (§4.2.1). Contagem + clinic_id +
-- timestamp é o suficiente para o Rômulo saber onde olhar, e é o teto do que
-- uma credencial vazada deste serviço conseguiria extrair.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iris_alarme') THEN
    CREATE ROLE iris_alarme NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;
--> statement-breakpoint

-- NOLOGIN: a role de login é criada fora das migrações, IN ROLE iris_alarme
-- (mesmo padrão de iris_retencao na 0121 e iris_arquivamento na 0080).
GRANT USAGE ON SCHEMA public TO iris_alarme;
--> statement-breakpoint

-- Ciclo de faturamento que passou do `fim` e continua `aberto`: o job de
-- fechamento (iris-billing) não rodou. O parâmetro é a folga tolerada — o
-- script passa 2h, mas quem chama decide, para o runbook poder investigar com
-- outra régua sem migração nova.
CREATE OR REPLACE FUNCTION public.app_alarme_billing_atrasado(p_folga interval)
RETURNS TABLE (
  total               integer,
  primeira_clinic_id  uuid,
  primeiro_vencimento timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT count(*)::integer FROM billing_cycle WHERE status = 'aberto' AND fim <= now() - p_folga),
    (SELECT clinic_id FROM billing_cycle WHERE status = 'aberto' AND fim <= now() - p_folga ORDER BY fim ASC LIMIT 1),
    (SELECT fim FROM billing_cycle WHERE status = 'aberto' AND fim <= now() - p_folga ORDER BY fim ASC LIMIT 1);
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_alarme_billing_atrasado(interval) FROM PUBLIC;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.app_alarme_billing_atrasado(interval) TO iris_alarme;
--> statement-breakpoint

-- Alerta de risco clínico cujo prazo de reconhecimento venceu e que continua
-- `aberto`: o motor de escalonamento (iris-escalonamento) não rodou. O nome do
-- paciente e o trecho de risco NÃO saem daqui — só contagem, clínica e prazo.
CREATE OR REPLACE FUNCTION public.app_alarme_escalonamento_atrasado(p_folga interval)
RETURNS TABLE (
  total               integer,
  primeira_clinic_id  uuid,
  primeiro_vencimento timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT count(*)::integer FROM alerta_risco_clinico WHERE status = 'aberto' AND prazo_reconhecimento <= now() - p_folga),
    (SELECT clinic_id FROM alerta_risco_clinico WHERE status = 'aberto' AND prazo_reconhecimento <= now() - p_folga ORDER BY prazo_reconhecimento ASC LIMIT 1),
    (SELECT prazo_reconhecimento FROM alerta_risco_clinico WHERE status = 'aberto' AND prazo_reconhecimento <= now() - p_folga ORDER BY prazo_reconhecimento ASC LIMIT 1);
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_alarme_escalonamento_atrasado(interval) FROM PUBLIC;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.app_alarme_escalonamento_atrasado(interval) TO iris_alarme;
