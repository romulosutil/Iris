CREATE TYPE "public"."agendamento_recorrente_status" AS ENUM('ativo', 'encerrado');--> statement-breakpoint
CREATE TABLE "agendamento_recorrente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"terapeuta_id" uuid NOT NULL,
	"disciplina" text NOT NULL,
	"dia_semana" smallint NOT NULL,
	"hora_inicio" time NOT NULL,
	"duracao_min" integer NOT NULL,
	"vigencia_inicio" date NOT NULL,
	"vigencia_fim" date,
	"status" "agendamento_recorrente_status" DEFAULT 'ativo' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agendamento_recorrente_dia_semana" CHECK ("agendamento_recorrente"."dia_semana" BETWEEN 0 AND 6),
	CONSTRAINT "agendamento_recorrente_duracao" CHECK ("agendamento_recorrente"."duracao_min" > 0),
	CONSTRAINT "agendamento_recorrente_vigencia" CHECK ("agendamento_recorrente"."vigencia_fim" IS NULL OR "agendamento_recorrente"."vigencia_fim" >= "agendamento_recorrente"."vigencia_inicio")
);
--> statement-breakpoint
ALTER TABLE "agendamento_recorrente" ADD CONSTRAINT "agendamento_recorrente_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendamento_recorrente" ADD CONSTRAINT "agendamento_recorrente_terapeuta_id_app_user_id_fk" FOREIGN KEY ("terapeuta_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendamento_recorrente" ADD CONSTRAINT "agendamento_recorrente_patient_fk" FOREIGN KEY ("patient_id","clinic_id") REFERENCES "public"."patient"("id","clinic_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agrecorrente_terapeuta_ativo" ON "agendamento_recorrente" USING btree ("terapeuta_id","dia_semana") WHERE "agendamento_recorrente"."status" = 'ativo';--> statement-breakpoint
CREATE INDEX "idx_agrecorrente_patient_ativo" ON "agendamento_recorrente" USING btree ("patient_id","disciplina") WHERE "agendamento_recorrente"."status" = 'ativo';