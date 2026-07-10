-- RLS multi-tenant + isolamento admin_recepcao ↔ clínico (Fase 1).
-- Padrão: session GUC (app.clinic_id / app.user_id / app.user_role) setados por
-- transação pelo helper src/db/rls.ts. Fonte: docs/dados/modelo-de-dados.md.
--
-- `app_role` é role de PRIVILÉGIO (NOLOGIN) — alvo das policies e dos grants.
-- O usuário que efetivamente conecta é criado por ambiente (LOGIN ... IN ROLE
-- app_role), fora das migrations, para não versionar senha. Ver infra/README.
--
-- Checks cross-table usam funções SECURITY DEFINER (rodam como o dono/superuser,
-- bypassam RLS) para evitar RECURSÃO entre policies de patient ↔ care_team.

-- statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_role') THEN
    CREATE ROLE app_role NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_role;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_role;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON consent FROM app_role; -- append-only (LGPD)
--> statement-breakpoint

-- ─── Helpers SECURITY DEFINER (evitam recursão de policy) ────────────────────
CREATE OR REPLACE FUNCTION app_patient_in_clinic(p_patient uuid)
  RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
  SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM patient p
    WHERE p.id = p_patient
      AND p.clinic_id = current_setting('app.clinic_id')::uuid
  );
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_is_on_team(p_patient uuid)
  RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
  SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM care_team_membership m
    WHERE m.patient_id = p_patient
      AND m.user_id = current_setting('app.user_id')::uuid
      AND m.vigencia_fim IS NULL
  );
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_patient_in_clinic(uuid), app_is_on_team(uuid) TO app_role;
--> statement-breakpoint

-- ─── patient (administrativo; escopo de leitura por papel) ───────────────────
ALTER TABLE patient ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE patient FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY patient_select ON patient FOR SELECT TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND (
    current_setting('app.user_role') IN ('coordenador', 'admin_recepcao')
    OR app_is_on_team(id)
  )
);
--> statement-breakpoint
-- Escrita de cadastro é administrativa: recepção e coordenador. Terapeuta não
-- cria/edita/deleta paciente.
CREATE POLICY patient_insert ON patient FOR INSERT TO app_role
  WITH CHECK (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND current_setting('app.user_role') IN ('admin_recepcao', 'coordenador')
  );
--> statement-breakpoint
CREATE POLICY patient_update ON patient FOR UPDATE TO app_role
  USING (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND current_setting('app.user_role') IN ('admin_recepcao', 'coordenador')
  )
  WITH CHECK (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND current_setting('app.user_role') IN ('admin_recepcao', 'coordenador')
  );
--> statement-breakpoint
CREATE POLICY patient_delete ON patient FOR DELETE TO app_role
  USING (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND current_setting('app.user_role') = 'coordenador'
  );
--> statement-breakpoint

-- ─── patient_clinical_profile (CLÍNICA — admin_recepcao BLOQUEADO) ───────────
ALTER TABLE patient_clinical_profile ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE patient_clinical_profile FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY pcp_access ON patient_clinical_profile FOR ALL TO app_role
  USING (
    current_setting('app.user_role') <> 'admin_recepcao'
    AND app_patient_in_clinic(patient_id)
    AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(patient_id))
  )
  WITH CHECK (
    current_setting('app.user_role') <> 'admin_recepcao'
    AND app_patient_in_clinic(patient_id)
    AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(patient_id))
  );
--> statement-breakpoint

-- ─── patient_protocol (CLÍNICA — admin BLOQUEADO; coordenador escreve) ──────
ALTER TABLE patient_protocol ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE patient_protocol FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY pp_read ON patient_protocol FOR SELECT TO app_role USING (
  current_setting('app.user_role') <> 'admin_recepcao'
  AND app_patient_in_clinic(patient_id)
  AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(patient_id))
);
--> statement-breakpoint
CREATE POLICY pp_write ON patient_protocol FOR ALL TO app_role
  USING (
    current_setting('app.user_role') = 'coordenador'
    AND app_patient_in_clinic(patient_id)
  )
  WITH CHECK (
    current_setting('app.user_role') = 'coordenador'
    AND app_patient_in_clinic(patient_id)
  );
--> statement-breakpoint

-- ─── care_team_membership (CLÍNICA — admin BLOQUEADO; coordenador escreve) ───
ALTER TABLE care_team_membership ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE care_team_membership FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ctm_read ON care_team_membership FOR SELECT TO app_role USING (
  current_setting('app.user_role') <> 'admin_recepcao'
  AND app_patient_in_clinic(patient_id)
  AND (current_setting('app.user_role') = 'coordenador' OR user_id = current_setting('app.user_id')::uuid)
);
--> statement-breakpoint
CREATE POLICY ctm_write ON care_team_membership FOR ALL TO app_role
  USING (
    current_setting('app.user_role') = 'coordenador'
    AND app_patient_in_clinic(patient_id)
  )
  WITH CHECK (
    current_setting('app.user_role') = 'coordenador'
    AND app_patient_in_clinic(patient_id)
  );
--> statement-breakpoint

-- ─── consent (administrativo — recepção coleta; append-only) ─────────────────
ALTER TABLE consent ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE consent FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY consent_read ON consent FOR SELECT TO app_role
  USING (app_patient_in_clinic(patient_id));
--> statement-breakpoint
-- Coleta de consentimento é ato administrativo (LGPD): recepção e coordenador.
CREATE POLICY consent_insert ON consent FOR INSERT TO app_role
  WITH CHECK (
    app_patient_in_clinic(patient_id)
    AND current_setting('app.user_role') IN ('admin_recepcao', 'coordenador')
  );
--> statement-breakpoint

-- ─── protocol (tenant simples) ──────────────────────────────────────────────
ALTER TABLE protocol ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE protocol FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Leitura do catálogo de protocolos: todos da clínica. Escrita (gerenciar
-- templates) é ato clínico-administrativo restrito ao coordenador.
CREATE POLICY protocol_read ON protocol FOR SELECT TO app_role
  USING (clinic_id = current_setting('app.clinic_id')::uuid);
--> statement-breakpoint
CREATE POLICY protocol_write ON protocol FOR ALL TO app_role
  USING (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND current_setting('app.user_role') = 'coordenador'
  )
  WITH CHECK (
    clinic_id = current_setting('app.clinic_id')::uuid
    AND current_setting('app.user_role') = 'coordenador'
  );
--> statement-breakpoint

-- ─── Seed do catálogo de famílias de protocolo ──────────────────────────────
INSERT INTO protocol_familia_catalogo (id, nome, descricao) VALUES
  ('aba_marcos_desenvolvimento', 'ABA — marcos de desenvolvimento', 'Protocolos de marcos (ex.: VB-MAPP, ABLLS-R)'),
  ('intervencao_naturalista', 'Intervenção naturalista', 'Modelos naturalistas (ex.: Denver/ESDM)'),
  ('fonoaudiologia', 'Fonoaudiologia', 'Protocolos de linguagem e comunicação'),
  ('terapia_ocupacional', 'Terapia ocupacional', 'Protocolos de integração sensorial e AVDs')
ON CONFLICT (id) DO NOTHING;
