-- #154 — retentativa limitada do e-mail ao RT: distingue falha transitória
-- (429/5xx do provedor, timeout de rede) de falha permanente (endereço
-- inválido), com teto de 3 tentativas antes de desistir. Sem isso, uma
-- indisponibilidade momentânea da Resend marcava o alerta como falhado
-- definitivo na 1ª tentativa e o RT nunca era avisado.
--
-- O marcador `_adiado` é deliberadamente distinto de `_enviado`/`_falhou`:
-- `app_alertas_estagio2_sem_email()` (migração 0056) só exclui alertas com
-- `_enviado` ou `_falhou`, então um alerta adiado continua elegível e a
-- reconciliação da próxima varredura o retenta sozinha — sem fila nova.
--
-- `deletado_em IS NULL` já está em app_rt_do_alerta e
-- app_alertas_estagio2_sem_email desde a 0056 — nada a fazer aqui.
--
-- GRANT: diferente de `patient` (0044) e `app_user`/`clinic` (0057), esta
-- tabela NÃO tem privilégio coluna a coluna — `\dp alerta_risco_clinico`
-- mostra `app_role=rw/iris` no nível de TABELA e a coluna "Column privileges"
-- vazia. Um UPDATE de tabela cobre colunas novas automaticamente, então
-- `email_rt_tentativas` não precisa de GRANT explícito. (E, de todo modo,
-- toda escrita nela passa pela função SECURITY DEFINER abaixo, cuja dona é
-- a role `iris`.)
--> statement-breakpoint

ALTER TABLE alerta_risco_clinico
  ADD COLUMN IF NOT EXISTS email_rt_tentativas integer NOT NULL DEFAULT 0;
--> statement-breakpoint

-- Assinatura de 4 args. `p_transitorio` só tem efeito enquanto houver
-- orçamento de tentativa: esgotado o teto, transitório vira permanente.
CREATE OR REPLACE FUNCTION app_registrar_email_rt(
  p_alerta      uuid,
  p_sucesso     boolean,
  p_transitorio boolean,
  p_detalhe     text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic     uuid;
  v_tentativas int;
  v_marcador   text;
BEGIN
  SELECT clinic_id, email_rt_tentativas INTO v_clinic, v_tentativas
    FROM alerta_risco_clinico WHERE id = p_alerta;
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'app_registrar_email_rt: alerta inexistente';
  END IF;

  IF p_sucesso THEN
    v_marcador := 'email_responsavel_tecnico_enviado';
  ELSIF p_transitorio AND v_tentativas < 2 THEN
    -- v_tentativas é o número de falhas JÁ gravadas. 0 e 1 ainda adiam;
    -- ao chegar em 2 a próxima falha é a 3ª e vira permanente.
    v_marcador := 'email_responsavel_tecnico_adiado';
  ELSE
    v_marcador := 'email_responsavel_tecnico_falhou';
  END IF;

  UPDATE alerta_risco_clinico
     SET canais_notificados = canais_notificados || to_jsonb(v_marcador::text),
         email_rt_tentativas = CASE WHEN p_sucesso THEN email_rt_tentativas
                                    ELSE email_rt_tentativas + 1 END,
         atualizado_em = now()
   WHERE id = p_alerta;

  INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
  VALUES (v_clinic, NULL, 'alerta_risco_email_rt', 'alerta_risco_clinico', p_alerta, NULL,
          jsonb_build_object('sucesso', p_sucesso, 'transitorio', p_transitorio, 'detalhe', p_detalhe));
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_registrar_email_rt(uuid, boolean, boolean, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_registrar_email_rt(uuid, boolean, boolean, text) TO iris_escalonamento;
--> statement-breakpoint

-- Assinatura antiga de 3 args some junto: conviver com as duas deixaria um
-- chamador desatualizado gravando falha permanente em silêncio.
DROP FUNCTION IF EXISTS app_registrar_email_rt(uuid, boolean, text);
