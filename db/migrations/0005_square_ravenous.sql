CREATE TYPE "public"."audio_status_upload" AS ENUM('rascunho_local', 'pendente', 'confirmado', 'falhou');--> statement-breakpoint
CREATE TYPE "public"."extraction_estado" AS ENUM('sugerida', 'pendente_reprocessamento');--> statement-breakpoint
CREATE TYPE "public"."goal_estado" AS ENUM('rascunho', 'ativa', 'dominada', 'pausada', 'descontinuada');--> statement-breakpoint
CREATE TYPE "public"."milestone_tipo_estrutura" AS ENUM('marco_simples', 'marco_com_barreira', 'escore_composto', 'faixa_normativa');--> statement-breakpoint
CREATE TYPE "public"."session_note_tipo" AS ENUM('captura_rapida', 'nota_consolidada');--> statement-breakpoint
CREATE TYPE "public"."session_protocol_scope_origem" AS ENUM('inferido_disciplina', 'ajustado_manualmente');--> statement-breakpoint
CREATE TABLE "audio_capture" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"clinic_id" uuid NOT NULL,
	"status_upload" "audio_status_upload" DEFAULT 'rascunho_local' NOT NULL,
	"objeto_ref" text,
	"duracao_segundos" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"clinic_id" uuid NOT NULL,
	"estado" "extraction_estado" DEFAULT 'sugerida' NOT NULL,
	"subtipo" text NOT NULL,
	"trecho_fonte" text NOT NULL,
	"confianca" text NOT NULL,
	"justificativa_confianca" text,
	"inconsistente_com_historico" boolean DEFAULT false NOT NULL,
	"par_contraste_id" uuid,
	"payload" jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"clinic_id" uuid NOT NULL,
	"descricao" text NOT NULL,
	"estado" "goal_estado" DEFAULT 'rascunho' NOT NULL,
	"criterio_dominio" jsonb NOT NULL,
	"ciclo_revisao_semanas" integer DEFAULT 10 NOT NULL,
	"proxima_revisao_em" date,
	"criado_por" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_candidacy" (
	"goal_id" uuid PRIMARY KEY NOT NULL,
	"is_candidate_dominada" boolean DEFAULT false NOT NULL,
	"candidacy_since" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "goal_milestone_mapping" (
	"goal_id" uuid NOT NULL,
	"milestone_id" uuid NOT NULL,
	CONSTRAINT "goal_milestone_mapping_goal_id_milestone_id_pk" PRIMARY KEY("goal_id","milestone_id")
);
--> statement-breakpoint
CREATE TABLE "milestone" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protocol_id" uuid NOT NULL,
	"dominio_id" text NOT NULL,
	"nome" text NOT NULL,
	"nivel" text,
	"tipo_estrutura" "milestone_tipo_estrutura" NOT NULL,
	"estrutura" jsonb NOT NULL,
	"ordem" integer,
	CONSTRAINT "uq_milestone_protocol_dominio_nivel" UNIQUE NULLS NOT DISTINCT("protocol_id","dominio_id","nivel")
);
--> statement-breakpoint
CREATE TABLE "milestone_candidacy" (
	"patient_id" uuid NOT NULL,
	"milestone_id" uuid NOT NULL,
	"is_candidate" boolean DEFAULT false NOT NULL,
	"candidacy_since" timestamp with time zone,
	"evidence_count" integer DEFAULT 0 NOT NULL,
	"distinct_sessions" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "milestone_candidacy_patient_id_milestone_id_pk" PRIMARY KEY("patient_id","milestone_id")
);
--> statement-breakpoint
CREATE TABLE "session_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"clinic_id" uuid NOT NULL,
	"tipo" "session_note_tipo" NOT NULL,
	"texto" text NOT NULL,
	"autor_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_session_note_tipo" UNIQUE("session_id","tipo")
);
--> statement-breakpoint
CREATE TABLE "session_protocol_scope" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"protocol_id" uuid NOT NULL,
	"origem" "session_protocol_scope_origem" DEFAULT 'inferido_disciplina' NOT NULL,
	"ajustado_por" uuid,
	CONSTRAINT "uq_session_protocol_scope" UNIQUE("session_id","protocol_id")
);
--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "audio_capture" ADD CONSTRAINT "audio_capture_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_capture" ADD CONSTRAINT "audio_capture_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction" ADD CONSTRAINT "extraction_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction" ADD CONSTRAINT "extraction_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal" ADD CONSTRAINT "goal_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal" ADD CONSTRAINT "goal_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal" ADD CONSTRAINT "goal_criado_por_app_user_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_candidacy" ADD CONSTRAINT "goal_candidacy_goal_id_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_milestone_mapping" ADD CONSTRAINT "goal_milestone_mapping_goal_id_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_milestone_mapping" ADD CONSTRAINT "goal_milestone_mapping_milestone_id_milestone_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestone"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone" ADD CONSTRAINT "milestone_protocol_id_protocol_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocol"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_candidacy" ADD CONSTRAINT "milestone_candidacy_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_candidacy" ADD CONSTRAINT "milestone_candidacy_milestone_id_milestone_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestone"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_note" ADD CONSTRAINT "session_note_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_note" ADD CONSTRAINT "session_note_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_note" ADD CONSTRAINT "session_note_autor_id_app_user_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_protocol_scope" ADD CONSTRAINT "session_protocol_scope_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_protocol_scope" ADD CONSTRAINT "session_protocol_scope_protocol_id_protocol_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocol"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_protocol_scope" ADD CONSTRAINT "session_protocol_scope_ajustado_por_app_user_id_fk" FOREIGN KEY ("ajustado_por") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audio_capture_session" ON "audio_capture" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_extraction_session" ON "extraction" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_goal_patient_estado" ON "goal" USING btree ("patient_id","estado");--> statement-breakpoint
CREATE INDEX "idx_milestone_protocol_dominio" ON "milestone" USING btree ("protocol_id","dominio_id");--> statement-breakpoint
CREATE INDEX "idx_session_note_session" ON "session_note" USING btree ("session_id");