-- 0097: nicho TCC — tabela `tcc_rpd_entry` (Registro de Pensamentos
-- Disfuncionais) + GRANTs e RLS.
--
-- O bloco de DDL abaixo saiu de `pnpm db:generate` (snapshot 0097). O enum
-- `clinical_modality` e a coluna `patient.clinical_modality` que o generate
-- também emitiu foram REMOVIDOS daqui: já foram aplicados pela 0096
-- (`0096_patient_clinical_modality`), que entrou à mão e sem snapshot. Repetir
-- o DDL aqui abortaria o estágio `migrate` do Dockerfile com "type already
-- exists". O snapshot 0097 sim contém as duas coisas — é ele que passa a ser a
-- base do próximo `db:generate`, fechando a deriva deixada pela 0096.
CREATE TABLE "tcc_rpd_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"session_id" uuid,
	"situacao" text NOT NULL,
	"pensamento_automatico" text NOT NULL,
	"emocao" text NOT NULL,
	"intensidade" integer NOT NULL,
	"distorcao_cognitiva" text NOT NULL,
	"resposta_racional" text NOT NULL,
	"intensidade_pos" integer,
	"criado_por" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tcc_rpd_intensidade_range" CHECK ("tcc_rpd_entry"."intensidade" BETWEEN 0 AND 100),
	CONSTRAINT "tcc_rpd_intensidade_pos_range" CHECK ("tcc_rpd_entry"."intensidade_pos" IS NULL OR ("tcc_rpd_entry"."intensidade_pos" BETWEEN 0 AND 100))
);
--> statement-breakpoint
ALTER TABLE "tcc_rpd_entry" ADD CONSTRAINT "tcc_rpd_entry_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tcc_rpd_entry" ADD CONSTRAINT "tcc_rpd_entry_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tcc_rpd_entry" ADD CONSTRAINT "tcc_rpd_entry_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tcc_rpd_entry" ADD CONSTRAINT "tcc_rpd_entry_criado_por_app_user_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tcc_rpd_patient" ON "tcc_rpd_entry" USING btree ("patient_id","criado_em" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_tcc_rpd_clinic" ON "tcc_rpd_entry" USING btree ("clinic_id");--> statement-breakpoint

-- A partir daqui é escrito à mão: GRANT e RLS não são modelados pelo Drizzle e
-- não entram no snapshot.
GRANT SELECT, INSERT, UPDATE, DELETE ON "tcc_rpd_entry" TO app_role;--> statement-breakpoint

ALTER TABLE "tcc_rpd_entry" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tcc_rpd_entry" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Isolamento por tenant via `app_clinic_id_exigido()` (D16/#229): resolver o
-- tenant com `current_setting('app.clinic_id')::uuid` cru estoura 42704/22P02
-- dentro da policy sem nomear o tenant. O predicado de equipe espelha o das
-- demais tabelas por paciente (coordenador OU membro da equipe).
CREATE POLICY tcc_rpd_entry_select ON tcc_rpd_entry FOR SELECT TO app_role USING (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (current_setting('app.user_role', true) = 'coordenador') OR app_is_on_team(patient_id)
  )
);--> statement-breakpoint

CREATE POLICY tcc_rpd_entry_insert ON tcc_rpd_entry FOR INSERT TO app_role WITH CHECK (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (current_setting('app.user_role', true) = 'coordenador') OR app_is_on_team(patient_id)
  )
);--> statement-breakpoint

CREATE POLICY tcc_rpd_entry_update ON tcc_rpd_entry FOR UPDATE TO app_role USING (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (current_setting('app.user_role', true) = 'coordenador') OR app_is_on_team(patient_id)
  )
) WITH CHECK (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (current_setting('app.user_role', true) = 'coordenador') OR app_is_on_team(patient_id)
  )
);--> statement-breakpoint

CREATE POLICY tcc_rpd_entry_delete ON tcc_rpd_entry FOR DELETE TO app_role USING (
  (clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role', true) = 'coordenador')
);
