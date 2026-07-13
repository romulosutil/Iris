-- Fase 4 (4B) — RLS de `session_snapshot` + esqueleto da materialização via
-- SECURITY DEFINER (D1). Espelha o estilo de 0006/0014: GRANT explícito por
-- tabela + policies + helpers SECURITY DEFINER já existentes
-- (app_patient_in_clinic, app_is_on_team de 0001/0006).
--
-- Escrita: NENHUMA policy de INSERT/UPDATE/DELETE para app_role — só a
-- função `app_materializar_snapshot` (dona do objeto, bypassa RLS) escreve.
-- GRANT só de SELECT.
GRANT SELECT ON session_snapshot TO app_role;
--> statement-breakpoint
ALTER TABLE session_snapshot ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE session_snapshot FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Leitura: espelha milestone_candidacy_select (0006) — coordenador vê toda a
-- clínica; terapeuta só paciente da própria equipe vigente. Sem clinic_id
-- direto na tabela (mesmo padrão FK-a-paciente de milestone_candidacy).
CREATE POLICY session_snapshot_select ON session_snapshot FOR SELECT TO app_role USING (
  app_patient_in_clinic(patient_id)
  AND (
    current_setting('app.user_role') = 'coordenador'
    OR app_is_on_team(patient_id)
  )
);
--> statement-breakpoint

-- ==================== app_materializar_snapshot (D1) ====================
-- Esqueleto da materialização síncrona. Corpo é TODO proposital: o fold de
-- evidence→snapshot (grão de alvo + segmentação por tipo_estrutura) e o
-- recompute de milestone_candidacy/goal_candidacy são implementados em
-- tarefa separada (4B-lógica) — aqui só a casca SECURITY DEFINER + o lock.
--
-- Roda como dono (bypassa RLS): filtra explicitamente por p_patient e é a
-- ÚNICA porta de escrita em session_snapshot — não recebe input de outra
-- clínica porque o chamador só passa pacientes que já leu sob RLS.
CREATE OR REPLACE FUNCTION app_materializar_snapshot(p_patient uuid, p_desde_numero int)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Serializa por paciente: evita lost update entre 2 coordenadores
  -- reclassificando evidências do mesmo paciente concorrentemente.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_patient::text, 0));

  -- TODO(4B lógica): fold evidence→snapshot em grão de alvo + segmentação por
  -- tipo_estrutura + recompute de candidatura. Implementado em tarefa separada.
  RAISE NOTICE 'app_materializar_snapshot: skeleton (lógica em tarefa 4B-lógica)';
END; $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_materializar_snapshot(uuid,int) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_materializar_snapshot(uuid,int) TO app_role;
