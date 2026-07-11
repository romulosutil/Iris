-- Numeração sequencial por paciente correta (bypassa RLS do terapeuta) + rede contra corrida.
-- Problema: o cálculo original de numero_sequencial_paciente rodava sob RLS do
-- terapeuta autor da consolidação (session_select restringe a "minhas sessões
-- ou pacientes da minha equipe"). Um terapeuta de COBERTURA — dono desta sessão
-- mas fora da equipe de cuidado do paciente e sem outras sessões dele visíveis —
-- via MAX() subestimado e duplicava o número sequencial. O helper abaixo roda
-- SECURITY DEFINER (vê todas as sessões do paciente na clínica, sem RLS). O
-- índice único que fecha a corrida remanescente entre consolidações concorrentes
-- é rastreado pelo Drizzle (migração gerada 0008 + schema.ts), não aqui — esta
-- migração à mão cobre só a função, que o Drizzle não modela.
CREATE OR REPLACE FUNCTION app_proximo_numero_sequencial(p_patient uuid)
RETURNS integer LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(MAX(numero_sequencial_paciente), 0) + 1
  FROM session
  WHERE patient_id = p_patient
    AND clinic_id = current_setting('app.clinic_id')::uuid;
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_proximo_numero_sequencial(uuid) TO app_role;
