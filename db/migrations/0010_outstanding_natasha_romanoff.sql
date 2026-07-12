CREATE TYPE "public"."extraction_confianca" AS ENUM('alta', 'media', 'baixa');--> statement-breakpoint
CREATE TYPE "public"."extraction_subtipo" AS ENUM('evidencia', 'registro_abc', 'ausencia_comportamento', 'cadeia', 'preferencia_reforcador', 'pendente');--> statement-breakpoint
ALTER TYPE "public"."extraction_estado" ADD VALUE 'aprovada';--> statement-breakpoint
ALTER TYPE "public"."extraction_estado" ADD VALUE 'editada';--> statement-breakpoint
ALTER TYPE "public"."extraction_estado" ADD VALUE 'descartada';--> statement-breakpoint
ALTER TABLE "extraction" ALTER COLUMN "subtipo" SET DATA TYPE "public"."extraction_subtipo" USING "subtipo"::"public"."extraction_subtipo";--> statement-breakpoint
ALTER TABLE "extraction" ALTER COLUMN "confianca" SET DATA TYPE "public"."extraction_confianca" USING "confianca"::"public"."extraction_confianca";--> statement-breakpoint
ALTER TABLE "extraction" ADD COLUMN "revisado_por" uuid;--> statement-breakpoint
ALTER TABLE "extraction" ADD COLUMN "revisado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "extraction" ADD CONSTRAINT "extraction_revisado_por_app_user_id_fk" FOREIGN KEY ("revisado_por") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;