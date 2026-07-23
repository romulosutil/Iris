-- Fase 6.3 — Retenção & Expurgo (LGPD). Espelha o padrão log-antes-delete de
-- `app_purgar_report` (0040), estendido para o erasure completo do paciente.
-- `clinic.politica_retencao_meses` já existe (0000) — aqui só é consumida.
--> statement-breakpoint
-- Fonte da regra de retenção: data de alta clínica do paciente (nullable —
-- paciente em acompanhamento nunca é elegível a expurgo). Aditivo/reversível.
ALTER TABLE patient ADD COLUMN alta_em date;
--> statement-breakpoint
-- Elegibilidade de expurgo (R6.3.3). Retenção mínima legal = MAX(paciente
-- completa 18 anos, alta + 10 anos). A clínica só pode ESTENDER via
-- politica_retencao_meses (nunca encurtar). Sem alta/sem nascimento → NULL/false
-- (conservador: não expurga o que não dá para comprovar).
CREATE OR REPLACE FUNCTION app_paciente_expurgavel(p_patient uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.alta_em IS NOT NULL
    AND p.nascimento IS NOT NULL
    AND now() >= GREATEST(
      (p.nascimento + INTERVAL '18 years'),
      (p.alta_em + GREATEST(INTERVAL '10 years',
                            make_interval(months => COALESCE(c.politica_retencao_meses, 0))))
    )
  FROM patient p JOIN clinic c ON c.id = p.clinic_id
  WHERE p.id = p_patient;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_paciente_expurgavel(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_paciente_expurgavel(uuid) TO app_role;
--> statement-breakpoint
-- Expurgo rastreado do paciente (erasure LGPD). Só coordenador da clínica.
-- Ordem: (1) trilha do fato; (2) pseudonimiza a trilha histórica do sujeito
-- (A3/R6.3.2 — mantém compliance sem PII, e quebra a FK audit_log→patient antes
-- do delete); (3) erasure físico leaf-first dos descendentes (FKs restrict/
-- no-action que bloqueariam um DELETE ingênuo); (4) o paciente.
-- SECURITY DEFINER: roda como o dono (BYPASSRLS), único caminho autorizado a
-- dar UPDATE em audit_log (imutável para app_role via REVOKE UPDATE em 0039).
CREATE OR REPLACE FUNCTION app_purgar_paciente(p_patient uuid, p_motivo text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clinic uuid;
BEGIN
  IF current_setting('app.user_role') <> 'coordenador' THEN
    RAISE EXCEPTION 'app_purgar_paciente: só coordenador purga (papel atual %)', current_setting('app.user_role');
  END IF;
  SELECT clinic_id INTO v_clinic FROM patient WHERE id = p_patient;
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'app_purgar_paciente: paciente % inexistente', p_patient;
  END IF;
  IF NOT app_patient_in_clinic(p_patient) THEN
    RAISE EXCEPTION 'app_purgar_paciente: paciente % fora da clínica do chamador', p_patient;
  END IF;

  -- 1) trilha PRIMEIRO — linha-fato já pseudônima (patient_id NULL;
  --    entidade_id = uuid interno como âncora; entidade_id sem FK → sobrevive).
  INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
  VALUES (v_clinic, current_setting('app.user_id')::uuid, 'paciente_purgado', 'patient', p_patient, NULL,
          jsonb_build_object('motivo', p_motivo, 'pseudonimizado', true));

  -- 2) pseudonimiza a trilha histórica do sujeito: remove PII, mantém o fato
  --    (acao/clinic/ator/timestamp) e neutraliza a FK patient_id.
  UPDATE audit_log
     SET patient_id = NULL,
         detalhe = jsonb_build_object('pseudonimizado', true, 'motivo_expurgo', p_motivo)
   WHERE patient_id = p_patient;

  -- 3) erasure físico, leaf-first (ordem derivada do grafo FK completo).
  DELETE FROM evidence_query      WHERE evidence_id IN (SELECT id FROM evidence WHERE patient_id = p_patient);
  DELETE FROM evidence_revision   WHERE evidence_id IN (SELECT id FROM evidence WHERE patient_id = p_patient);
  DELETE FROM evidence            WHERE patient_id = p_patient;
  DELETE FROM reinforcer_profile  WHERE patient_id = p_patient;
  DELETE FROM session_snapshot    WHERE patient_id = p_patient;
  DELETE FROM report_pdf          WHERE report_id IN (SELECT id FROM report WHERE patient_id = p_patient);
  DELETE FROM report              WHERE patient_id = p_patient;
  DELETE FROM session_note        WHERE session_id IN (SELECT id FROM session WHERE patient_id = p_patient);
  DELETE FROM session_protocol_scope WHERE session_id IN (SELECT id FROM session WHERE patient_id = p_patient);
  DELETE FROM audio_capture       WHERE session_id IN (SELECT id FROM session WHERE patient_id = p_patient);
  DELETE FROM extraction          WHERE session_id IN (SELECT id FROM session WHERE patient_id = p_patient);
  DELETE FROM goal_milestone_mapping WHERE goal_id IN (SELECT id FROM goal WHERE patient_id = p_patient);
  DELETE FROM goal_candidacy      WHERE goal_id IN (SELECT id FROM goal WHERE patient_id = p_patient);
  DELETE FROM alerta              WHERE patient_id = p_patient;
  DELETE FROM goal                WHERE patient_id = p_patient;
  DELETE FROM session             WHERE patient_id = p_patient;
  DELETE FROM agendamento_recorrente WHERE patient_id = p_patient;
  DELETE FROM patient_alvo_disciplina WHERE patient_id = p_patient;
  DELETE FROM bloqueio            WHERE patient_id = p_patient;
  DELETE FROM consent             WHERE patient_id = p_patient;
  DELETE FROM patient_protocol    WHERE patient_id = p_patient;
  DELETE FROM care_team_membership WHERE patient_id = p_patient;
  DELETE FROM milestone_candidacy WHERE patient_id = p_patient;
  DELETE FROM patient_clinical_profile WHERE patient_id = p_patient;

  -- 4) raiz
  DELETE FROM patient WHERE id = p_patient;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_purgar_paciente(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_purgar_paciente(uuid, text) TO app_role;
