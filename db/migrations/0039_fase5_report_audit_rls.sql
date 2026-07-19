-- Fase 5 F0 — RLS de report, report_pdf, audit_log + helper e purga.
-- GRANT explícito porque o "GRANT ON ALL TABLES" da 0001 é point-in-time (tabelas novas não herdam).
--> statement-breakpoint
-- Helper: um report é visível ao usuário atual? (encapsula tenant+equipe+soft-delete)
CREATE OR REPLACE FUNCTION app_report_visivel(p_report uuid) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM report r
    WHERE r.id = p_report
      AND r.deletado_em IS NULL
      AND app_patient_in_clinic(r.patient_id)
      AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(r.patient_id))
  );
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_report_visivel(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_report_visivel(uuid) TO app_role;
--> statement-breakpoint
-- ── report ──────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON report TO app_role;  -- sem DELETE (soft-delete + purga definer)
--> statement-breakpoint
ALTER TABLE report ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE report FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY report_scope ON report FOR ALL TO app_role USING (
  deletado_em IS NULL
  AND app_patient_in_clinic(patient_id)
  AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(patient_id))
) WITH CHECK (
  app_patient_in_clinic(patient_id)
  AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(patient_id))
);
--> statement-breakpoint
-- ── report_pdf ──────────────────────────────────────────────────────
REVOKE UPDATE, DELETE ON report_pdf FROM app_role;   -- write-once
--> statement-breakpoint
GRANT SELECT, INSERT ON report_pdf TO app_role;
--> statement-breakpoint
ALTER TABLE report_pdf ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE report_pdf FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY report_pdf_scope ON report_pdf FOR ALL TO app_role
  USING (app_report_visivel(report_id))
  WITH CHECK (app_report_visivel(report_id));
--> statement-breakpoint
-- ── audit_log ───────────────────────────────────────────────────────
REVOKE UPDATE, DELETE ON audit_log FROM app_role;    -- imutável (LGPD)
--> statement-breakpoint
GRANT SELECT, INSERT ON audit_log TO app_role;
--> statement-breakpoint
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_insert ON audit_log FOR INSERT TO app_role WITH CHECK (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND ator_id = current_setting('app.user_id')::uuid
);
--> statement-breakpoint
CREATE POLICY audit_select ON audit_log FOR SELECT TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND current_setting('app.user_role') IN ('coordenador', 'admin_recepcao')
);
