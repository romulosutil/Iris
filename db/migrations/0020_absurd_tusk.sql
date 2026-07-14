ALTER TYPE "public"."extraction_estado" ADD VALUE 'erro_validacao';--> statement-breakpoint
ALTER TABLE "extraction" ADD COLUMN "versao" integer DEFAULT 1 NOT NULL;