CREATE TYPE "clinical_modality" AS ENUM('conventional', 'protocol_driven');--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "clinical_modality" "clinical_modality" DEFAULT 'protocol_driven' NOT NULL;--> statement-breakpoint
GRANT UPDATE (clinical_modality) ON patient TO app_role;
