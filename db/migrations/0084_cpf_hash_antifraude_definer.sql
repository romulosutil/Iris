-- #191 — trava anti-fraude de trial via hash cego de CPF.
--
-- A 0083 adicionou `patient.cpf_hash`. `app_role` só tem policy de SELECT
-- restrita ao próprio `clinic_id` (0001/0002) — de propósito, isolamento
-- multi-tenant. Verificar se um CPF já consumiu trial em OUTRA clínica exige
-- ler fora do próprio tenant, o que nenhuma policy de RLS deve conceder.
--
-- Diferente das SECURITY DEFINER anteriores do repo (0064, 0081), que
-- escrevem dentro do próprio tenant, esta é a primeira que LÊ fora dele. A
-- superfície de vazamento fica em UM boolean — nunca retorna linha, CPF,
-- nome ou qualquer dado de outra clínica (zero-knowledge, LGPD-safe): o
-- chamador só aprende "sim, esse CPF já foi titular de trial em algum
-- lugar" ou "não".
--
-- `p_cpf_hash` chega pronto (calculado em `src/lib/security/cpf-hash.ts`,
-- HMAC-SHA256 com salt fora do repo) — a função nunca vê CPF em claro.
-- `current_setting('app.clinic_id')` (não parâmetro) exclui a própria
-- clínica da checagem e, como em 0064/0081, fecha o caminho de forjar
-- tenant.
CREATE OR REPLACE FUNCTION app_cpf_hash_usado_em_outro_trial(p_cpf_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
      FROM patient p
      JOIN clinic c ON c.id = p.clinic_id
     WHERE p.cpf_hash = p_cpf_hash
       AND c.id <> current_setting('app.clinic_id')::uuid
       AND c.trial_comeco_em IS NOT NULL
  );
END; $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_cpf_hash_usado_em_outro_trial(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_cpf_hash_usado_em_outro_trial(text) TO app_role;
