-- Agenda 2.0 (Etapa A) — RLS de agendamento_recorrente. Escrita = coordenação
-- (regra standing é ato de configuração). Leitura no escopo clínico de paciente:
-- coordenador/recepção veem a clínica; terapeuta só o paciente da própria equipe
-- vigente. Anti-IDOR: FK composta cobre paciente; app_user_in_clinic cobre
-- terapeuta (app_user é global, sem clinic_id).
GRANT SELECT, INSERT, UPDATE, DELETE ON agendamento_recorrente TO app_role;
--> statement-breakpoint
ALTER TABLE agendamento_recorrente ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE agendamento_recorrente FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY agendamento_recorrente_select ON agendamento_recorrente FOR SELECT TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND (
    current_setting('app.user_role') IN ('coordenador', 'admin_recepcao')
    OR app_is_on_team(patient_id)
  )
);
--> statement-breakpoint
CREATE POLICY agendamento_recorrente_insert ON agendamento_recorrente FOR INSERT TO app_role
  WITH CHECK (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND current_setting('app.user_role') = 'coordenador'
    AND app_patient_in_clinic(patient_id)
    AND app_user_in_clinic(terapeuta_id)
  );
--> statement-breakpoint
CREATE POLICY agendamento_recorrente_update ON agendamento_recorrente FOR UPDATE TO app_role
  USING (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND current_setting('app.user_role') = 'coordenador'
  )
  WITH CHECK (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND current_setting('app.user_role') = 'coordenador'
    AND app_patient_in_clinic(patient_id)
    AND app_user_in_clinic(terapeuta_id)
  );
--> statement-breakpoint
CREATE POLICY agendamento_recorrente_delete ON agendamento_recorrente FOR DELETE TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND current_setting('app.user_role') = 'coordenador'
);
