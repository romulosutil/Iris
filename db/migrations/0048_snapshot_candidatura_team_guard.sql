-- Fase 6 / triagem #64 (Etapa 2) — fecha o único débito RLS confirmado.
--
-- `app_aplicar_snapshot` e `app_aplicar_candidatura` (0017) são SECURITY
-- DEFINER e bypassam RLS, então o guard interno É a fronteira de autorização.
-- Ambas checavam só `app_patient_in_clinic` (tenancy de clínica), mas a leitura
-- correspondente (`session_snapshot_select`/`milestone_candidacy_select`, 0016/
-- 0006) gateia por EQUIPE: `coordenador OR app_is_on_team(patient)`. O próprio
-- comentário da snapshot afirmava paridade com a leitura que não tinha — logo um
-- terapeuta fora da equipe do paciente (mas na mesma clínica) podia materializar
-- snapshot/candidatura. Intra-clínica (não cross-tenant), mas divergente da
-- intenção documentada. Aqui adicionamos o mesmo predicado de equipe da leitura,
-- preservando `coordenador` (que vê/escreve toda a clínica). Guard de clínica
-- mantido (defesa em profundidade + mensagem específica).

-- ==================== app_aplicar_snapshot ====================
CREATE OR REPLACE FUNCTION app_aplicar_snapshot(
  p_patient uuid,
  p_numero int,
  p_repertorio jsonb,
  p_segmentacao jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_patient::text, 0));

  IF NOT app_patient_in_clinic(p_patient) THEN
    RAISE EXCEPTION 'app_aplicar_snapshot: paciente % fora da clínica do chamador (isolamento multi-tenant)', p_patient;
  END IF;

  -- Paridade com session_snapshot_select (0016): coordenador escreve toda a
  -- clínica; terapeuta só paciente da própria equipe vigente.
  IF NOT (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(p_patient)) THEN
    RAISE EXCEPTION 'app_aplicar_snapshot: paciente % fora da equipe do chamador (autorização cross-team)', p_patient;
  END IF;

  INSERT INTO session_snapshot (patient_id, session_numero, repertorio_state, segmentacao, gerado_em)
  VALUES (p_patient, p_numero, p_repertorio, p_segmentacao, now())
  ON CONFLICT (patient_id, session_numero)
  DO UPDATE SET
    repertorio_state = EXCLUDED.repertorio_state,
    segmentacao = EXCLUDED.segmentacao,
    gerado_em = now();
END; $$;
--> statement-breakpoint

-- ==================== app_aplicar_candidatura ====================
CREATE OR REPLACE FUNCTION app_aplicar_candidatura(
  p_patient uuid,
  p_milestone uuid,
  p_goal uuid,
  p_is_candidate boolean,
  p_candidacy_since timestamptz,
  p_evidence_count int,
  p_distinct_sessions int
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_patient::text, 0));

  IF NOT app_patient_in_clinic(p_patient) THEN
    RAISE EXCEPTION 'app_aplicar_candidatura: paciente % fora da clínica do chamador (isolamento multi-tenant)', p_patient;
  END IF;

  -- Paridade com milestone_candidacy_select (0006): mesma fronteira de equipe.
  IF NOT (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(p_patient)) THEN
    RAISE EXCEPTION 'app_aplicar_candidatura: paciente % fora da equipe do chamador (autorização cross-team)', p_patient;
  END IF;

  IF p_goal IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM goal WHERE id = p_goal AND patient_id = p_patient
  ) THEN
    RAISE EXCEPTION 'app_aplicar_candidatura: meta % nao pertence ao paciente % (isolamento violado)', p_goal, p_patient;
  END IF;

  IF p_milestone IS NOT NULL THEN
    INSERT INTO milestone_candidacy (
      patient_id, milestone_id, is_candidate, candidacy_since, evidence_count, distinct_sessions
    )
    VALUES (p_patient, p_milestone, p_is_candidate, p_candidacy_since, p_evidence_count, p_distinct_sessions)
    ON CONFLICT (patient_id, milestone_id)
    DO UPDATE SET
      is_candidate = EXCLUDED.is_candidate,
      candidacy_since = EXCLUDED.candidacy_since,
      evidence_count = EXCLUDED.evidence_count,
      distinct_sessions = EXCLUDED.distinct_sessions;
  END IF;

  IF p_goal IS NOT NULL THEN
    INSERT INTO goal_candidacy (goal_id, is_candidate_dominada, candidacy_since)
    VALUES (p_goal, p_is_candidate, p_candidacy_since)
    ON CONFLICT (goal_id)
    DO UPDATE SET
      is_candidate_dominada = EXCLUDED.is_candidate_dominada,
      candidacy_since = EXCLUDED.candidacy_since;
  END IF;
END; $$;
