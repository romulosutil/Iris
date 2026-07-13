CREATE TYPE "public"."evidence_revision_acao" AS ENUM('confirmar', 'reclassificar', 'invalidar');--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extraction_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"session_numero" integer NOT NULL,
	"alvo_ordinal" integer NOT NULL,
	"protocol_slug" text,
	"dominio_id" text,
	"goal_ref" text,
	"protocol_id" uuid,
	"goal_id" uuid,
	"milestone_id" uuid,
	"classificacao_original" jsonb NOT NULL,
	"aprovado_por" uuid NOT NULL,
	"aprovado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_evidence_alvo" UNIQUE("extraction_id","alvo_ordinal")
);
--> statement-breakpoint
CREATE TABLE "evidence_query" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid NOT NULL,
	"coordenador_id" uuid NOT NULL,
	"pergunta" text NOT NULL,
	"resposta_texto" text,
	"resultante_evidence_revision_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"respondido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "evidence_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid NOT NULL,
	"acao" "evidence_revision_acao" NOT NULL,
	"classificacao_anterior" jsonb NOT NULL,
	"classificacao_nova" jsonb,
	"justificativa" text NOT NULL,
	"autor_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_extraction_id_extraction_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."extraction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_protocol_id_protocol_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocol"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_goal_id_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_milestone_id_milestone_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestone"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_aprovado_por_app_user_id_fk" FOREIGN KEY ("aprovado_por") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_query" ADD CONSTRAINT "evidence_query_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_query" ADD CONSTRAINT "evidence_query_coordenador_id_app_user_id_fk" FOREIGN KEY ("coordenador_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_query" ADD CONSTRAINT "evidence_query_resultante_evidence_revision_id_evidence_revision_id_fk" FOREIGN KEY ("resultante_evidence_revision_id") REFERENCES "public"."evidence_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_revision" ADD CONSTRAINT "evidence_revision_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_revision" ADD CONSTRAINT "evidence_revision_autor_id_app_user_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_evidence_patient_session" ON "evidence" USING btree ("patient_id","session_numero");--> statement-breakpoint
CREATE INDEX "idx_evidence_goal" ON "evidence" USING btree ("goal_id") WHERE "evidence"."goal_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_evidence_milestone" ON "evidence" USING btree ("milestone_id") WHERE "evidence"."milestone_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_evidence_revision_evidence" ON "evidence_revision" USING btree ("evidence_id","criado_em" DESC NULLS LAST);