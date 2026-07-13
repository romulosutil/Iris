-- Fase 4 (4B) — redesenho do definer de materialização (D1, "4B-lógica").
--
-- A segmentação/repertório passam a ser calculados em TS PURO
-- (src/lib/evidence/segmentacao.ts + materializar.ts) — testável exaustivamente
-- sem DB. `app_materializar_snapshot` (0016) vira dois UPSERTS FINOS, privilegiados,
-- que só recebem o payload JÁ COMPUTADO e escrevem. Continuam SECURITY DEFINER
-- (só a função escreve em session_snapshot/*_candidacy; app_role só tem SELECT
-- nessas tabelas) + advisory lock por paciente (serializa reclassificações
-- concorrentes do mesmo paciente por 2 coordenadores — spec §4).
--
-- CREATE OR REPLACE preservado (reaplicar é idempotente/limpo, mesmo padrão de
-- 0014/0016).

-- ==================== app_aplicar_snapshot ====================
-- Upsert de UMA linha de session_snapshot, já computada pelo chamador TS.
CREATE OR REPLACE FUNCTION app_aplicar_snapshot(
  p_patient uuid,
  p_numero int,
  p_repertorio jsonb,
  p_segmentacao jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_patient::text, 0));

  -- Guard de isolamento multi-tenant: SECURITY DEFINER bypassa RLS, então o
  -- definer NÃO pode ser uma primitiva de escrita cross-tenant. SECURITY DEFINER
  -- preserva os session settings (GUC app.clinic_id) do chamador, então
  -- app_patient_in_clinic() valida que p_patient pertence à clínica ativa do
  -- chamador — o mesmo limite que session_snapshot_select impõe na leitura.
  IF NOT app_patient_in_clinic(p_patient) THEN
    RAISE EXCEPTION 'app_aplicar_snapshot: paciente % fora da clínica do chamador (isolamento multi-tenant)', p_patient;
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
REVOKE ALL ON FUNCTION app_aplicar_snapshot(uuid,int,jsonb,jsonb) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_aplicar_snapshot(uuid,int,jsonb,jsonb) TO app_role;
--> statement-breakpoint

-- ==================== app_aplicar_candidatura ====================
-- Upsert de milestone_candidacy (quando p_milestone não é NULL — só acende
-- com milestone_id resolvido, decisão C do resolvedor slug→UUID) e/ou
-- goal_candidacy (quando p_goal não é NULL). Ambos os parâmetros são
-- opcionais e independentes — o chamador decide o que recomputar por
-- invocação (pode ser só goal, só milestone, ou ambos).
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

  -- Guard de isolamento multi-tenant (idem app_aplicar_snapshot): o definer só
  -- escreve candidatura para pacientes da clínica ativa do chamador, mesmo
  -- bypassando RLS. milestone_candidacy é keyed por (patient_id, milestone_id) e
  -- goal_candidacy por goal (que pertence ao paciente) — validar p_patient cobre
  -- ambos os eixos.
  IF NOT app_patient_in_clinic(p_patient) THEN
    RAISE EXCEPTION 'app_aplicar_candidatura: paciente % fora da clínica do chamador (isolamento multi-tenant)', p_patient;
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
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_aplicar_candidatura(uuid,uuid,uuid,boolean,timestamptz,int,int) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_aplicar_candidatura(uuid,uuid,uuid,boolean,timestamptz,int,int) TO app_role;
--> statement-breakpoint

-- ==================== app_materializar_snapshot (compat) ====================
-- Mantido como esqueleto NO-OP explícito: o chamador (actions.ts) migrou para
-- `materializarSnapshot()` (TS), que invoca `app_aplicar_snapshot`/
-- `app_aplicar_candidatura` diretamente. Esta função fica só para não quebrar
-- nenhum outro chamador que ainda a invoque diretamente (nenhum previsto) —
-- RAISE NOTICE explícito para não confundir alguém que rode isso por engano.
CREATE OR REPLACE FUNCTION app_materializar_snapshot(p_patient uuid, p_desde_numero int)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE NOTICE 'app_materializar_snapshot: DEPRECATED — cálculo migrou para materializarSnapshot() (src/lib/evidence/materializar.ts). Esta função não faz mais nada.';
END; $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_materializar_snapshot(uuid,int) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_materializar_snapshot(uuid,int) TO app_role;
