-- D8 / #174 — autoriza terapeuta de cobertura/substituto a desarquivar paciente.
--
-- MOTIVAÇÃO (D8):
-- Em 0067, o guard de autorização de app_desarquivar_paciente exigia estritamente
-- coordenador/admin_recepcao OU app_is_on_team(p_patient).
-- Terapeutas de cobertura (designados via session.terapeuta_id ou session.atendido_por_id)
-- possuem autorização clínica legítima para realizar o atendimento e gravar notas
-- (session_note_insert), mas eram barrados pela procedure.
--
-- O GUARD ATUALIZADO:
-- 1. Isolamento multi-tenant: app_patient_in_clinic(p_patient) [INEGOCIÁVEL]
-- 2. Autorização clínica:
--    - Coordenador ou admin_recepcao
--    - OU terapeuta membro da equipe (app_is_on_team)
--    - OU terapeuta com sessão atribuída ao paciente na mesma clínica
--      (session.terapeuta_id = app.user_id OU session.atendido_por_id = app.user_id)
-- 3. Idempotência: só altera arquivado_em se for NOT NULL, retornando true apenas
--    quando houve mutação real.

CREATE OR REPLACE FUNCTION app_desarquivar_paciente(p_patient uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_afetadas int;
BEGIN
  IF NOT app_patient_in_clinic(p_patient) THEN
    RAISE EXCEPTION 'app_desarquivar_paciente: paciente % fora da clínica do chamador (isolamento multi-tenant)', p_patient;
  END IF;

  IF NOT (
    current_setting('app.user_role') IN ('coordenador', 'admin_recepcao')
    OR app_is_on_team(p_patient)
    OR EXISTS (
      SELECT 1 FROM session s
       WHERE s.patient_id = p_patient
         AND s.clinic_id = app_clinic_id_exigido()
         AND (s.terapeuta_id = (current_setting('app.user_id'))::uuid
              OR s.atendido_por_id = (current_setting('app.user_id'))::uuid)
    )
  ) THEN
    RAISE EXCEPTION 'app_desarquivar_paciente: paciente % fora da equipe ou cobertura do chamador (autorização cross-team)', p_patient;
  END IF;

  UPDATE patient
     SET arquivado_em = NULL
   WHERE id = p_patient
     AND arquivado_em IS NOT NULL;

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas > 0;
END; $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_desarquivar_paciente(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_desarquivar_paciente(uuid) TO app_role;
