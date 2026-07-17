CREATE TABLE "janela_trabalho" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"terapeuta_id" uuid NOT NULL,
	"dia_semana" smallint NOT NULL,
	"hora_inicio" time NOT NULL,
	"hora_fim" time NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "janela_trabalho_dia_semana" CHECK ("janela_trabalho"."dia_semana" BETWEEN 0 AND 6),
	CONSTRAINT "janela_trabalho_faixa" CHECK ("janela_trabalho"."hora_fim" > "janela_trabalho"."hora_inicio")
);
--> statement-breakpoint
ALTER TABLE "janela_trabalho" ADD CONSTRAINT "janela_trabalho_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "janela_trabalho" ADD CONSTRAINT "janela_trabalho_terapeuta_id_app_user_id_fk" FOREIGN KEY ("terapeuta_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_janela_terapeuta" ON "janela_trabalho" USING btree ("terapeuta_id","dia_semana");