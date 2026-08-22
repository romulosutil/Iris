CREATE TYPE "public"."export_bundle_status" AS ENUM('pendente', 'processando', 'pronto', 'falhou', 'expirado');--> statement-breakpoint
CREATE TABLE "export_bundle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"solicitado_por" uuid NOT NULL,
	"status" "export_bundle_status" DEFAULT 'pendente' NOT NULL,
	"solicitado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"iniciado_em" timestamp with time zone,
	"concluido_em" timestamp with time zone,
	"expira_em" timestamp with time zone,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"erro" text,
	"bytes_tamanho" bigint,
	"sha256" text,
	"token_hash" text,
	"manifest" jsonb,
	CONSTRAINT "export_bundle_pronto_congelado" CHECK ("export_bundle"."status" <> 'pronto' OR ("export_bundle"."sha256" IS NOT NULL AND "export_bundle"."bytes_tamanho" IS NOT NULL AND "export_bundle"."expira_em" IS NOT NULL AND "export_bundle"."token_hash" IS NOT NULL AND "export_bundle"."concluido_em" IS NOT NULL)),
	CONSTRAINT "export_bundle_falhou_motivado" CHECK ("export_bundle"."status" <> 'falhou' OR "export_bundle"."erro" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "export_bundle_blob" (
	"bundle_id" uuid PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "export_bundle" ADD CONSTRAINT "export_bundle_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_bundle" ADD CONSTRAINT "export_bundle_solicitado_por_app_user_id_fk" FOREIGN KEY ("solicitado_por") REFERENCES "public"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_bundle_blob" ADD CONSTRAINT "export_bundle_blob_bundle_id_export_bundle_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."export_bundle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_export_bundle_ativo" ON "export_bundle" USING btree ("clinic_id") WHERE "export_bundle"."status" IN ('pendente', 'processando');--> statement-breakpoint
CREATE INDEX "idx_export_bundle_clinic" ON "export_bundle" USING btree ("clinic_id","solicitado_em" DESC NULLS LAST);--> statement-breakpoint

-- #374 ∪ #353 (T1) — Exportação Integral do Acervo da Clínica.
--
-- ISENÇÃO DA BARREIRA DE SOMENTE-LEITURA (D10):
-- As tabelas `export_bundle` e `export_bundle_blob` deliberadamente NÃO recebem o
-- trigger `app_barreira_somente_leitura`, pela mesma razão que `report`, `report_pdf`
-- e `audit_log` já estão fora dele (0073, linhas 130-135): a promessa comercial e legal
-- (ToS §7.4(b) + LGPD Art. 18) é que uma conta em modo somente-leitura (pós-trial ou
-- cancelada) possui exportação livre e irrestrita do seu acervo. Adicionar a barreira
-- aqui quebraria a funcionalidade exatamente no seu caso de uso principal.

ALTER TABLE "export_bundle" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "export_bundle" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "export_bundle_blob" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "export_bundle_blob" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY export_bundle_select ON export_bundle FOR SELECT TO app_role USING (
  clinic_id = app_clinic_id_exigido()
);--> statement-breakpoint

CREATE POLICY export_bundle_insert ON export_bundle FOR INSERT TO app_role WITH CHECK (
  clinic_id = app_clinic_id_exigido()
  AND solicitado_por = app_user_id_exigido()
  AND status = 'pendente'
);--> statement-breakpoint

CREATE POLICY export_bundle_blob_select ON export_bundle_blob FOR SELECT TO app_role USING (
  EXISTS (
    SELECT 1 FROM export_bundle b
    WHERE b.id = bundle_id
      AND b.clinic_id = app_clinic_id_exigido()
  )
);--> statement-breakpoint

REVOKE ALL ON export_bundle FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT ON export_bundle TO app_role;--> statement-breakpoint
GRANT SELECT, INSERT ON export_bundle TO iris_auth;--> statement-breakpoint

REVOKE ALL ON export_bundle_blob FROM PUBLIC;--> statement-breakpoint
GRANT SELECT ON export_bundle_blob TO app_role;--> statement-breakpoint
GRANT SELECT ON export_bundle_blob TO iris_auth;--> statement-breakpoint

-- ==================== FUNÇÕES SECURITY DEFINER ====================

CREATE OR REPLACE FUNCTION public.app_export_bundle_reservar(p_bundle uuid)
RETURNS TABLE (
  id uuid,
  clinic_id uuid,
  solicitado_por uuid,
  status export_bundle_status,
  tentativas integer,
  erro text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tentativas integer;
BEGIN
  SELECT eb.tentativas + 1 INTO v_tentativas
    FROM export_bundle eb
   WHERE eb.id = p_bundle
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_tentativas > 3 THEN
    RETURN QUERY
    UPDATE export_bundle
       SET status = 'falhou',
           tentativas = v_tentativas,
           erro = 'tentativas_esgotadas',
           concluido_em = now()
     WHERE export_bundle.id = p_bundle
    RETURNING export_bundle.id, export_bundle.clinic_id, export_bundle.solicitado_por, export_bundle.status, export_bundle.tentativas, export_bundle.erro;
  ELSE
    RETURN QUERY
    UPDATE export_bundle
       SET status = 'processando',
           iniciado_em = now(),
           tentativas = v_tentativas
     WHERE export_bundle.id = p_bundle
    RETURNING export_bundle.id, export_bundle.clinic_id, export_bundle.solicitado_por, export_bundle.status, export_bundle.tentativas, export_bundle.erro;
  END IF;
END; $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_export_bundle_reservar(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_export_bundle_reservar(uuid) TO app_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_export_bundle_reservar(uuid) TO iris_auth;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_export_bundle_concluir(
  p_bundle uuid,
  p_sha256 text,
  p_bytes_tamanho bigint,
  p_token_hash text,
  p_manifest jsonb,
  p_bytes bytea
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  UPDATE export_bundle
     SET status = 'pronto',
         sha256 = p_sha256,
         bytes_tamanho = p_bytes_tamanho,
         token_hash = p_token_hash,
         manifest = p_manifest,
         concluido_em = v_now,
         expira_em = v_now + interval '72 hours'
   WHERE id = p_bundle;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'bundle % não encontrado para conclusão', p_bundle;
  END IF;

  INSERT INTO export_bundle_blob (bundle_id, bytes)
  VALUES (p_bundle, p_bytes)
  ON CONFLICT (bundle_id) DO UPDATE
    SET bytes = EXCLUDED.bytes;
END; $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_export_bundle_concluir(uuid, text, bigint, text, jsonb, bytea) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_export_bundle_concluir(uuid, text, bigint, text, jsonb, bytea) TO app_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_export_bundle_concluir(uuid, text, bigint, text, jsonb, bytea) TO iris_auth;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_export_bundle_falhar(
  p_bundle uuid,
  p_erro text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE export_bundle
     SET status = 'falhou',
         erro = p_erro,
         concluido_em = now()
   WHERE id = p_bundle;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'bundle % não encontrado para registrar falha', p_bundle;
  END IF;
END; $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_export_bundle_falhar(uuid, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_export_bundle_falhar(uuid, text) TO app_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_export_bundle_falhar(uuid, text) TO iris_auth;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_export_bundle_expirar(
  p_bundle uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_afetado boolean := false;
BEGIN
  UPDATE export_bundle
     SET status = 'expirado'
   WHERE id = p_bundle
     AND status = 'pronto'
     AND expira_em < now();

  IF FOUND THEN
    DELETE FROM export_bundle_blob WHERE bundle_id = p_bundle;
    v_afetado := true;
  END IF;

  RETURN v_afetado;
END; $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_export_bundle_expirar(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_export_bundle_expirar(uuid) TO app_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_export_bundle_expirar(uuid) TO iris_auth;
