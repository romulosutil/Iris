-- D34: Concede permissões e policies de RLS na tabela `audit_log` para a role `iris_auth`
-- (usada pelo authDb / módulo de billing / fechamento de ciclos para auditoria de atos irreversíveis como corte por inadimplência).
-- audit_log é imutável: apenas SELECT e INSERT, sem UPDATE nem DELETE.

GRANT SELECT, INSERT ON audit_log TO iris_auth;

CREATE POLICY audit_log_auth_select ON audit_log
  FOR SELECT TO iris_auth
  USING (true);

CREATE POLICY audit_log_auth_insert ON audit_log
  FOR INSERT TO iris_auth
  WITH CHECK (true);
