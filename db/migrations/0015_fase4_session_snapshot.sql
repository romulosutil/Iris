CREATE TABLE "session_snapshot" (
	"patient_id" uuid NOT NULL,
	"session_numero" integer NOT NULL,
	"repertorio_state" jsonb NOT NULL,
	"segmentacao" jsonb NOT NULL,
	"gerado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_snapshot_patient_id_session_numero_pk" PRIMARY KEY("patient_id","session_numero")
);
--> statement-breakpoint
ALTER TABLE "session_snapshot" ADD CONSTRAINT "session_snapshot_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_session_snapshot_patient" ON "session_snapshot" USING btree ("patient_id","session_numero" DESC NULLS LAST);