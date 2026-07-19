CREATE TYPE "public"."report_status" AS ENUM('rascunho', 'revisado', 'exportado');--> statement-breakpoint
CREATE TYPE "public"."report_tipo" AS ENUM('familia', 'convenio_bruto', 'convenio_narrativo', 'avaliativo_interdisciplinar');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"ator_id" uuid NOT NULL,
	"acao" text NOT NULL,
	"entidade" text NOT NULL,
	"entidade_id" uuid NOT NULL,
	"patient_id" uuid,
	"detalhe" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"tipo" "report_tipo" NOT NULL,
	"periodo_inicio" date NOT NULL,
	"periodo_fim" date NOT NULL,
	"status" "report_status" DEFAULT 'rascunho' NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_versao" integer DEFAULT 1 NOT NULL,
	"gerado_por_ia" boolean DEFAULT false NOT NULL,
	"pdf_hash" text,
	"deletado_em" timestamp with time zone,
	"revisado_por" uuid,
	"exportado_por" uuid,
	"exportado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_periodo" CHECK ("report"."periodo_fim" >= "report"."periodo_inicio"),
	CONSTRAINT "report_exportado_congelado" CHECK ("report"."status" <> 'exportado' OR ("report"."exportado_por" IS NOT NULL AND "report"."exportado_em" IS NOT NULL AND "report"."pdf_hash" IS NOT NULL)),
	CONSTRAINT "report_bruto_sem_ia" CHECK ("report"."tipo" <> 'convenio_bruto' OR "report"."gerado_por_ia" = false)
);
--> statement-breakpoint
CREATE TABLE "report_pdf" (
	"report_id" uuid PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL,
	"hash" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "disciplina" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_ator_id_app_user_id_fk" FOREIGN KEY ("ator_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_revisado_por_app_user_id_fk" FOREIGN KEY ("revisado_por") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_exportado_por_app_user_id_fk" FOREIGN KEY ("exportado_por") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_pdf" ADD CONSTRAINT "report_pdf_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_log_patient" ON "audit_log" USING btree ("patient_id","criado_em" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_report_patient" ON "report" USING btree ("patient_id","criado_em" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_report_clinic_tipo" ON "report" USING btree ("clinic_id","tipo");--> statement-breakpoint
CREATE INDEX "idx_report_vigente" ON "report" USING btree ("patient_id","criado_em" DESC NULLS LAST) WHERE "report"."deletado_em" IS NULL;