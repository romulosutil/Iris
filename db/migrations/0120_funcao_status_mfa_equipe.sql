-- Migration: 0120_funcao_status_mfa_equipe.sql
-- Descrição: Função SECURITY DEFINER para o coordenador visualizar o status de MFA/2FA da equipe da sua clínica.

CREATE OR REPLACE FUNCTION app_obter_status_mfa_equipe()
RETURNS TABLE (
  user_id uuid,
  nome text,
  email text,
  papel text,
  mfa_ativo boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic uuid := app_clinic_id_exigido();
  v_role   text := app_user_role_exigido();
BEGIN
  IF v_role <> 'coordenador' THEN
    RAISE EXCEPTION 'app_obter_status_mfa_equipe: acesso restrito a coordenador (papel atual: %)', v_role
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.name AS nome,
    u.email AS email,
    ur.papel::text AS papel,
    u.two_factor_enabled AS mfa_ativo
  FROM user_role ur
  JOIN app_user u ON u.id = ur.user_id
  WHERE ur.clinic_id = v_clinic
  ORDER BY u.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION app_obter_status_mfa_equipe() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_obter_status_mfa_equipe() TO app_role;
