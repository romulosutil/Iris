CREATE TYPE "public"."asr_status" AS ENUM('nao_solicitado', 'na_fila', 'transcrevendo', 'transcrito', 'falhou');--> statement-breakpoint
ALTER TABLE "audio_capture" ADD COLUMN "lote_id" uuid;--> statement-breakpoint
ALTER TABLE "audio_capture" ADD COLUMN "ordem" integer;--> statement-breakpoint
ALTER TABLE "audio_capture" ADD COLUMN "asr_status" "asr_status" DEFAULT 'nao_solicitado' NOT NULL;--> statement-breakpoint
ALTER TABLE "audio_capture" ADD COLUMN "transcricao_texto" text;--> statement-breakpoint
ALTER TABLE "audio_capture" ADD COLUMN "transcrito_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "audio_capture" ADD COLUMN "tentativas" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_audio_capture_asr_fila" ON "audio_capture" USING btree ("asr_status","criado_em") WHERE "audio_capture"."asr_status" = 'na_fila';--> statement-breakpoint
CREATE INDEX "idx_audio_capture_lote" ON "audio_capture" USING btree ("lote_id");--> statement-breakpoint
-- Edição à mão (não toca o snapshot): `audio_capture` tem UPDATE concedido
-- coluna a coluna desde a 0006 — coluna nova sem GRANT dá
-- "permission denied for table audio_capture" na escrita do app.
GRANT UPDATE (lote_id, ordem, asr_status, transcricao_texto, transcrito_em, tentativas) ON audio_capture TO app_role;