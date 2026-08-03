-- Retenção de Logs de Aplicação por 6 Meses conforme Marco Civil Art. 15 (#116).
-- Altera FK audit_log.ator_id -> ON DELETE SET NULL para impedir expurgo em cascata.
-- Define rotinas SECURITY DEFINER de pseudonimização de logs órfãos e expurgo físico de 180+ dias.
--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT IF EXISTS "audit_log_ator_id_app_user_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_ator_id_app_user_id_fk" FOREIGN KEY ("ator_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_pseudonimizar_audit_log_orfao() RETURNS int
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH atualizados AS (
    UPDATE audit_log
       SET detalhe = jsonb_build_object('pseudonimizado', true)
     WHERE ator_id IS NULL
       AND COALESCE((detalhe->>'pseudonimizado')::boolean, false) = false
    RETURNING id
  )
  SELECT count(*)::int FROM atualizados;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_pseudonimizar_audit_log_orfao() FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_expurgar_audit_log_expirado() RETURNS int
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH apagados AS (
    DELETE FROM audit_log
     WHERE criado_em < now() - INTERVAL '180 days'
    RETURNING id
  )
  SELECT count(*)::int FROM apagados;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_expurgar_audit_log_expirado() FROM PUBLIC;
