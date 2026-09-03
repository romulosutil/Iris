-- #554 — Alerta de risco: adotar a régua do profissional responsável pela sessão
-- ────────────────────────────────────────────────────────────────────────────
-- Follow-up da 0143 (#539, auditoria 360 PR-05 / D-AUD-7), que unificou
-- "profissional responsável pela sessão" = `terapeuta_id` OU `atendido_por_id`
-- (substituto designado na agenda) em `app_session_profissional_responsavel`.
--
-- Três lugares ficaram DE PROPÓSITO fora daquela migração — o W1 (#529, 0142)
-- reescrevia um deles na mesma leva e não queríamos editar a mesma função em
-- dois PRs simultâneos:
--
--   1. `alerta_risco_scope` — policy de `alerta_risco_clinico` (forma da 0085);
--   2. `app_alerta_risco_visivel` — 0093 (forma D23);
--   3. `app_alerta_trecho_fonte` — 0142/#529, que nasceu copiando o predicado
--      de `alerta_risco_scope`.
--
-- Os três decidiam o ramo de dono pela régua ANTIGA — a função que devolve só o
-- titular (`session.terapeuta_id`), comparada com o usuário corrente:
-- o substituto que ATENDEU a sessão e não está na equipe de cuidado NÃO via o
-- alerta que a extração daquela sessão gerou — nem o `trecho_fonte` —, enquanto
-- a titular, que não estava lá, via. Era o último resíduo em que "quem atendeu"
-- e "quem lê o alerta" divergiam.
--
-- O que MUDA: só esse ramo, nos três. Tudo o mais do predicado é idêntico —
-- `deletado_em`, `pseudonimizado_em` (linha pseudonimizada continua sendo
-- coordenador-only), `clinic_id = app_clinic_id_exigido()`,
-- `app_patient_in_clinic`, `app_is_on_team` e o ramo de papel coordenador.
--
-- `app_session_profissional_responsavel` é SECURITY INVOKER e lê `session`.
-- Dentro dos dois DEFINER abaixo ela lê com os direitos do dono, então o
-- predicado dela É o guard (tenant por `app_clinic_id_exigido()` + identidade
-- por `app_user_id_exigido()`), não a RLS — mesmo arranjo já ratificado na 0143
-- em `app_session_definir_numero_sequencial`. Na policy (que roda como
-- `app_role`) ela lê sob `session_select`, que a 0143 já estendeu ao substituto.
--
-- Efeito colateral registrado, e desejado: os dois DEFINER deixam de chamar
-- `app_user_id_exigido()` DIRETAMENTE (a chamada passa a ser transitiva, dentro
-- de `app_session_profissional_responsavel`). O conjunto exato de
-- `FUNCOES_COM_USER_ID_EXIGIDO_HELPER` em `db/tests/clinic-id-helper-rls.int.test.ts`
-- muda por isso — e a cobertura de tenant continua de pé pelo
-- `clinic_id = app_clinic_id_exigido()` em AND, que não sai daqui.

-- ─── 1. Policy `alerta_risco_scope` (forma da 0085) ─────────────────────────
-- USING e WITH CHECK mudam JUNTOS de propósito: a policy é FOR ALL e `app_role`
-- tem UPDATE na tabela (reconhecer/encerrar alerta). Trocar só o USING deixaria
-- o substituto LER o alerta e o UPDATE dele afetar 0 linhas em silêncio — o
-- modo de falha que a CLAUDE.md §Migrações item 5 manda evitar.
ALTER POLICY alerta_risco_scope ON alerta_risco_clinico
  USING (((deletado_em IS NULL) AND (clinic_id = app_clinic_id_exigido()) AND (((pseudonimizado_em IS NOT NULL) AND (current_setting('app.user_role'::text) = 'coordenador'::text)) OR ((pseudonimizado_em IS NULL) AND app_patient_in_clinic(patient_id) AND ((current_setting('app.user_role'::text) = 'coordenador'::text) OR app_is_on_team(patient_id) OR app_session_profissional_responsavel(session_id))))))
  WITH CHECK (((pseudonimizado_em IS NULL) AND (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND ((current_setting('app.user_role'::text) = 'coordenador'::text) OR app_is_on_team(patient_id) OR app_session_profissional_responsavel(session_id))));
--> statement-breakpoint

-- ─── 2. `app_alerta_risco_visivel` (0093, forma D23) ────────────────────────
CREATE OR REPLACE FUNCTION public.app_alerta_risco_visivel(p_alerta uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
                 OR app_session_profissional_responsavel(a.session_id)))
      )
  );
$$;
--> statement-breakpoint

-- ─── 3. `app_alerta_trecho_fonte` (0142, #529) ──────────────────────────────
-- DEFINER porque `trecho_fonte` tem SELECT revogado de `app_role` (0125); o
-- guard interno espelha o predicado de `alerta_risco_scope` — e continua
-- espelhando, agora com a régua nova nos dois.
CREATE OR REPLACE FUNCTION public.app_alerta_trecho_fonte(p_alerta uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN a.session_id IS NULL OR app_session_conteudo_visivel(a.session_id) THEN a.trecho_fonte
    ELSE NULL
  END
  FROM alerta_risco_clinico a
  WHERE a.id = p_alerta
    -- predicado de alerta_risco_scope (0085), forma D23 (0093), régua do
    -- profissional responsável (0143/#539) adotada na 0150 (#554):
    AND a.deletado_em IS NULL
    AND a.clinic_id = app_clinic_id_exigido()
    AND (
      (a.pseudonimizado_em IS NOT NULL AND app_user_role_exigido() = 'coordenador')
      OR (a.pseudonimizado_em IS NULL
          AND app_patient_in_clinic(a.patient_id)
          AND (app_user_role_exigido() = 'coordenador'
               OR app_is_on_team(a.patient_id)
               OR app_session_profissional_responsavel(a.session_id)))
    );
$$;
