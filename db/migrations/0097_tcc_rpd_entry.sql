-- Migration 0096: Nicho TCC - Tabela tcc_rpd_entry e RLS de clínica.

CREATE TABLE "tcc_rpd_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL REFERENCES "clinic"("id") ON DELETE RESTRICT,
	"patient_id" uuid NOT NULL REFERENCES "patient"("id") ON DELETE CASCADE,
	"session_id" uuid REFERENCES "session"("id") ON DELETE SET NULL,
	"situacao" text NOT NULL,
	"pensamento_automatico" text NOT NULL,
	"emocao" text NOT NULL,
	"intensidade" integer NOT NULL,
	"distorcao_cognitiva" text NOT NULL,
	"resposta_racional" text NOT NULL,
	"intensidade_pos" integer,
	"criado_por" uuid NOT NULL REFERENCES "app_user"("id"),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tcc_rpd_intensidade_range" CHECK ("intensidade" BETWEEN 0 AND 100),
	CONSTRAINT "tcc_rpd_intensidade_pos_range" CHECK ("intensidade_pos" IS NULL OR ("intensidade_pos" BETWEEN 0 AND 100))
);
--> statement-breakpoint

CREATE INDEX "idx_tcc_rpd_patient" ON "tcc_rpd_entry" USING btree ("patient_id", "criado_em" DESC);
--> statement-breakpoint
CREATE INDEX "idx_tcc_rpd_clinic" ON "tcc_rpd_entry" USING btree ("clinic_id");
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON "tcc_rpd_entry" TO app_role;
--> statement-breakpoint

ALTER TABLE "tcc_rpd_entry" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tcc_rpd_entry" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tcc_rpd_entry_select ON tcc_rpd_entry FOR SELECT TO app_role USING (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (current_setting('app.user_role', true) = 'coordenador') OR app_is_on_team(patient_id)
  )
);
--> statement-breakpoint

CREATE POLICY tcc_rpd_entry_insert ON tcc_rpd_entry FOR INSERT TO app_role WITH CHECK (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (current_setting('app.user_role', true) = 'coordenador') OR app_is_on_team(patient_id)
  )
);
--> statement-breakpoint

CREATE POLICY tcc_rpd_entry_update ON tcc_rpd_entry FOR UPDATE TO app_role USING (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (current_setting('app.user_role', true) = 'coordenador') OR app_is_on_team(patient_id)
  )
) WITH CHECK (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (current_setting('app.user_role', true) = 'coordenador') OR app_is_on_team(patient_id)
  )
);
--> statement-breakpoint

CREATE POLICY tcc_rpd_entry_delete ON tcc_rpd_entry FOR DELETE TO app_role USING (
  (clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role', true) = 'coordenador')
);
