-- 0094 — Tech Debt D23: fechar guard de papel e identidade nas 7 funções DEFINER restantes.
--
-- MOTIVAÇÃO (D23):
-- A migração 0093_user_role_id_helpers.sql reescreveu 6 funções SECURITY DEFINER,
-- mas o guard de CI (db/tests/clinic-id-helper-rls.int.test.ts) foi escrito à frente da
-- correção completa e as 7 funções públicas restantes continuavam usando padrões crus.
--
-- ESTA MIGRAÇÃO REESCREVE AS 7 FUNÇÕES DEFINER RESTANTES:
-- 1. `app_alerta_visivel` (SQL, STABLE) -> usa `app_user_role_exigido()`
-- 2. `app_aplicar_candidatura` (plpgsql, VOLATILE) -> usa `app_user_role_exigido()`
-- 3. `app_aplicar_snapshot` (plpgsql, VOLATILE) -> usa `app_user_role_exigido()`
-- 4. `app_purgar_paciente` (plpgsql, VOLATILE) -> usa `app_user_role_exigido()` e `app_user_id_exigido()`
-- 5. `app_purgar_report` (plpgsql, VOLATILE) -> usa `app_user_role_exigido()` e `app_user_id_exigido()`
-- 6. `app_report_visivel` (SQL, STABLE) -> usa `app_user_role_exigido()`
-- 7. `app_is_on_team` (SQL, STABLE) -> usa `app_user_id_exigido()`
--
-- JUSTIFICATIVAS DE SEMÂNTICA (Plan Mode):
-- Escolhemos usar as variantes `_exigido()` para todas as 7 funções.
-- Como estas funções representam fronteiras críticas de autorização ou gates de escrita/deleção,
-- qualquer ausência ou malformação de GUC deve estourar com uma exceção barulhenta (P0001)
-- em vez de falhar silenciosamente ou negar o acesso sem nomear a causa, garantindo auditabilidade.

CREATE OR REPLACE FUNCTION public.app_alerta_visivel(p_alerta uuid) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM alerta a
    WHERE a.id = p_alerta
      AND a.deletado_em IS NULL
      AND app_patient_in_clinic(a.patient_id)
      AND (app_user_role_exigido() = 'coordenador' OR app_is_on_team(a.patient_id))
  );
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_alerta_visivel(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_alerta_visivel(uuid) TO app_role;
--> statement-breakpoint


CREATE OR REPLACE FUNCTION public.app_aplicar_snapshot(p_patient uuid, p_numero integer, p_repertorio jsonb, p_segmentacao jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_patient::text, 0));

  IF NOT app_patient_in_clinic(p_patient) THEN
    RAISE EXCEPTION 'app_aplicar_snapshot: paciente % fora da clínica do chamador (isolamento multi-tenant)', p_patient;
  END IF;

  -- Paridade com session_snapshot_select (0016): coordenador escreve toda a
  -- clínica; terapeuta só paciente da própria equipe vigente.
  IF NOT (app_user_role_exigido() = 'coordenador' OR app_is_on_team(p_patient)) THEN
    RAISE EXCEPTION 'app_aplicar_snapshot: paciente % fora da equipe do chamador (autorização cross-team)', p_patient;
  END IF;

  IF app_prontuario_somente_leitura(p_patient) THEN
    RAISE EXCEPTION 'Prontuário em somente-leitura: consentimento revogado (LGPD Art. 8º, §5º)';
  END IF;

  INSERT INTO session_snapshot (patient_id, session_numero, repertorio_state, segmentacao, gerado_em)
  VALUES (p_patient, p_numero, p_repertorio, p_segmentacao, now())
  ON CONFLICT (patient_id, session_numero)
  DO UPDATE SET
    repertorio_state = EXCLUDED.repertorio_state,
    segmentacao = EXCLUDED.segmentacao,
    gerado_em = now();
END; $function$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_aplicar_snapshot(uuid,integer,jsonb,jsonb) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_aplicar_snapshot(uuid,integer,jsonb,jsonb) TO app_role;
--> statement-breakpoint


CREATE OR REPLACE FUNCTION public.app_aplicar_candidatura(p_patient uuid, p_milestone uuid, p_goal uuid, p_is_candidate boolean, p_candidacy_since timestamp with time zone, p_evidence_count integer, p_distinct_sessions integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_patient::text, 0));

  IF NOT app_patient_in_clinic(p_patient) THEN
    RAISE EXCEPTION 'app_aplicar_candidatura: paciente % fora da clínica do chamador (isolamento multi-tenant)', p_patient;
  END IF;

  -- Paridade com milestone_candidacy_select (0006): mesma fronteira de equipe.
  IF NOT (app_user_role_exigido() = 'coordenador' OR app_is_on_team(p_patient)) THEN
    RAISE EXCEPTION 'app_aplicar_candidatura: paciente % fora da equipe do chamador (autorização cross-team)', p_patient;
  END IF;

  IF app_prontuario_somente_leitura(p_patient) THEN
    RAISE EXCEPTION 'Prontuário em somente-leitura: consentimento revogado (LGPD Art. 8º, §5º)';
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
END; $function$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_aplicar_candidatura(uuid,uuid,uuid,boolean,timestamptz,int,int) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_aplicar_candidatura(uuid,uuid,uuid,boolean,timestamptz,int,int) TO app_role;
--> statement-breakpoint


CREATE OR REPLACE FUNCTION public.app_purgar_paciente(p_patient uuid, p_motivo text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clinic uuid;
BEGIN
  IF app_user_role_exigido() <> 'coordenador' THEN
    RAISE EXCEPTION 'app_purgar_paciente: só coordenador purga (papel atual %)', app_user_role_exigido();
  END IF;
  SELECT clinic_id INTO v_clinic FROM patient WHERE id = p_patient;
  IF v_clinic IS NULL OR NOT app_patient_in_clinic(p_patient) THEN
    RAISE EXCEPTION 'app_purgar_paciente: paciente inexistente ou sem permissão';
  END IF;

  -- 1) trilha PRIMEIRO — linha-fato já pseudônima.
  INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
  VALUES (v_clinic, app_user_id_exigido(), 'paciente_purgado', 'patient', p_patient, NULL,
          jsonb_build_object('motivo', p_motivo, 'pseudonimizado', true));

  -- 2) pseudonimiza a trilha histórica do sujeito.
  UPDATE audit_log
     SET patient_id = NULL,
         detalhe = jsonb_build_object('pseudonimizado', true, 'motivo_expurgo', p_motivo)
   WHERE patient_id = p_patient;

  -- 2b) pseudonimiza os alertas de risco (H2) — ANTES dos DELETEs, porque é
  --     isto que solta as FKs para `patient` e `session` e destrava o erasure.
  --     Textos livres sobrescritos por inteiro, mesma justificativa do
  --     `detalhe` do audit_log: em erasure, over-remoção não gera breach,
  --     under-remoção sim.
  UPDATE alerta_risco_clinico
     SET patient_id = NULL,
         session_id = NULL,
         trecho_fonte = '[expurgado]',
         detalhe = '[expurgado]',
         conduta_registrada = CASE WHEN conduta_registrada IS NULL THEN NULL ELSE '[expurgado]' END,
         motivo_descarte = CASE WHEN motivo_descarte IS NULL THEN NULL ELSE '[expurgado]' END,
         pseudonimizado_em = now(),
         atualizado_em = now()
   WHERE patient_id = p_patient;

  -- 3) erasure físico, leaf-first.
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

REVOKE ALL ON FUNCTION public.app_purgar_paciente(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_purgar_paciente(uuid, text) TO app_role;
--> statement-breakpoint


CREATE OR REPLACE FUNCTION public.app_purgar_report(p_report uuid, p_motivo text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_patient uuid; v_clinic uuid; v_hash text;
BEGIN
  IF app_user_role_exigido() <> 'coordenador' THEN
    RAISE EXCEPTION 'app_purgar_report: só coordenador purga (papel atual %)', app_user_role_exigido();
  END IF;
  SELECT patient_id, clinic_id, pdf_hash INTO v_patient, v_clinic, v_hash FROM report WHERE id = p_report;
  -- Mensagem ÚNICA: "não encontrado" cobre inexistente E fora da clínica. É o
  -- que impede a função de virar oráculo de existência de report_id entre tenants.
  IF v_patient IS NULL OR NOT app_patient_in_clinic(v_patient) THEN
    RAISE EXCEPTION 'app_purgar_report: report % não encontrado', p_report;
  END IF;
  -- 1) trilha PRIMEIRO (entidade_id sem FK → sobrevive ao delete)
  INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
  VALUES (v_clinic, app_user_id_exigido(), 'relatorio_purgado', 'report', p_report, v_patient,
          jsonb_build_object('motivo', p_motivo, 'hash', v_hash));
  -- 2) delete físico (cascata remove report_pdf)
  DELETE FROM report WHERE id = p_report;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_purgar_report(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_purgar_report(uuid, text) TO app_role;
--> statement-breakpoint


CREATE OR REPLACE FUNCTION public.app_report_visivel(p_report uuid) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM report r
    WHERE r.id = p_report
      AND r.deletado_em IS NULL
      AND app_patient_in_clinic(r.patient_id)
      AND (app_user_role_exigido() = 'coordenador' OR app_is_on_team(r.patient_id))
  );
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_report_visivel(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_report_visivel(uuid) TO app_role;
--> statement-breakpoint


CREATE OR REPLACE FUNCTION public.app_is_on_team(p_patient uuid)
  RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
  SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM care_team_membership m
    WHERE m.patient_id = p_patient
      AND m.user_id = app_user_id_exigido()
      AND m.vigencia_fim IS NULL
  );
$$;
--> statement-breakpoint

-- ATENÇÃO (mudança de ACL intencional, além da troca de helper): `app_is_on_team`
-- era a única das 7 funções que ainda carregava o EXECUTE default de PUBLIC
-- (ACL medida pré-0094: {=X/iris, iris=X/iris, app_role=X/iris}). Este REVOKE
-- derruba o acesso indireto de iris_auth, iris_arquivamento, iris_escalonamento
-- e iris_auth_login via PUBLIC. Hoje nenhum desses papéis chama a função
-- diretamente (só através de funções SECURITY DEFINER do owner, onde o check de
-- privilégio é do owner) — endurecimento seguro e proposital.
REVOKE ALL ON FUNCTION public.app_is_on_team(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_is_on_team(uuid) TO app_role;
