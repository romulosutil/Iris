-- #374 ∪ #353 — Policies de RLS de `export_bundle` para a role `iris_auth`.
--
-- Por que existe: a `0117` concedeu `GRANT SELECT, INSERT ON export_bundle TO
-- iris_auth`, mas criou policies só `TO app_role`. Com `FORCE ROW LEVEL
-- SECURITY` ligado e nenhuma policy aplicável, o Postgres nega TODA linha para
-- `iris_auth` — sem erro, devolvendo zero linhas. O job de background
-- (`processarProximo`, `expirarVencidos`, ambos sob `authDb`) varria a fila e
-- via a fila vazia: nenhum bundle jamais saía de `pendente` em produção, e o
-- CI não pegava porque o teste do motor nunca chegava a rodar.
--
-- Precedente direto: `0116_audit_log_iris_auth_grant.sql` (D34), que fez o
-- mesmo par grant + policy `TO iris_auth USING (true)` para o job de billing.
-- A leitura é cross-tenant por necessidade — a fila é global e o job não tem
-- `app.clinic_id` no escopo. O payload continua fora: `export_bundle_blob` NÃO
-- ganha policy de leitura aqui; quem o escreve e apaga são as funções
-- `SECURITY DEFINER` da `0117`, e quem o lê é o download sob `app_role`.
--
-- Escrita segue negada por RLS para `iris_auth`: nenhuma policy de UPDATE ou
-- DELETE é criada, e o `INSERT` da `0117` fica sem policy de propósito — mudar
-- estado de bundle é atribuição exclusiva dos DEFINER (`app_export_bundle_*`).

CREATE POLICY export_bundle_auth_select ON export_bundle
  FOR SELECT TO iris_auth
  USING (true);
