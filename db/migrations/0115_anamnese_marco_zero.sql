CREATE TYPE "public"."anamnese_estado" AS ENUM('rascunho', 'validada');--> statement-breakpoint
CREATE TYPE "public"."anamnese_procedencia" AS ENUM('relatado_responsavel', 'observado_avaliador', 'registro_anterior');--> statement-breakpoint
CREATE TABLE "anamnese" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"estado" "anamnese_estado" DEFAULT 'rascunho' NOT NULL,
	"protocol_id" uuid,
	"nivel_entrada_sugerido" text,
	"sugestao_aceita" boolean,
	"observacoes" text,
	"complementa_anamnese_id" uuid,
	"criado_por" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"validada_por" uuid,
	"validada_em" timestamp with time zone,
	CONSTRAINT "anamnese_validada_coerente" CHECK (("anamnese"."estado" = 'validada') = ("anamnese"."validada_em" IS NOT NULL AND "anamnese"."validada_por" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "anamnese_alvo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anamnese_id" uuid NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"eixo" text NOT NULL,
	"descricao" text NOT NULL,
	"disciplina" text,
	"milestone_id" uuid,
	"nivel_ajuda_inicial" integer,
	"procedencia" "anamnese_procedencia" NOT NULL,
	"criterio_n" integer DEFAULT 3 NOT NULL,
	"criterio_m" integer DEFAULT 4 NOT NULL,
	"ciclo_revisao_semanas" integer DEFAULT 8 NOT NULL,
	"goal_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anamnese_alvo_goal_unique" UNIQUE("goal_id"),
	CONSTRAINT "anamnese_alvo_eixo_valido" CHECK ("anamnese_alvo"."eixo" IN (
        'comunicacao_expressiva','comunicacao_receptiva','interacao_social',
        'autonomia','regulacao','cognicao_academico'
      )),
	CONSTRAINT "anamnese_alvo_disciplina_valida" CHECK ("anamnese_alvo"."disciplina" IS NULL OR "anamnese_alvo"."disciplina" IN ('ABA','Fono','TO')),
	CONSTRAINT "anamnese_alvo_nivel_range" CHECK ("anamnese_alvo"."nivel_ajuda_inicial" IS NULL OR ("anamnese_alvo"."nivel_ajuda_inicial" BETWEEN 0 AND 20)),
	CONSTRAINT "anamnese_alvo_criterio_range" CHECK ("anamnese_alvo"."criterio_n" BETWEEN 1 AND 99 AND "anamnese_alvo"."criterio_m" BETWEEN 1 AND 99),
	CONSTRAINT "anamnese_alvo_ciclo_range" CHECK ("anamnese_alvo"."ciclo_revisao_semanas" BETWEEN 8 AND 12)
);
--> statement-breakpoint
ALTER TABLE "anamnese" ADD CONSTRAINT "anamnese_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anamnese" ADD CONSTRAINT "anamnese_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anamnese" ADD CONSTRAINT "anamnese_protocol_id_protocol_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocol"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anamnese" ADD CONSTRAINT "anamnese_criado_por_app_user_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anamnese" ADD CONSTRAINT "anamnese_validada_por_app_user_id_fk" FOREIGN KEY ("validada_por") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anamnese" ADD CONSTRAINT "anamnese_complementa_anamnese_id_anamnese_id_fk" FOREIGN KEY ("complementa_anamnese_id") REFERENCES "public"."anamnese"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anamnese_alvo" ADD CONSTRAINT "anamnese_alvo_anamnese_id_anamnese_id_fk" FOREIGN KEY ("anamnese_id") REFERENCES "public"."anamnese"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anamnese_alvo" ADD CONSTRAINT "anamnese_alvo_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anamnese_alvo" ADD CONSTRAINT "anamnese_alvo_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anamnese_alvo" ADD CONSTRAINT "anamnese_alvo_milestone_id_milestone_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestone"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anamnese_alvo" ADD CONSTRAINT "anamnese_alvo_goal_id_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_anamnese_patient" ON "anamnese" USING btree ("patient_id","criado_em" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_anamnese_clinic" ON "anamnese" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "idx_anamnese_vigente" ON "anamnese" USING btree ("patient_id","validada_em" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "anamnese"."estado" = 'validada';--> statement-breakpoint
CREATE INDEX "idx_anamnese_alvo_anamnese" ON "anamnese_alvo" USING btree ("anamnese_id");--> statement-breakpoint
CREATE INDEX "idx_anamnese_alvo_clinic" ON "anamnese_alvo" USING btree ("clinic_id");