-- #128 — Correção do oráculo de existência cross-tenant em app_purgar_report
--
-- Unifica as mensagens de exceção para "inexistente" e "fora da clínica",
-- retornando a mensagem genérica 'app_purgar_report: report % não encontrado' em ambos os casos.
-- Isso elimina o oráculo side-channel de existência de report_id entre clínicas.

CREATE OR REPLACE FUNCTION app_purgar_report(p_report uuid, p_motivo text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_patient uuid; v_clinic uuid; v_hash text;
BEGIN
  IF current_setting('app.user_role') <> 'coordenador' THEN
    RAISE EXCEPTION 'app_purgar_report: só coordenador purga (papel atual %)', current_setting('app.user_role');
  END IF;
  SELECT patient_id, clinic_id, pdf_hash INTO v_patient, v_clinic, v_hash FROM report WHERE id = p_report;
  IF v_patient IS NULL OR NOT app_patient_in_clinic(v_patient) THEN
    RAISE EXCEPTION 'app_purgar_report: report % não encontrado', p_report;
  END IF;
  -- 1) trilha PRIMEIRO (entidade_id sem FK → sobrevive ao delete)
  INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
  VALUES (v_clinic, current_setting('app.user_id')::uuid, 'relatorio_purgado', 'report', p_report, v_patient,
          jsonb_build_object('motivo', p_motivo, 'hash', v_hash));
  -- 2) delete físico (cascata remove report_pdf)
  DELETE FROM report WHERE id = p_report;
END;
$$;
