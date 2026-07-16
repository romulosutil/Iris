-- Agenda 2.0 (Etapa A) — RLS de patient_alvo_disciplina. GRANT explícito
-- (o GRANT ON ALL TABLES da 0001 é point-in-time, não cobre tabela nova).
-- Alvo é ato administrativo (recepção/coordenação escrevem); leitura clínica
-- no mesmo escopo de patient_select (coordenador vê a clínica; terapeuta só
-- paciente da própria equipe vigente). Anti-IDOR de paciente reforçado no
-- WITH CHECK por app_patient_in_clinic (além da FK composta).
GRANT SELECT, INSERT, UPDATE, DELETE ON patient_alvo_disciplina TO app_role;
--> statement-breakpoint
ALTER TABLE patient_alvo_disciplina ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE patient_alvo_disciplina FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY patient_alvo_disciplina_select ON patient_alvo_disciplina FOR SELECT TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND (
    current_setting('app.user_role') IN ('coordenador', 'admin_recepcao')
    OR app_is_on_team(patient_id)
  )
);
--> statement-breakpoint
CREATE POLICY patient_alvo_disciplina_insert ON patient_alvo_disciplina FOR INSERT TO app_role
  WITH CHECK (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND current_setting('app.user_role') IN ('admin_recepcao', 'coordenador')
    AND app_patient_in_clinic(patient_id)
  );
--> statement-breakpoint
CREATE POLICY patient_alvo_disciplina_update ON patient_alvo_disciplina FOR UPDATE TO app_role
  USING (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND current_setting('app.user_role') IN ('admin_recepcao', 'coordenador')
  )
  WITH CHECK (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND current_setting('app.user_role') IN ('admin_recepcao', 'coordenador')
    AND app_patient_in_clinic(patient_id)
  );
--> statement-breakpoint
CREATE POLICY patient_alvo_disciplina_delete ON patient_alvo_disciplina FOR DELETE TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND current_setting('app.user_role') = 'coordenador'
);
