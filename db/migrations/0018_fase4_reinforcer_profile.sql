CREATE TYPE "public"."reinforcer_valencia" AS ENUM('alta', 'baixa', 'saciado');--> statement-breakpoint
CREATE TABLE "reinforcer_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extraction_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"session_numero" integer NOT NULL,
	"item_atividade" text NOT NULL,
	"valencia" "reinforcer_valencia" NOT NULL,
	"registrado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_reinforcer_profile_extraction_item" UNIQUE("extraction_id","item_atividade")
);
--> statement-breakpoint
ALTER TABLE "reinforcer_profile" ADD CONSTRAINT "reinforcer_profile_extraction_id_extraction_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."extraction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reinforcer_profile" ADD CONSTRAINT "reinforcer_profile_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reinforcer_profile" ADD CONSTRAINT "reinforcer_profile_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_reinforcer_profile_patient_session" ON "reinforcer_profile" USING btree ("patient_id","session_numero" DESC NULLS LAST);