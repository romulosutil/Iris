CREATE TABLE "patient_alvo_disciplina" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"disciplina" text NOT NULL,
	"horas_alvo_semana" numeric(4, 1) NOT NULL,
	"vigencia_inicio" date NOT NULL,
	"vigencia_fim" date,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_alvo_disciplina_vigencia" CHECK ("patient_alvo_disciplina"."vigencia_fim" IS NULL OR "patient_alvo_disciplina"."vigencia_fim" >= "patient_alvo_disciplina"."vigencia_inicio")
);
--> statement-breakpoint
ALTER TABLE "patient_alvo_disciplina" ADD CONSTRAINT "patient_alvo_disciplina_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_alvo_disciplina" ADD CONSTRAINT "patient_alvo_disciplina_patient_fk" FOREIGN KEY ("patient_id","clinic_id") REFERENCES "public"."patient"("id","clinic_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_patient_alvo_vigente" ON "patient_alvo_disciplina" USING btree ("patient_id","disciplina") WHERE "patient_alvo_disciplina"."vigencia_fim" IS NULL;