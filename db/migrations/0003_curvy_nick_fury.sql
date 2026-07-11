CREATE TYPE "public"."session_estado" AS ENUM('agendada', 'presente', 'realizada', 'falta', 'cancelada');--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"terapeuta_id" uuid NOT NULL,
	"agendada_para" timestamp with time zone NOT NULL,
	"estado" "session_estado" DEFAULT 'agendada' NOT NULL,
	"check_in_em" timestamp with time zone,
	"numero_sequencial_paciente" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_terapeuta_id_app_user_id_fk" FOREIGN KEY ("terapeuta_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_session_clinic_dia" ON "session" USING btree ("clinic_id","agendada_para");--> statement-breakpoint
CREATE INDEX "idx_session_terapeuta_dia" ON "session" USING btree ("terapeuta_id","agendada_para");