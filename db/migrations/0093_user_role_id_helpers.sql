-- 0093 — D23: helpers para `app.user_role` e `app.user_id` em funções `SECURITY DEFINER`.
--
-- MOTIVAÇÃO (D23):
-- A 0087 corrigiu o `current_setting('app.clinic_id')::uuid` cru em 14 funções DEFINER
-- e na view `audit_log_mascarado`. Mas deliberadamente deixou fora `app.user_role` e
-- `app.user_id`. Dentro de funções DEFINER (que rodam com direitos do dono e ignoram RLS),
-- os guards de papel e identidade são a própria fronteira de autorização.
--
-- ESTA MIGRAÇÃO CRIA:
-- 1. `app_user_role_nao_resolvido()` (plpgsql, STABLE) -> levanta P0001
-- 2. `app_user_id_nao_resolvido()` (plpgsql, STABLE) -> levanta P0001
-- 3. `app_user_role_atual()` (SQL, STABLE) -> devolve text ou NULL
-- 4. `app_user_id_atual()` (SQL, STABLE) -> devolve uuid ou NULL (regex guard)
-- 5. `app_user_role_exigido()` (SQL, STABLE) -> COALESCE(atual, raiser)
-- 6. `app_user_id_exigido()` (SQL, STABLE) -> COALESCE(atual, raiser)
--
-- E REESCREVE 6 FUNÇÕES DEFINER:
-- - `app_alerta_risco_visivel`
-- - `app_session_clinica_visivel`
-- - `app_salvar_config_emergencia`
-- - `app_salvar_cpf_cnpj_clinica`
-- - `app_desarquivar_paciente`
-- - `app_criar_alerta_risco`

CREATE OR REPLACE FUNCTION app_user_role_nao_resolvido()
RETURNS text LANGUAGE plpgsql STABLE AS $$
BEGIN
  RAISE EXCEPTION 'papel não resolvido: GUC app.user_role ausente ou vazio'
    USING ERRCODE = 'P0001',
          HINT = 'toda leitura de dado de paciente passa por withTenant() — src/db/rls.ts';
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_user_role_nao_resolvido() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_user_role_nao_resolvido() TO app_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_user_role_nao_resolvido() TO iris_auth;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_user_id_nao_resolvido()
RETURNS uuid LANGUAGE plpgsql STABLE AS $$
BEGIN
  RAISE EXCEPTION 'identidade não resolvida: GUC app.user_id ausente ou fora do formato uuid'
    USING ERRCODE = 'P0001',
          HINT = 'toda leitura de dado de paciente passa por withTenant() — src/db/rls.ts';
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_user_id_nao_resolvido() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_user_id_nao_resolvido() TO app_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_user_id_nao_resolvido() TO iris_auth;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_user_role_atual()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(BTRIM(current_setting('app.user_role', true)), '');
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_user_role_atual() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_user_role_atual() TO app_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_user_role_atual() TO iris_auth;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_user_id_atual()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT CASE
           WHEN current_setting('app.user_id', true)
                ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
           THEN current_setting('app.user_id', true)::uuid
           ELSE NULL
         END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_user_id_atual() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_user_id_atual() TO app_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_user_id_atual() TO iris_auth;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_user_role_exigido()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(app_user_role_atual(), app_user_role_nao_resolvido());
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_user_role_exigido() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_user_role_exigido() TO app_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_user_role_exigido() TO iris_auth;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_user_id_exigido()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT COALESCE(app_user_id_atual(), app_user_id_nao_resolvido());
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_user_id_exigido() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_user_id_exigido() TO app_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_user_id_exigido() TO iris_auth;
--> statement-breakpoint

-- ==================== REESCRITA DAS FUNÇÕES DEFINER ====================

CREATE OR REPLACE FUNCTION public.app_alerta_risco_visivel(p_alerta uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM alerta_risco_clinico a
    WHERE a.id = p_alerta
      AND a.deletado_em IS NULL
      AND a.clinic_id = app_clinic_id_exigido()
      AND (
        (a.pseudonimizado_em IS NOT NULL AND app_user_role_exigido() = 'coordenador')
        OR (a.pseudonimizado_em IS NULL
            AND app_patient_in_clinic(a.patient_id)
            AND (app_user_role_exigido() = 'coordenador'
                 OR app_is_on_team(a.patient_id)
                 OR app_session_terapeuta_id(a.session_id) = app_user_id_exigido()))
      )
  );
$function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_session_clinica_visivel(p_session uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM session s
    WHERE s.id = p_session
      AND s.clinic_id = app_clinic_id_exigido()
      AND (
        app_user_role_exigido() = 'coordenador'
        OR s.terapeuta_id = app_user_id_exigido()
        OR app_is_on_team(s.patient_id)
      )
  );
$function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_salvar_config_emergencia(p_responsavel_tecnico uuid, p_protocolo_interno text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clinic uuid := app_clinic_id_exigido();
BEGIN
  IF app_user_role_exigido() <> 'coordenador' THEN
    RAISE EXCEPTION 'app_salvar_config_emergencia: exige papel coordenador (papel do chamador: %)', app_user_role_exigido();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_role
     WHERE clinic_id = v_clinic
       AND user_id = p_responsavel_tecnico
  ) THEN
    RAISE EXCEPTION 'app_salvar_config_emergencia: responsável técnico % não tem papel nesta clínica (isolamento multi-tenant)', p_responsavel_tecnico;
  END IF;

  UPDATE clinic
     SET responsavel_tecnico_id = p_responsavel_tecnico,
         protocolo_emergencia_interno = p_protocolo_interno,
         protocolo_emergencia_declarado_em =
           COALESCE(protocolo_emergencia_declarado_em, now()),
         protocolo_emergencia_declarado_por =
           COALESCE(protocolo_emergencia_declarado_por,
                    app_user_id_atual())
   WHERE id = v_clinic;
END; $function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_salvar_cpf_cnpj_clinica(p_cpf_cnpj text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clinic uuid := app_clinic_id_exigido();
  v_digitos text := regexp_replace(COALESCE(p_cpf_cnpj, ''), '\D', '', 'g');
BEGIN
  IF app_user_role_exigido() <> 'coordenador' THEN
    RAISE EXCEPTION 'app_salvar_cpf_cnpj_clinica: exige papel coordenador (papel do chamador: %)', app_user_role_exigido();
  END IF;

  IF length(v_digitos) NOT IN (11, 14) THEN
    RAISE EXCEPTION 'app_salvar_cpf_cnpj_clinica: documento deve ter 11 dígitos (CPF) ou 14 (CNPJ); recebeu % dígito(s)', length(v_digitos);
  END IF;

  UPDATE clinic
     SET cpf_cnpj = v_digitos
   WHERE id = v_clinic;
END; $function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_desarquivar_paciente(p_patient uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_afetadas int;
BEGIN
  IF NOT app_patient_in_clinic(p_patient) THEN
    RAISE EXCEPTION 'app_desarquivar_paciente: paciente % fora da clínica do chamador (isolamento multi-tenant)', p_patient;
  END IF;

  IF NOT (
    app_user_role_exigido() IN ('coordenador', 'admin_recepcao')
    OR app_is_on_team(p_patient)
    OR EXISTS (
      SELECT 1 FROM session s
       WHERE s.patient_id = p_patient
         AND s.clinic_id = app_clinic_id_exigido()
         AND (s.terapeuta_id = app_user_id_exigido()
              OR s.atendido_por_id = app_user_id_exigido())
    )
  ) THEN
    RAISE EXCEPTION 'app_desarquivar_paciente: paciente % fora da equipe ou cobertura do chamador (autorização cross-team)', p_patient;
  END IF;

  UPDATE patient
     SET arquivado_em = NULL
   WHERE id = p_patient
     AND arquivado_em IS NOT NULL;

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas > 0;
END; $function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_criar_alerta_risco(p_patient uuid, p_session uuid, p_categoria alerta_risco_categoria, p_severidade alerta_risco_severidade, p_certeza alerta_risco_certeza, p_trecho text, p_detalhe text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clinic  uuid := app_clinic_id_exigido();
  v_minutos integer;
  v_id      uuid;
BEGIN
  IF p_trecho IS NULL OR btrim(p_trecho) = '' THEN
    -- §6: o trecho literal do diário é sempre visível ao lado do alerta. Um
    -- alerta sem trecho seria um veredito da IA sem evidência — proibido.
    RAISE EXCEPTION 'app_criar_alerta_risco: trecho_fonte literal é obrigatório';
  END IF;

  -- Erro OPACO unificado (evita oráculo cross-tenant), padrão de 0045.
  IF NOT EXISTS (
    SELECT 1 FROM session s
     WHERE s.id = p_session
       AND s.patient_id = p_patient
       AND s.clinic_id = v_clinic
  ) THEN
    RAISE EXCEPTION 'app_criar_alerta_risco: sessão inexistente ou sem permissão';
  END IF;

  IF app_prontuario_somente_leitura(p_patient) THEN
    RAISE EXCEPTION 'Prontuário em somente-leitura: consentimento revogado (LGPD Art. 8º, §5º)';
  END IF;

  -- Idempotência de RE-EXTRAÇÃO (não é dedupe clínico). A §3.2 rejeita dedupe
  -- por chave natural de propósito: cada menção em cada sessão é um evento novo.
  -- Mas consolidar a MESMA sessão duas vezes reprocessa o MESMO texto — isso
  -- não é um segundo evento, é o mesmo. Chave = (sessão, trecho literal,
  -- categoria, severidade); dois relatos distintos na mesma sessão têm trechos
  -- distintos e continuam gerando duas linhas.
  SELECT a.id INTO v_id
    FROM alerta_risco_clinico a
   WHERE a.session_id = p_session
     AND a.trecho_fonte = p_trecho
     AND a.categoria = p_categoria
     AND a.severidade = p_severidade
     AND a.deletado_em IS NULL
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;  -- não reabre, não reinicia prazo, não renotifica
  END IF;

  v_minutos := app_prazo_risco_minutos(p_severidade, p_certeza);

  INSERT INTO alerta_risco_clinico (
    clinic_id, patient_id, session_id,
    categoria, severidade, certeza, trecho_fonte, detalhe,
    prazo_minutos, prazo_reconhecimento, atualizado_por
  ) VALUES (
    v_clinic, p_patient, p_session,
    p_categoria, p_severidade, p_certeza, p_trecho, p_detalhe,
    v_minutos, now() + make_interval(mins => v_minutos),
    app_user_id_atual()
  ) RETURNING id INTO v_id;

  INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
  VALUES (v_clinic, app_user_id_atual(),
          'alerta_risco_criado', 'alerta_risco_clinico', v_id, p_patient,
          jsonb_build_object('severidade', p_severidade, 'certeza', p_certeza,
                             'prazo_minutos', v_minutos));

  RETURN v_id;
END;
$function$;
