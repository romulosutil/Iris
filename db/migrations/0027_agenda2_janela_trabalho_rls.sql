-- Agenda 2.0 (Etapa A) — RLS de janela_trabalho. Configuração de
-- disponibilidade é ato de COORDENAÇÃO (escrita); leitura no escopo da clínica
-- (calendário compartilhado): coordenador e terapeuta veem a grade. Anti-IDOR
-- de terapeuta via app_user_in_clinic (app_user é global, sem clinic_id → não
-- há FK composta possível; segue o padrão de session_insert).
GRANT SELECT, INSERT, UPDATE, DELETE ON janela_trabalho TO app_role;
--> statement-breakpoint
ALTER TABLE janela_trabalho ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE janela_trabalho FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY janela_trabalho_select ON janela_trabalho FOR SELECT TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
);
--> statement-breakpoint
CREATE POLICY janela_trabalho_insert ON janela_trabalho FOR INSERT TO app_role
  WITH CHECK (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND current_setting('app.user_role') = 'coordenador'
    AND app_user_in_clinic(terapeuta_id)
  );
--> statement-breakpoint
CREATE POLICY janela_trabalho_update ON janela_trabalho FOR UPDATE TO app_role
  USING (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND current_setting('app.user_role') = 'coordenador'
  )
  WITH CHECK (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND current_setting('app.user_role') = 'coordenador'
    AND app_user_in_clinic(terapeuta_id)
  );
--> statement-breakpoint
CREATE POLICY janela_trabalho_delete ON janela_trabalho FOR DELETE TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND current_setting('app.user_role') = 'coordenador'
);
