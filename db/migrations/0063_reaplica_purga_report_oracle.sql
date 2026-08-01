-- #165 (reabre) — Reaplica a correção do oráculo cross-tenant de app_purgar_report.
--
-- A migração 0055_fix_purga_report_oracle.sql foi registrada no _journal.json
-- (commit f55a696) com `when = 1785421565500`, valor MENOR que o `when` da 0056
-- (1785421566000), que já estava aplicada em todo banco. O drizzle só aplica
-- migrações com `when` maior que o último aplicado — então a 0055 é pulada em
-- SILÊNCIO, para sempre, em qualquer banco que já esteja em 0056+. Medido no
-- Postgres local: `drizzle.__drizzle_migrations` tem 1785421565000 e
-- 1785421566000, e NÃO tem 1785421565500.
--
-- Consequência viva: `app_purgar_report` continua com o corpo antigo, que
-- distingue "report inexistente" de "report de outra clínica" — o oráculo de
-- existência cross-tenant que a #128/#165 fecharam no papel.
--
-- Correção: mesma função, num arquivo novo com `when` maior que o máximo
-- aplicado (1785421572000 + 1000). A 0055 permanece no journal como registro
-- histórico; não é reescrita.
CREATE OR REPLACE FUNCTION app_purgar_report(p_report uuid, p_motivo text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_patient uuid; v_clinic uuid; v_hash text;
BEGIN
  IF current_setting('app.user_role') <> 'coordenador' THEN
    RAISE EXCEPTION 'app_purgar_report: só coordenador purga (papel atual %)', current_setting('app.user_role');
  END IF;
  SELECT patient_id, clinic_id, pdf_hash INTO v_patient, v_clinic, v_hash FROM report WHERE id = p_report;
  -- Mensagem ÚNICA: "não encontrado" cobre inexistente E fora da clínica. É o
  -- que impede a função de virar oráculo de existência de report_id entre tenants.
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
