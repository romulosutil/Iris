CREATE TYPE "public"."consent_tipo" AS ENUM('tratamento_dados_menor', 'uso_ia_processamento', 'exportacao_relatorios');--> statement-breakpoint
CREATE TYPE "public"."user_role_tipo" AS ENUM('terapeuta', 'coordenador', 'admin_recepcao');--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "auth_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "care_team_membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"disciplina" text NOT NULL,
	"papel_na_equipe" text NOT NULL,
	"vigencia_inicio" date DEFAULT now() NOT NULL,
	"vigencia_fim" date,
	"responsavel_tecnico_id" uuid,
	CONSTRAINT "ctm_papel" CHECK ("care_team_membership"."papel_na_equipe" IN ('terapeuta_referencia','coordenador_referencia','substituto')),
	CONSTRAINT "ctm_nao_auto_supervisao" CHECK ("care_team_membership"."responsavel_tecnico_id" IS NULL OR "care_team_membership"."responsavel_tecnico_id" <> "care_team_membership"."user_id")
);
--> statement-breakpoint
CREATE TABLE "clinic" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"responsavel_conta_id" uuid,
	"politica_retencao_meses" integer,
	"politica_retencao_config" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"tipo" "consent_tipo" NOT NULL,
	"responsavel_signatario" text NOT NULL,
	"versao_termo" text NOT NULL,
	"assinado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"nascimento" date,
	"responsavel_contato" text,
	"escola" text,
	"convenio" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_clinical_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"diagnostico" text,
	"medicacoes" text,
	"alergias" text,
	"convulsoes" text,
	"contatos_emergencia" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_clinical_profile_patient_id_unique" UNIQUE("patient_id")
);
--> statement-breakpoint
CREATE TABLE "patient_protocol" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"protocol_id" uuid NOT NULL,
	"ativado_em" date DEFAULT now() NOT NULL,
	"desativado_em" date,
	"ativado_por" uuid NOT NULL,
	CONSTRAINT "patient_protocol_vigencia" CHECK ("patient_protocol"."desativado_em" IS NULL OR "patient_protocol"."desativado_em" >= "patient_protocol"."ativado_em")
);
--> statement-breakpoint
CREATE TABLE "protocol" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"versao" text,
	"disciplina" text NOT NULL,
	"familia" text NOT NULL,
	"taxonomia_ajuda" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protocol_familia_catalogo" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"descricao" text
);
--> statement-breakpoint
CREATE TABLE "user_role" (
	"user_id" uuid NOT NULL,
	"clinic_id" uuid NOT NULL,
	"papel" "user_role_tipo" NOT NULL,
	CONSTRAINT "user_role_user_id_clinic_id_papel_pk" PRIMARY KEY("user_id","clinic_id","papel")
);
--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_team_membership" ADD CONSTRAINT "care_team_membership_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_team_membership" ADD CONSTRAINT "care_team_membership_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_team_membership" ADD CONSTRAINT "care_team_membership_responsavel_tecnico_id_app_user_id_fk" FOREIGN KEY ("responsavel_tecnico_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic" ADD CONSTRAINT "clinic_responsavel_conta_id_app_user_id_fk" FOREIGN KEY ("responsavel_conta_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent" ADD CONSTRAINT "consent_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient" ADD CONSTRAINT "patient_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_clinical_profile" ADD CONSTRAINT "patient_clinical_profile_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_protocol" ADD CONSTRAINT "patient_protocol_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_protocol" ADD CONSTRAINT "patient_protocol_protocol_id_protocol_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocol"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_protocol" ADD CONSTRAINT "patient_protocol_ativado_por_app_user_id_fk" FOREIGN KEY ("ativado_por") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocol" ADD CONSTRAINT "protocol_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocol" ADD CONSTRAINT "protocol_familia_protocol_familia_catalogo_id_fk" FOREIGN KEY ("familia") REFERENCES "public"."protocol_familia_catalogo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ctm_patient_vigente" ON "care_team_membership" USING btree ("patient_id") WHERE "care_team_membership"."vigencia_fim" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_ctm_user_vigente" ON "care_team_membership" USING btree ("user_id") WHERE "care_team_membership"."vigencia_fim" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_patient_clinic" ON "patient" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "idx_patient_protocol_ativo" ON "patient_protocol" USING btree ("patient_id") WHERE "patient_protocol"."desativado_em" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_protocol_familia" ON "protocol" USING btree ("familia");