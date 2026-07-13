-- Fase 4 (4C.1) — RLS de reinforcer_profile. Espelha 0014_fase4_evidence_rls.sql:
-- append-only por design (grão de observação, 1 linha = 1 item de
-- preferencia_reforcador aprovado), imutabilidade em nível de PRIVILÉGIO —
-- trava UPDATE/DELETE mesmo para o app_role.
REVOKE UPDATE, DELETE ON reinforcer_profile FROM app_role;
--> statement-breakpoint
GRANT SELECT, INSERT ON reinforcer_profile TO app_role;
--> statement-breakpoint
ALTER TABLE reinforcer_profile ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE reinforcer_profile FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Leitura clínica: mesmo escopo de evidence_select — coordenador vê toda a
-- clínica; terapeuta só paciente da própria equipe vigente.
CREATE POLICY reinforcer_profile_select ON reinforcer_profile FOR SELECT TO app_role USING (
  app_patient_in_clinic(patient_id)
  AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(patient_id))
);
--> statement-breakpoint
-- INSERT no momento da aprovação da extração: mesmo escopo de escrita de
-- evidence_insert (terapeuta dono da sessão OU coordenador).
CREATE POLICY reinforcer_profile_insert ON reinforcer_profile FOR INSERT TO app_role WITH CHECK (
  app_patient_in_clinic(patient_id)
  AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(patient_id))
);
