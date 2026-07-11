-- RLS da Fase 2 (metas + diário). Espelha 0004_session_rls.sql.
-- Tabelas-filhas de `session` (nota, escopo, áudio, extração) computam
-- visibilidade CLÍNICA via helpers SECURITY DEFINER novos, evitando recursão de
-- RLS e excluindo admin_recepcao de dado clínico (guardrail #1).
-- O GRANT ... ON ALL TABLES da 0001 é point-in-time — GRANT explícito por tabela.

-- Helper: sessão clinicamente visível para o usuário atual (coordenador vê a
-- clínica toda; terapeuta vê própria sessão ou paciente da sua equipe).
-- Recepção NUNCA vê (dado clínico).
CREATE OR REPLACE FUNCTION app_session_clinica_visivel(p_session uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM session s
    WHERE s.id = p_session
      AND s.clinic_id = current_setting('app.clinic_id')::uuid
      AND (
        current_setting('app.user_role') = 'coordenador'
        OR s.terapeuta_id = current_setting('app.user_id')::uuid
        OR app_is_on_team(s.patient_id)
      )
  );
$$;
--> statement-breakpoint

-- Helper: terapeuta dono da sessão (para WITH CHECK de escrita da própria nota).
CREATE OR REPLACE FUNCTION app_session_terapeuta_id(p_session uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT s.terapeuta_id FROM session s
  WHERE s.id = p_session
    AND s.clinic_id = current_setting('app.clinic_id')::uuid;
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app_session_clinica_visivel(uuid) TO app_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_session_terapeuta_id(uuid) TO app_role;
--> statement-breakpoint

-- Helper auxiliar: marco pertence a protocolo da clínica (usado pelo WITH CHECK
-- de milestone_candidacy_write mais abaixo).
CREATE OR REPLACE FUNCTION app_milestone_in_clinic(p_milestone uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM milestone m
    WHERE m.id = p_milestone AND app_protocol_in_clinic(m.protocol_id)
  );
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_milestone_in_clinic(uuid) TO app_role;
--> statement-breakpoint

-- ============================ session_note ============================
GRANT SELECT, INSERT, UPDATE ON session_note TO app_role;
--> statement-breakpoint
ALTER TABLE session_note ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE session_note FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY session_note_select ON session_note FOR SELECT TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND app_session_clinica_visivel(session_id)
);
--> statement-breakpoint
-- Terapeuta escreve só nota da própria sessão.
CREATE POLICY session_note_insert ON session_note FOR INSERT TO app_role WITH CHECK (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND autor_id = current_setting('app.user_id')::uuid
  AND app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid
);
--> statement-breakpoint
CREATE POLICY session_note_update ON session_note FOR UPDATE TO app_role
  USING (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid
  )
  WITH CHECK (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid
  );
--> statement-breakpoint

-- ==================== session_protocol_scope ====================
GRANT SELECT, INSERT, UPDATE, DELETE ON session_protocol_scope TO app_role;
--> statement-breakpoint
ALTER TABLE session_protocol_scope ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE session_protocol_scope FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY sps_select ON session_protocol_scope FOR SELECT TO app_role USING (
  app_session_clinica_visivel(session_id)
);
--> statement-breakpoint
CREATE POLICY sps_insert ON session_protocol_scope FOR INSERT TO app_role WITH CHECK (
  app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid
  AND app_protocol_in_clinic(protocol_id)
  AND (ajustado_por IS NULL OR ajustado_por = current_setting('app.user_id')::uuid)
);
--> statement-breakpoint
CREATE POLICY sps_update ON session_protocol_scope FOR UPDATE TO app_role
  USING (app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid)
  WITH CHECK (
    app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid
    AND app_protocol_in_clinic(protocol_id)
    AND (ajustado_por IS NULL OR ajustado_por = current_setting('app.user_id')::uuid)
  );
--> statement-breakpoint
CREATE POLICY sps_delete ON session_protocol_scope FOR DELETE TO app_role USING (
  app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid
);
--> statement-breakpoint

-- ============================ audio_capture ============================
GRANT SELECT, INSERT, UPDATE ON audio_capture TO app_role;
--> statement-breakpoint
ALTER TABLE audio_capture ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audio_capture FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audio_select ON audio_capture FOR SELECT TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND app_session_clinica_visivel(session_id)
);
--> statement-breakpoint
CREATE POLICY audio_insert ON audio_capture FOR INSERT TO app_role WITH CHECK (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid
);
--> statement-breakpoint
CREATE POLICY audio_update ON audio_capture FOR UPDATE TO app_role
  USING (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid
  )
  WITH CHECK (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid
  );
--> statement-breakpoint

-- ============================ extraction ============================
GRANT SELECT, INSERT, UPDATE, DELETE ON extraction TO app_role;
--> statement-breakpoint
ALTER TABLE extraction ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE extraction FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY extraction_select ON extraction FOR SELECT TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND app_session_clinica_visivel(session_id)
);
--> statement-breakpoint
-- Escrita pelo terapeuta dono da sessão (quem consolida). Recepção não consolida.
CREATE POLICY extraction_insert ON extraction FOR INSERT TO app_role WITH CHECK (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid
);
--> statement-breakpoint
CREATE POLICY extraction_update ON extraction FOR UPDATE TO app_role
  USING (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid
  )
  WITH CHECK (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid
  );
--> statement-breakpoint
CREATE POLICY extraction_delete ON extraction FOR DELETE TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid
);
--> statement-breakpoint

-- ============================ goal ============================
-- patient_id (e demais colunas de identidade) imutáveis por app_role: RLS
-- WITH CHECK não compara OLD vs NEW, então travamos via GRANT por coluna
-- (mesmo idioma do REVOKE UPDATE ON consent da 0001) — evita reatribuição
-- de meta a outro paciente via UPDATE.
GRANT SELECT, INSERT ON goal TO app_role;
--> statement-breakpoint
GRANT UPDATE (descricao, estado, criterio_dominio, ciclo_revisao_semanas, proxima_revisao_em, atualizado_em) ON goal TO app_role;
--> statement-breakpoint
ALTER TABLE goal ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE goal FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Leitura: papéis clínicos da clínica (coordenador toda a clínica; terapeuta
-- paciente da sua equipe). Recepção não vê meta (dado clínico).
CREATE POLICY goal_select ON goal FOR SELECT TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND (
    current_setting('app.user_role') = 'coordenador'
    OR app_is_on_team(patient_id)
  )
);
--> statement-breakpoint
CREATE POLICY goal_insert ON goal FOR INSERT TO app_role WITH CHECK (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND current_setting('app.user_role') IN ('coordenador', 'terapeuta')
  AND app_patient_in_clinic(patient_id)
  AND criado_por = current_setting('app.user_id')::uuid
  AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(patient_id))
);
--> statement-breakpoint
CREATE POLICY goal_update ON goal FOR UPDATE TO app_role
  USING (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(patient_id))
  )
  WITH CHECK (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND app_patient_in_clinic(patient_id)
    AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(patient_id))
  );
--> statement-breakpoint

-- ==================== goal_milestone_mapping ====================
GRANT SELECT, INSERT, UPDATE, DELETE ON goal_milestone_mapping TO app_role;
--> statement-breakpoint
ALTER TABLE goal_milestone_mapping ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE goal_milestone_mapping FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Helper de visibilidade de goal via SECURITY DEFINER seria ideal, mas o mapping
-- referencia goal diretamente; usamos EXISTS sobre goal (mesma role, RLS de goal
-- aplica e restringe consistentemente).
CREATE POLICY gmm_select ON goal_milestone_mapping FOR SELECT TO app_role USING (
  EXISTS (SELECT 1 FROM goal g WHERE g.id = goal_id)
);
--> statement-breakpoint
CREATE POLICY gmm_insert ON goal_milestone_mapping FOR INSERT TO app_role WITH CHECK (
  EXISTS (SELECT 1 FROM goal g WHERE g.id = goal_id)
  AND app_milestone_in_clinic(milestone_id)
);
--> statement-breakpoint
CREATE POLICY gmm_delete ON goal_milestone_mapping FOR DELETE TO app_role USING (
  EXISTS (SELECT 1 FROM goal g WHERE g.id = goal_id)
);
--> statement-breakpoint

-- ============================ milestone ============================
-- Catálogo: leitura por qualquer papel da clínica dona do protocolo; escrita
-- pelo seed/coordenador (INSERT restrito ao protocolo da clínica ativa).
GRANT SELECT, INSERT, UPDATE, DELETE ON milestone TO app_role;
--> statement-breakpoint
ALTER TABLE milestone ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE milestone FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY milestone_select ON milestone FOR SELECT TO app_role USING (
  app_protocol_in_clinic(protocol_id)
);
--> statement-breakpoint
CREATE POLICY milestone_insert ON milestone FOR INSERT TO app_role WITH CHECK (
  current_setting('app.user_role') = 'coordenador'
  AND app_protocol_in_clinic(protocol_id)
);
--> statement-breakpoint
CREATE POLICY milestone_update ON milestone FOR UPDATE TO app_role
  USING (current_setting('app.user_role') = 'coordenador' AND app_protocol_in_clinic(protocol_id))
  WITH CHECK (app_protocol_in_clinic(protocol_id));
--> statement-breakpoint

-- ============================ goal_candidacy (dormente) ============================
GRANT SELECT, INSERT, UPDATE, DELETE ON goal_candidacy TO app_role;
--> statement-breakpoint
ALTER TABLE goal_candidacy ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE goal_candidacy FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY goal_candidacy_select ON goal_candidacy FOR SELECT TO app_role USING (
  EXISTS (SELECT 1 FROM goal g WHERE g.id = goal_id)
);
--> statement-breakpoint
-- Escrita restrita a coordenador (simetria com milestone_candidacy_write).
CREATE POLICY goal_candidacy_write ON goal_candidacy FOR ALL TO app_role
  USING (
    current_setting('app.user_role') = 'coordenador'
    AND EXISTS (SELECT 1 FROM goal g WHERE g.id = goal_id)
  )
  WITH CHECK (
    current_setting('app.user_role') = 'coordenador'
    AND EXISTS (SELECT 1 FROM goal g WHERE g.id = goal_id)
  );
--> statement-breakpoint

-- ==================== milestone_candidacy (dormente) ====================
GRANT SELECT, INSERT, UPDATE, DELETE ON milestone_candidacy TO app_role;
--> statement-breakpoint
ALTER TABLE milestone_candidacy ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE milestone_candidacy FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY milestone_candidacy_select ON milestone_candidacy FOR SELECT TO app_role USING (
  app_patient_in_clinic(patient_id)
  AND (
    current_setting('app.user_role') = 'coordenador'
    OR app_is_on_team(patient_id)
  )
);
--> statement-breakpoint
CREATE POLICY milestone_candidacy_write ON milestone_candidacy FOR ALL TO app_role
  USING (
    current_setting('app.user_role') = 'coordenador'
    AND app_patient_in_clinic(patient_id)
  )
  WITH CHECK (
    current_setting('app.user_role') = 'coordenador'
    AND app_patient_in_clinic(patient_id)
    AND app_milestone_in_clinic(milestone_id)
  );
