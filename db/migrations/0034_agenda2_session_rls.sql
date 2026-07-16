-- Agenda 2.0 (Etapa A) — FK de recorrencia + atualização das policies de
-- session p/ cobrir os novos FKs cross-tenant (atendido_por_id = substituto).
ALTER TABLE "session" ADD CONSTRAINT "session_recorrente_fk"
  FOREIGN KEY ("recorrente_id") REFERENCES "public"."agendamento_recorrente"("id")
  ON DELETE SET NULL;
--> statement-breakpoint
DROP POLICY session_insert ON session;
--> statement-breakpoint
CREATE POLICY session_insert ON session FOR INSERT TO app_role
  WITH CHECK (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND current_setting('app.user_role') IN ('admin_recepcao', 'coordenador')
    AND app_patient_in_clinic(patient_id)
    AND app_user_in_clinic(terapeuta_id)
    AND (atendido_por_id IS NULL OR app_user_in_clinic(atendido_por_id))
  );
--> statement-breakpoint
DROP POLICY session_update ON session;
--> statement-breakpoint
CREATE POLICY session_update ON session FOR UPDATE TO app_role
  USING (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND (
      current_setting('app.user_role') IN ('coordenador', 'admin_recepcao')
      OR terapeuta_id = current_setting('app.user_id')::uuid
    )
  )
  WITH CHECK (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND (
      current_setting('app.user_role') IN ('coordenador', 'admin_recepcao')
      OR terapeuta_id = current_setting('app.user_id')::uuid
    )
    AND app_patient_in_clinic(patient_id)
    AND app_user_in_clinic(terapeuta_id)
    AND (atendido_por_id IS NULL OR app_user_in_clinic(atendido_por_id))
  );
