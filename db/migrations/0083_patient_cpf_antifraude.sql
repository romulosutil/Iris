ALTER TABLE "patient" ADD COLUMN "cpf" text;--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "responsavel_cpf" text;--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "cpf_hash" text;--> statement-breakpoint
CREATE INDEX "idx_patient_clinic_responsavel_cpf" ON "patient" USING btree ("clinic_id","responsavel_cpf");--> statement-breakpoint
CREATE INDEX "idx_patient_cpf_hash" ON "patient" USING btree ("cpf_hash");--> statement-breakpoint
ALTER TABLE "patient" ADD CONSTRAINT "uq_patient_clinic_cpf" UNIQUE("clinic_id","cpf");