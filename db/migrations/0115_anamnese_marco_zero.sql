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
        'comunicacao_expressiva','comunicacao_receptiva','social_brincar',
        'cognicao_aprendizado','autonomia_motor','regulacao_barreiras'
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
);--> statement-breakpoint

-- #407/T05 — `app_validar_anamnese`: única superfície que grava
-- `session_snapshot` com `session_numero = 0` e move a anamnese para
-- 'validada'. Reusa o shape de `app_aplicar_snapshot` (0094:41-71): lock,
-- `SET search_path`, ordem dos guards. Diverge de propósito no `ON CONFLICT
-- DO UPDATE` (merge aditivo por chave, não sobrescrita — D-E/D-F) e no UPDATE
-- condicional como reserva de reentrância ANTES do INSERT no snapshot.
CREATE OR REPLACE FUNCTION public.app_validar_anamnese(
  p_anamnese uuid, p_repertorio jsonb, p_segmentacao jsonb
) RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_patient uuid;
  v_clinic  uuid;
  v_estado  anamnese_estado;
  v_linhas  integer;
BEGIN
  -- 1. Resolve a anamnese como owner (BYPASSRLS). O isolamento é feito nos
  --    guards abaixo, NUNCA pela ausência de leitura.
  SELECT a.patient_id, a.clinic_id, a.estado
    INTO v_patient, v_clinic, v_estado
    FROM anamnese a WHERE a.id = p_anamnese;
  IF v_patient IS NULL THEN
    RAISE EXCEPTION 'app_validar_anamnese: anamnese % inexistente', p_anamnese;
  END IF;

  -- 2. Mesmo lock de `app_aplicar_snapshot` (0094:48): serializa contra
  --    materialização concorrente do mesmo paciente.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_patient::text, 0));

  -- 3. Isolamento multi-tenant. Tenant resolvido por `app_clinic_id_exigido()`
  --    (D16/#229) — cast cru estoura 42704/22P02 sem nomear o tenant.
  IF v_clinic <> app_clinic_id_exigido() THEN
    RAISE EXCEPTION 'app_validar_anamnese: anamnese % fora da clínica do chamador (isolamento multi-tenant)', p_anamnese;
  END IF;
  IF NOT app_patient_in_clinic(v_patient) THEN
    RAISE EXCEPTION 'app_validar_anamnese: paciente % fora da clínica do chamador (isolamento multi-tenant)', v_patient;
  END IF;

  -- 4. Fronteira de autorização (CLAUDE.md ponto 5). O predicado da policy de
  --    leitura correspondente (`anamnese_select`, e o `session_snapshot_select`
  --    de 0016) é `coordenador OR app_is_on_team(paciente)`. Aqui a exigência é
  --    ESTRITAMENTE MAIS FORTE — só coordenador — porque D-B decidiu que validar
  --    é ato exclusivo do coordenador. Isso é restrição deliberada, não omissão
  --    do predicado copiado: terapeuta lê a anamnese, não a valida.
  IF app_user_role_exigido() <> 'coordenador' THEN
    RAISE EXCEPTION 'app_validar_anamnese: validar anamnese é exclusivo de coordenador (D-B)';
  END IF;

  -- 5. Consentimento (D-H). Mesmo guard de `app_aplicar_snapshot` (0094:60-62),
  --    porque esta função escreve na MESMA tabela.
  IF app_prontuario_somente_leitura(v_patient) THEN
    RAISE EXCEPTION 'Prontuário em somente-leitura: consentimento revogado (LGPD Art. 8º, §5º)';
  END IF;

  -- 6. Protocolo ativo com escala utilizável. Sem isto o hexágono fica `null`
  --    mesmo com anamnese perfeita: `queries.ts:172` faz
  --    `Math.max(0, taxonomia.length - 1)` e `espectro.ts:203-204` exige `> 0`
  --    — ou seja, a taxonomia precisa de PELO MENOS 2 níveis, não só "não vazia".
  IF NOT EXISTS (
    SELECT 1 FROM patient_protocol pp
      JOIN protocol pr ON pr.id = pp.protocol_id
     WHERE pp.patient_id = v_patient
       AND pp.desativado_em IS NULL
       AND jsonb_array_length(pr.taxonomia_ajuda) >= 2
  ) THEN
    RAISE EXCEPTION 'ANAMNESE_SEM_PROTOCOLO_ATIVO: paciente % não tem protocolo ativo com taxonomia de ajuda utilizável', v_patient;
  END IF;

  -- 7. RESERVA DE REENTRÂNCIA ANTES DO EFEITO. A mesma anamnese validada duas
  --    vezes tem que ser RECUSADA (D-F / ANAM-12). O `ON CONFLICT DO UPDATE` de
  --    `app_aplicar_snapshot` (0094:66-71) sobrescreveria em silêncio — é
  --    exatamente o risco que D-F fecha. Aqui o UPDATE condicional vem PRIMEIRO:
  --    se a linha já saiu de 'rascunho', 0 linhas afetadas e a função aborta
  --    antes de tocar o snapshot. Tudo na mesma transação, então RAISE = rollback.
  UPDATE anamnese
     SET estado = 'validada', validada_em = now(), validada_por = app_user_id_exigido()
   WHERE id = p_anamnese AND estado = 'rascunho';
  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  IF v_linhas = 0 THEN
    RAISE EXCEPTION 'ANAMNESE_JA_VALIDADA: anamnese % já foi validada (append-only, D-F): correção é anamnese complementar, não revalidação', p_anamnese;
  END IF;

  -- 8. Marco 0. Merge ADITIVO por chave, nunca sobrescrita:
  --    `EXCLUDED.repertorio_state || session_snapshot.repertorio_state` mantém o
  --    valor JÁ GRAVADO quando a chave existe (o operando da direita vence) e
  --    aceita apenas chaves novas. É o que torna a anamnese complementar (P2)
  --    possível sem reescrever o passado — `espectro.ts:186-190` documenta a
  --    reescrita como proibida.
  INSERT INTO session_snapshot (patient_id, session_numero, repertorio_state, segmentacao, gerado_em)
  VALUES (v_patient, 0, p_repertorio, p_segmentacao, now())
  ON CONFLICT (patient_id, session_numero)
  DO UPDATE SET
    repertorio_state = EXCLUDED.repertorio_state || session_snapshot.repertorio_state,
    segmentacao      = EXCLUDED.segmentacao      || session_snapshot.segmentacao,
    gerado_em        = session_snapshot.gerado_em;
END; $function$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_validar_anamnese(uuid,jsonb,jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_validar_anamnese(uuid,jsonb,jsonb) TO app_role;