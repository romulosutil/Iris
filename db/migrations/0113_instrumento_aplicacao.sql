CREATE TYPE "public"."instrumento_fonte_escore" AS ENUM('paciente_informou', 'terapeuta_calculou_na_sessao', 'nao_informado');--> statement-breakpoint
CREATE TYPE "public"."instrumento_tipo" AS ENUM('phq9', 'gad7');--> statement-breakpoint
CREATE TABLE "instrumento_aplicacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"session_id" uuid,
	"protocol_id" text NOT NULL,
	"tipo_instrumento" "instrumento_tipo" NOT NULL,
	"escore_total" integer,
	"fonte_do_escore" "instrumento_fonte_escore" NOT NULL,
	"respostas_por_item" jsonb NOT NULL,
	"item_9_valor" integer,
	"item_risco_positivo" boolean,
	"criado_por" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instrumento_aplicacao_item9_range" CHECK ("instrumento_aplicacao"."item_9_valor" IS NULL OR ("instrumento_aplicacao"."item_9_valor" BETWEEN 0 AND 3))
);
--> statement-breakpoint
ALTER TABLE "instrumento_aplicacao" ADD CONSTRAINT "instrumento_aplicacao_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instrumento_aplicacao" ADD CONSTRAINT "instrumento_aplicacao_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instrumento_aplicacao" ADD CONSTRAINT "instrumento_aplicacao_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instrumento_aplicacao" ADD CONSTRAINT "instrumento_aplicacao_criado_por_app_user_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_instrumento_aplicacao_patient" ON "instrumento_aplicacao" USING btree ("patient_id","criado_em" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_instrumento_aplicacao_clinic" ON "instrumento_aplicacao" USING btree ("clinic_id");--> statement-breakpoint

-- A partir daqui é escrito à mão (T2/#393).
--
-- GRANT: a única superfície de escrita OFICIAL de `instrumento_aplicacao` é o
-- form manual (`salvarInstrumentoAplicacao`, T4) — NÃO existe função
-- SECURITY DEFINER no caminho de escrita (diferente de `alerta_risco_clinico`,
-- que é definer-only). Por isso `app_role` recebe GRANT direto sob RLS, mesmo
-- padrão de `tcc_rpd_entry` (0103): SELECT/INSERT/UPDATE/DELETE normais,
-- gateados pelas policies abaixo, não por um definer.
GRANT SELECT, INSERT, UPDATE, DELETE ON "instrumento_aplicacao" TO app_role;--> statement-breakpoint

ALTER TABLE "instrumento_aplicacao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "instrumento_aplicacao" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Isolamento por tenant via `app_clinic_id_exigido()` (D16/#229): resolver o
-- tenant com `current_setting('app.clinic_id')::uuid` cru estoura 42704/22P02
-- dentro da policy sem nomear o tenant. Predicado copiado literal de
-- `tcc_rpd_entry` (0103:42-66) — mesmo shape (coordenador OU membro da
-- equipe), delete restrito a coordenador.
CREATE POLICY instrumento_aplicacao_select ON instrumento_aplicacao FOR SELECT TO app_role USING (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (current_setting('app.user_role', true) = 'coordenador') OR app_is_on_team(patient_id)
  )
);--> statement-breakpoint

CREATE POLICY instrumento_aplicacao_insert ON instrumento_aplicacao FOR INSERT TO app_role WITH CHECK (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (current_setting('app.user_role', true) = 'coordenador') OR app_is_on_team(patient_id)
  )
);--> statement-breakpoint

CREATE POLICY instrumento_aplicacao_update ON instrumento_aplicacao FOR UPDATE TO app_role USING (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (current_setting('app.user_role', true) = 'coordenador') OR app_is_on_team(patient_id)
  )
) WITH CHECK (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (current_setting('app.user_role', true) = 'coordenador') OR app_is_on_team(patient_id)
  )
);--> statement-breakpoint

CREATE POLICY instrumento_aplicacao_delete ON instrumento_aplicacao FOR DELETE TO app_role USING (
  (clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role', true) = 'coordenador')
);--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────
-- T3/#393 — `instrumento_item_texto`: vaso vazio para o texto PT-BR dos
-- itens do PHQ-9/GAD-7. Conteúdo é licenciado (Pfizer), pendente de
-- confirmação jurídica: esta migração NÃO insere nenhuma linha com texto
-- real, e a coluna `texto` fica NULL para todos os itens até uma migração
-- futura, depois da licença confirmada. `clinic_id` nullable permite
-- override por clínica no futuro; #393 não popula nada, nem clinic-scoped
-- nem global. DDL abaixo saiu de `pnpm db:generate` (diff contra o snapshot
-- 0113 já com `instrumento_aplicacao`).
CREATE TABLE "instrumento_item_texto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo_instrumento" "instrumento_tipo" NOT NULL,
	"numero_item" integer NOT NULL,
	"texto" text,
	"clinic_id" uuid
);
--> statement-breakpoint
ALTER TABLE "instrumento_item_texto" ADD CONSTRAINT "instrumento_item_texto_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_instrumento_item_texto_tipo" ON "instrumento_item_texto" USING btree ("tipo_instrumento","numero_item");--> statement-breakpoint

-- A partir daqui é escrito à mão (T3/#393).
--
-- RLS mínima e deliberadamente diferente do padrão tenant-scoped acima:
-- conteúdo é compartilhado/global (regulatório), não dado de paciente por
-- clínica, então não há predicado de `clinic_id`/equipe. Leitura liberada
-- para qualquer `app_role` autenticado. SEM GRANT de INSERT/UPDATE/DELETE
-- para `app_role` — o conteúdo só entra por uma migração futura (escrita
-- direta pela role dona/`iris`, fora do app), quando a licença Pfizer for
-- confirmada. Enquanto isso a tabela existe vazia (0 linhas).
ALTER TABLE "instrumento_item_texto" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "instrumento_item_texto" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

GRANT SELECT ON "instrumento_item_texto" TO app_role;--> statement-breakpoint

CREATE POLICY instrumento_item_texto_select ON instrumento_item_texto FOR SELECT TO app_role USING (true);