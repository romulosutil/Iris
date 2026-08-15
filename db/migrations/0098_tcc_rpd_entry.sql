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
CREATE INDEX "idx_tcc_rpd_clinic" ON "tcc_rpd_entry" USING btree ("clinic_id");
--> statement-breakpoint

-- RLS + policies + grant não são modelados pelo Drizzle (não tocam o snapshot).
-- GRANT reduzido a SELECT, INSERT (#306 recomendado): irmãos session_note e
-- goal concedem só isso; não há caminho de update/delete de RPD na app, não
-- há soft-delete e logic.ts/actions.ts não escrevem em audit_log. As policies
-- de UPDATE/DELETE seguem criadas por simetria com os demais domínios
-- clínicos e como defesa em profundidade — sem o GRANT, nunca são avaliadas.
GRANT SELECT, INSERT ON "tcc_rpd_entry" TO app_role;
--> statement-breakpoint

ALTER TABLE "tcc_rpd_entry" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tcc_rpd_entry" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Predicado idêntico ao dos demais domínios clínicos (equipe: coordenador OR
-- app_is_on_team). `app_user_role_exigido()` em vez de
-- `current_setting('app.user_role', true)` cru (D23, 0093/0094): sem o GUC, a
-- forma crua devolve NULL e a linha some em silêncio; o helper levanta P0001
-- diagnosticável.
CREATE POLICY tcc_rpd_entry_select ON tcc_rpd_entry FOR SELECT TO app_role USING (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (app_user_role_exigido() = 'coordenador') OR app_is_on_team(patient_id)
  )
);
--> statement-breakpoint

CREATE POLICY tcc_rpd_entry_insert ON tcc_rpd_entry FOR INSERT TO app_role WITH CHECK (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (app_user_role_exigido() = 'coordenador') OR app_is_on_team(patient_id)
  )
);
--> statement-breakpoint

CREATE POLICY tcc_rpd_entry_update ON tcc_rpd_entry FOR UPDATE TO app_role USING (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (app_user_role_exigido() = 'coordenador') OR app_is_on_team(patient_id)
  )
) WITH CHECK (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (app_user_role_exigido() = 'coordenador') OR app_is_on_team(patient_id)
  )
);
--> statement-breakpoint

CREATE POLICY tcc_rpd_entry_delete ON tcc_rpd_entry FOR DELETE TO app_role USING (
  (clinic_id = app_clinic_id_exigido()) AND (app_user_role_exigido() = 'coordenador')
);