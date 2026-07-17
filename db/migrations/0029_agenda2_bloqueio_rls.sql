-- Agenda 2.0 (Etapa A) — RLS de bloqueio. Escrita = coordenação. Anti-IDOR:
-- quando o alvo (paciente/terapeuta) está preenchido, ele tem que ser da
-- clínica ativa (FK composta cobre paciente; app_user_in_clinic cobre terapeuta).
GRANT SELECT, INSERT, UPDATE, DELETE ON bloqueio TO app_role;
--> statement-breakpoint
ALTER TABLE bloqueio ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE bloqueio FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY bloqueio_select ON bloqueio FOR SELECT TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
);
--> statement-breakpoint
CREATE POLICY bloqueio_insert ON bloqueio FOR INSERT TO app_role
  WITH CHECK (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND current_setting('app.user_role') = 'coordenador'
    AND (patient_id IS NULL OR app_patient_in_clinic(patient_id))
    AND (terapeuta_id IS NULL OR app_user_in_clinic(terapeuta_id))
  );
--> statement-breakpoint
CREATE POLICY bloqueio_update ON bloqueio FOR UPDATE TO app_role
  USING (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND current_setting('app.user_role') = 'coordenador'
  )
  WITH CHECK (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND current_setting('app.user_role') = 'coordenador'
    AND (patient_id IS NULL OR app_patient_in_clinic(patient_id))
    AND (terapeuta_id IS NULL OR app_user_in_clinic(terapeuta_id))
  );
--> statement-breakpoint
CREATE POLICY bloqueio_delete ON bloqueio FOR DELETE TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND current_setting('app.user_role') = 'coordenador'
);
