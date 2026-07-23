-- Fase 6.2 (A4) — recepção com "zero leitura clínica" no audit_log.
-- Hoje `audit_select` (0039) concede SELECT do audit_log INTEIRO (com patient_id
-- e detalhe = PII clínica) a coordenador E admin_recepcao. A recepção não pode
-- ver dado clínico. Decisão: recepção enxerga auditoria MASCARADA (sem
-- patient_id/detalhe) via view dedicada; o audit_log base fica coordenador-only.
--> statement-breakpoint
-- 1) Aperta a policy base: só coordenador lê o audit_log com PII.
DROP POLICY audit_select ON audit_log;
--> statement-breakpoint
CREATE POLICY audit_select ON audit_log FOR SELECT TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND current_setting('app.user_role') = 'coordenador'
);
--> statement-breakpoint
-- 2) View mascarada: projeta só colunas NÃO-clínicas (dropa patient_id + detalhe).
--    ATENÇÃO — diferente de `evidence_current` (0014), esta view é
--    intencionalmente SEM `security_invoker`: como a policy base agora exclui a
--    recepção, uma view invoker re-aplicaria a policy e bloquearia a recepção
--    também. Rodando com direitos do dono (BYPASSRLS) ela ignora o RLS base, e o
--    isolamento de tenant é reimposto AQUI pelo `WHERE clinic_id = app.clinic_id`
--    (fixo na view, o chamador não remove). `security_barrier` impede vazamento
--    por predicado do chamador antes do filtro de clínica.
CREATE VIEW audit_log_mascarado WITH (security_barrier = true) AS
  SELECT id, clinic_id, ator_id, acao, entidade, entidade_id, criado_em
  FROM audit_log
  WHERE clinic_id = current_setting('app.clinic_id')::uuid;
--> statement-breakpoint
GRANT SELECT ON audit_log_mascarado TO app_role;
