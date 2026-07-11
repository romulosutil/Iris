-- RLS da agenda mínima (Fase 1d) — tabela `session`.
-- Mesmo padrão de 0001_rls.sql: policies leem o contexto de tenant via GUCs
-- (app.clinic_id / app.user_id / app.user_role) setados por transação em
-- src/db/rls.ts. Reusa os helpers SECURITY DEFINER da 0001 (app_patient_in_clinic,
-- app_is_on_team, app_user_in_clinic) — não há recursão porque `session` não é
-- alvo de nenhum deles.
--
-- IMPORTANTE: o `GRANT ... ON ALL TABLES` da 0001 é point-in-time e NÃO cobre
-- `session` (criada depois, na 0003). Por isso o GRANT explícito abaixo.

-- statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON session TO app_role;
--> statement-breakpoint
ALTER TABLE session ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE session FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ─── Leitura ─────────────────────────────────────────────────────────────────
-- Coordenação e recepção enxergam a agenda inteira da clínica ativa (recepção
-- mantém agenda/check-in — modelo-de-dados §, papel de baixo privilégio clínico
-- mas administrativo da agenda). Terapeuta vê só as PRÓPRIAS sessões ou as de
-- pacientes de quem é da equipe de cuidado.
CREATE POLICY session_select ON session FOR SELECT TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND (
    current_setting('app.user_role') IN ('coordenador', 'admin_recepcao')
    OR terapeuta_id = current_setting('app.user_id')::uuid
    OR app_is_on_team(patient_id)
  )
);
--> statement-breakpoint

-- ─── Agendamento (INSERT) ────────────────────────────────────────────────────
-- Marcar sessão é ato administrativo da agenda: recepção e coordenação.
-- As checagens de tenant fecham os FKs (que bypassam RLS): o paciente e o
-- profissional têm que ser da MESMA clínica ativa.
CREATE POLICY session_insert ON session FOR INSERT TO app_role
  WITH CHECK (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND current_setting('app.user_role') IN ('admin_recepcao', 'coordenador')
    AND app_patient_in_clinic(patient_id)
    AND app_user_in_clinic(terapeuta_id)
  );
--> statement-breakpoint

-- ─── Check-in / mudança de estado (UPDATE) ───────────────────────────────────
-- O terapeuta faz check-in da própria sessão ao receber o paciente; recepção e
-- coordenação também mantêm a agenda. WITH CHECK impede mover a sessão para
-- fora da clínica ativa.
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
    -- Isolamento incondicional: os FKs bypassam RLS, então um UPDATE não pode
    -- reapontar a sessão para paciente/profissional de outra clínica mantendo
    -- clinic_id local. Espelha o session_insert.
    AND app_patient_in_clinic(patient_id)
    AND app_user_in_clinic(terapeuta_id)
  );
--> statement-breakpoint

-- ─── Remoção (DELETE) ────────────────────────────────────────────────────────
-- Cancelar sessão é UPDATE (estado='cancelada'), preserva histórico. DELETE
-- físico fica restrito à coordenação (correção de erro de digitação da agenda).
CREATE POLICY session_delete ON session FOR DELETE TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND current_setting('app.user_role') = 'coordenador'
);
