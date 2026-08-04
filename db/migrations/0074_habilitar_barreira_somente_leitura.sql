-- ============================================================================
-- 0074 — Habilita a barreira de somente-leitura instalada pela 0073
-- ============================================================================
--
-- Migração separada de propósito. A 0073 cria função e triggers DESABILITADOS;
-- esta liga a chave. O custo é um arquivo a mais; o que ele compra é a
-- possibilidade de aplicar o DDL em staging, observar, e reverter a ativação
-- com um `ALTER TABLE ... DISABLE TRIGGER` — sem `DROP FUNCTION` no meio de um
-- incidente.
--
-- Predicado errado aqui trava clínica pagante, que é o pior modo de falha
-- possível para uma regra de cobrança.
DO $$
DECLARE
  t text;
  alvos text[] := ARRAY[
    'patient', 'patient_alvo_disciplina', 'patient_clinical_profile',
    'patient_protocol',
    'session', 'session_note', 'session_protocol_scope',
    'evidence', 'evidence_revision',
    'goal', 'goal_candidacy', 'goal_milestone_mapping',
    'care_team_membership', 'janela_trabalho', 'bloqueio',
    'agendamento_recorrente',
    'user_role', 'clinic'
  ];
BEGIN
  FOREACH t IN ARRAY alvos LOOP
    EXECUTE format('ALTER TABLE %I ENABLE TRIGGER %I', t, t || '_somente_leitura');
  END LOOP;
END $$;
