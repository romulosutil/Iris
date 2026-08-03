-- Fatia A (#163), review round 1, item 2: fecha corrida de duas requisições
-- concorrentes de retomada (mesmo user_id/clinic_id/versao_termo) inserindo
-- dois aceites. cadastro.ts passa a usar onConflictDoNothing contra este
-- índice; sem ele, o "select antes do insert" da aplicação não é suficiente
-- sob concorrência real.
CREATE UNIQUE INDEX uq_professional_consent_user_clinic_versao
  ON professional_consent (user_id, clinic_id, versao_termo);
