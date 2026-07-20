-- Fase 5 Fatia 2 — RLS da tabela `alerta` (supervisão do coordenador).
-- Espelha `report` (0039): visibilidade por tenant + equipe, coordenador vê
-- toda a clínica, soft-delete via `deletado_em`. Tabela nova NÃO herda o grant
-- blanket de 0001 — grant explícito obrigatório.

-- Helper de visibilidade (paridade com app_report_visivel).
CREATE OR REPLACE FUNCTION app_alerta_visivel(p_alerta uuid) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM alerta a
    WHERE a.id = p_alerta
      AND a.deletado_em IS NULL
      AND app_patient_in_clinic(a.patient_id)
      AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(a.patient_id))
  );
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_alerta_visivel(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_alerta_visivel(uuid) TO app_role;--> statement-breakpoint

-- Grant explícito (tabela nova não herda o grant point-in-time de 0001).
GRANT SELECT, INSERT, UPDATE ON alerta TO app_role;--> statement-breakpoint

ALTER TABLE alerta ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE alerta FORCE  ROW LEVEL SECURITY;--> statement-breakpoint

-- Escopo tenant + equipe; coordenador bypassa a checagem de equipe. Sem DELETE
-- (soft-delete via UPDATE deletado_em). WITH CHECK garante que INSERT/UPDATE não
-- movam a linha para paciente fora da clínica/equipe.
CREATE POLICY alerta_scope ON alerta FOR ALL TO app_role
  USING (
    deletado_em IS NULL
    AND app_patient_in_clinic(patient_id)
    AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(patient_id))
  )
  WITH CHECK (
    app_patient_in_clinic(patient_id)
    AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(patient_id))
  );
