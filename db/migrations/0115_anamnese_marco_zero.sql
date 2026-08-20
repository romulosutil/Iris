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
CREATE INDEX "idx_anamnese_alvo_clinic" ON "anamnese_alvo" USING btree ("clinic_id");--> statement-breakpoint

-- A partir daqui é escrito à mão (T03/#407).
--
-- GRANT vs. definer: rascunho de `anamnese` é editável por app_role sob RLS
-- (mesmo padrão de `instrumento_aplicacao`/0113:29-35 — não há função
-- SECURITY DEFINER no caminho de rascunho). A transição para 'validada' NÃO
-- é: só acontece dentro de `app_validar_anamnese` (T05, SECURITY DEFINER,
-- roda como owner). O GRANT de UPDATE é escopado por COLUNA — `estado`,
-- `validada_em`, `validada_por` ficam FORA do GRANT — e essa ausência é o
-- mecanismo físico do append-only (D-F), não disciplina de código. Padrão
-- `consent` (schema.ts:456-470), e não o de `instrumento_aplicacao`
-- (0113:35), que concede UPDATE amplo porque lá não há campo de append-only.
GRANT SELECT, INSERT, DELETE ON "anamnese" TO app_role;--> statement-breakpoint
GRANT UPDATE ("protocol_id", "nivel_entrada_sugerido", "sugestao_aceita", "observacoes")
  ON "anamnese" TO app_role;--> statement-breakpoint

-- `anamnese_alvo` não carrega estado próprio de append-only — o gate é o
-- estado da anamnese-pai, aplicado pelo helper `app_anamnese_em_rascunho`
-- abaixo, não por GRANT de coluna. GRANT de tabela inteira é seguro aqui.
GRANT SELECT, INSERT, UPDATE, DELETE ON "anamnese_alvo" TO app_role;--> statement-breakpoint

ALTER TABLE "anamnese" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "anamnese" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "anamnese_alvo" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "anamnese_alvo" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Isolamento por tenant via `app_clinic_id_exigido()` (D16/#229): resolver o
-- tenant com `current_setting('app.clinic_id')::uuid` cru estoura 42704/22P02
-- dentro da policy sem nomear o tenant. Predicado copiado literal de
-- `instrumento_aplicacao` (0113:45-69), que por sua vez copiou de
-- `tcc_rpd_entry` (0103:33-67): coordenador OU membro da equipe; delete
-- restrito a coordenador. Divergência deliberada: UPDATE e DELETE aqui
-- exigem `estado = 'rascunho'` (D-F, append-only) — `instrumento_aplicacao`
-- não tem esse campo e por isso não tem essa cláusula.
CREATE POLICY anamnese_select ON anamnese FOR SELECT TO app_role USING (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (current_setting('app.user_role', true) = 'coordenador') OR app_is_on_team(patient_id)
  )
);--> statement-breakpoint

CREATE POLICY anamnese_insert ON anamnese FOR INSERT TO app_role WITH CHECK (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (current_setting('app.user_role', true) = 'coordenador') OR app_is_on_team(patient_id)
  ) AND estado = 'rascunho'
);--> statement-breakpoint

CREATE POLICY anamnese_update ON anamnese FOR UPDATE TO app_role USING (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (current_setting('app.user_role', true) = 'coordenador') OR app_is_on_team(patient_id)
  ) AND estado = 'rascunho'
) WITH CHECK (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (current_setting('app.user_role', true) = 'coordenador') OR app_is_on_team(patient_id)
  ) AND estado = 'rascunho'
);--> statement-breakpoint

CREATE POLICY anamnese_delete ON anamnese FOR DELETE TO app_role USING (
  (clinic_id = app_clinic_id_exigido())
  AND (current_setting('app.user_role', true) = 'coordenador')
  AND estado = 'rascunho'
);--> statement-breakpoint

-- Delegar a leitura do estado da anamnese-pai a uma função evita subselect na
-- policy e mantém o predicado auditável em `pg_proc`. Tenant resolvido por
-- `app_clinic_id_exigido()` DENTRO da função (CLAUDE.md ponto 6) — o guard
-- `db/tests/clinic-id-helper-rls.int.test.ts` varre pg_policies + pg_proc +
-- pg_views e quebra o CI se aparecer cast cru ou `app_clinic_id_atual()` em
-- predicado de isolamento.
CREATE OR REPLACE FUNCTION public.app_anamnese_em_rascunho(p_anamnese uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM anamnese a
    WHERE a.id = p_anamnese
      AND a.clinic_id = app_clinic_id_exigido()
      AND a.estado = 'rascunho'
  );
$function$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_anamnese_em_rascunho(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_anamnese_em_rascunho(uuid) TO app_role;--> statement-breakpoint

-- `anamnese_alvo` recebe as 4 policies com o mesmo predicado, sobre as suas
-- próprias colunas `clinic_id`/`patient_id` (denormalizadas de propósito,
-- ver design.md), mais `app_anamnese_em_rascunho(anamnese_id)` no
-- INSERT/UPDATE/DELETE — NÃO no SELECT: alvo de anamnese já validada
-- continua legível.
CREATE POLICY anamnese_alvo_select ON anamnese_alvo FOR SELECT TO app_role USING (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (current_setting('app.user_role', true) = 'coordenador') OR app_is_on_team(patient_id)
  )
);--> statement-breakpoint

CREATE POLICY anamnese_alvo_insert ON anamnese_alvo FOR INSERT TO app_role WITH CHECK (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (current_setting('app.user_role', true) = 'coordenador') OR app_is_on_team(patient_id)
  ) AND app_anamnese_em_rascunho(anamnese_id)
);--> statement-breakpoint

CREATE POLICY anamnese_alvo_update ON anamnese_alvo FOR UPDATE TO app_role USING (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (current_setting('app.user_role', true) = 'coordenador') OR app_is_on_team(patient_id)
  ) AND app_anamnese_em_rascunho(anamnese_id)
) WITH CHECK (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (current_setting('app.user_role', true) = 'coordenador') OR app_is_on_team(patient_id)
  ) AND app_anamnese_em_rascunho(anamnese_id)
);--> statement-breakpoint

CREATE POLICY anamnese_alvo_delete ON anamnese_alvo FOR DELETE TO app_role USING (
  (clinic_id = app_clinic_id_exigido())
  AND (current_setting('app.user_role', true) = 'coordenador')
  AND app_anamnese_em_rascunho(anamnese_id)
);