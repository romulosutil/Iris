CREATE TYPE "public"."bloqueio_escopo" AS ENUM('clinica', 'terapeuta', 'paciente');--> statement-breakpoint
CREATE TABLE "bloqueio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"escopo" "bloqueio_escopo" NOT NULL,
	"terapeuta_id" uuid,
	"patient_id" uuid,
	"data_inicio" date NOT NULL,
	"data_fim" date NOT NULL,
	"motivo" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bloqueio_intervalo" CHECK ("bloqueio"."data_fim" >= "bloqueio"."data_inicio"),
	CONSTRAINT "bloqueio_escopo_alvo" CHECK (("bloqueio"."escopo" = 'clinica'   AND "bloqueio"."terapeuta_id" IS NULL AND "bloqueio"."patient_id" IS NULL)
       OR ("bloqueio"."escopo" = 'terapeuta' AND "bloqueio"."terapeuta_id" IS NOT NULL AND "bloqueio"."patient_id" IS NULL)
       OR ("bloqueio"."escopo" = 'paciente'  AND "bloqueio"."patient_id" IS NOT NULL AND "bloqueio"."terapeuta_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "bloqueio" ADD CONSTRAINT "bloqueio_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloqueio" ADD CONSTRAINT "bloqueio_terapeuta_id_app_user_id_fk" FOREIGN KEY ("terapeuta_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloqueio" ADD CONSTRAINT "bloqueio_patient_fk" FOREIGN KEY ("patient_id","clinic_id") REFERENCES "public"."patient"("id","clinic_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_bloqueio_clinic_periodo" ON "bloqueio" USING btree ("clinic_id","data_inicio","data_fim");