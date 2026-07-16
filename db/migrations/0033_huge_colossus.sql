CREATE TYPE "public"."session_modalidade" AS ENUM('presencial', 'online');--> statement-breakpoint
CREATE TYPE "public"."session_tipo" AS ENUM('terapia', 'avaliacao', 'devolutiva', 'reuniao_pais', 'outro');--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "recorrente_id" uuid;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "disciplina" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "duracao_min" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "justificada" boolean;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "modalidade" "session_modalidade" DEFAULT 'presencial' NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "tipo" "session_tipo" DEFAULT 'terapia' NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "atendido_por_id" uuid;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "reposta_de" uuid;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_atendido_por_id_app_user_id_fk" FOREIGN KEY ("atendido_por_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_reposta_de_fk" FOREIGN KEY ("reposta_de") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_session_recorrente_agendada" ON "session" USING btree ("recorrente_id","agendada_para") WHERE "session"."recorrente_id" IS NOT NULL;