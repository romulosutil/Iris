CREATE TYPE "public"."alerta_status" AS ENUM('reconhecido', 'resolvido', 'descartado');--> statement-breakpoint
CREATE TYPE "public"."alerta_tipo" AS ENUM('estagnacao', 'regressao', 'faltas_excessivas');--> statement-breakpoint
CREATE TABLE "alerta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"tipo" "alerta_tipo" NOT NULL,
	"status" "alerta_status" NOT NULL,
	"chave_natural" text NOT NULL,
	"goal_id" uuid,
	"protocol_id" uuid,
	"detalhe" jsonb NOT NULL,
	"nota" text,
	"motivo" text,
	"criado_por" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"deletado_em" timestamp with time zone,
	CONSTRAINT "alerta_locator" CHECK (("alerta"."tipo" = 'faltas_excessivas' AND "alerta"."goal_id" IS NULL AND "alerta"."protocol_id" IS NULL)
       OR ("alerta"."tipo" IN ('estagnacao','regressao') AND "alerta"."goal_id" IS NOT NULL AND "alerta"."protocol_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN "faltas_limiar" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN "faltas_janela_semanas" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "alerta" ADD CONSTRAINT "alerta_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerta" ADD CONSTRAINT "alerta_goal_id_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerta" ADD CONSTRAINT "alerta_protocol_id_protocol_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocol"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerta" ADD CONSTRAINT "alerta_criado_por_app_user_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerta" ADD CONSTRAINT "alerta_atualizado_por_app_user_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerta" ADD CONSTRAINT "alerta_patient_fk" FOREIGN KEY ("patient_id","clinic_id") REFERENCES "public"."patient"("id","clinic_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alerta_chave_uk" ON "alerta" USING btree ("chave_natural") WHERE "alerta"."deletado_em" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_alerta_fila" ON "alerta" USING btree ("clinic_id","status") WHERE "alerta"."deletado_em" IS NULL;