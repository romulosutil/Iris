-- #126 — E-mail Resend pro responsável técnico (RT) no estágio 2 do alerta de
-- risco (§4.2.1, ação 2). Motor de escalonamento (#122/0049) já cobre banner,
-- protocolo interno e log imutável — falta só o e-mail.
--
-- REGRA DE OURO (§4.2.1): as 3 funções abaixo NUNCA devolvem ou registram
-- destinatário fora do tenant do alerta, e nunca conteúdo clínico (trecho,
-- categoria, nome de paciente) no corpo de e-mail ou na trilha.
--> statement-breakpoint

-- ── RT do alerta (só em estágio 2, só se o RT ainda tiver papel vigente) ────
-- SECURITY DEFINER: iris_escalonamento não tem SELECT em clinic/app_user/
-- user_role (só EXECUTE nesta função). Guard interno confere estágio e
-- vigência do papel — não confia em o alerta já ter sido validado alhures.
CREATE OR REPLACE FUNCTION app_rt_do_alerta(p_alerta uuid)
RETURNS TABLE (rt_email text, rt_nome text)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT u.email, u.name
    FROM alerta_risco_clinico a
    JOIN clinic c ON c.id = a.clinic_id
    JOIN app_user u ON u.id = c.responsavel_tecnico_id
   WHERE a.id = p_alerta
     AND a.status = 'escalado_estagio_2'
     AND a.deletado_em IS NULL
     AND EXISTS (
       SELECT 1 FROM user_role ur
        WHERE ur.user_id = u.id AND ur.clinic_id = c.id
     );
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_rt_do_alerta(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_rt_do_alerta(uuid) TO iris_escalonamento;
--> statement-breakpoint

-- ── Registro do envio (sempre chamado, sucesso ou falha) ────────────────────
-- "Nunca falhar em silêncio" (#108): `p_detalhe` guarda só message-id do
-- provedor ou string de erro do SDK — nunca corpo do e-mail nem dado clínico.
CREATE OR REPLACE FUNCTION app_registrar_email_rt(
  p_alerta  uuid,
  p_sucesso boolean,
  p_detalhe text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_marcador text := CASE WHEN p_sucesso
    THEN 'email_responsavel_tecnico_enviado'
    ELSE 'email_responsavel_tecnico_falhou' END;
  v_clinic uuid;
BEGIN
  SELECT clinic_id INTO v_clinic FROM alerta_risco_clinico WHERE id = p_alerta;
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'app_registrar_email_rt: alerta inexistente';
  END IF;

  UPDATE alerta_risco_clinico
     SET canais_notificados = canais_notificados || to_jsonb(v_marcador::text),
         atualizado_em = now()
   WHERE id = p_alerta;

  INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
  VALUES (v_clinic, NULL, 'alerta_risco_email_rt', 'alerta_risco_clinico', p_alerta, NULL,
          jsonb_build_object('sucesso', p_sucesso, 'detalhe', p_detalhe));
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_registrar_email_rt(uuid, boolean, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_registrar_email_rt(uuid, boolean, text) TO iris_escalonamento;
--> statement-breakpoint

-- ── Reconciliação (gap fora do Apêndice A original) ─────────────────────────
-- Cobre crash entre a transição pro estágio 2 e o envio do e-mail:
-- `app_escalonar_risco_vencidos()` só devolve o alerta na varredura em que ele
-- TRANSICIONA — uma varredura seguinte não o re-emite. Sem isto, um processo
-- morto entre as duas etapas perde o e-mail em silêncio (mesma classe de bug
-- da #108). Roda a cada varredura, além dos recém-escalados.
CREATE OR REPLACE FUNCTION app_alertas_estagio2_sem_email()
RETURNS TABLE (alerta_id uuid)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT a.id
    FROM alerta_risco_clinico a
   WHERE a.status = 'escalado_estagio_2'
     AND a.deletado_em IS NULL
     AND NOT (
       a.canais_notificados @> '["email_responsavel_tecnico_enviado"]'::jsonb
       OR a.canais_notificados @> '["email_responsavel_tecnico_falhou"]'::jsonb
     );
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_alertas_estagio2_sem_email() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_alertas_estagio2_sem_email() TO iris_escalonamento;
