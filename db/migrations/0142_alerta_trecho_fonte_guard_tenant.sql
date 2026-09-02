-- #529 (auditoria 360, achados S-02 e Q-05): guard de tenant DENTRO de
-- app_alerta_trecho_fonte.
--
-- A versão da 0122 é SECURITY DEFINER (roda com os direitos do dono, ignora a
-- RLS de alerta_risco_clinico) com EXECUTE para app_role e, no ramo
-- `session_id IS NULL` (alerta de RPD/instrumento, CHECK da 0114), devolvia
-- `trecho_fonte` sem nenhum predicado de clínica: qualquer app_role de qualquer
-- tenant lia o trecho mais sensível do produto conhecendo só o UUID. O ramo com
-- sessão só estava protegido por acidente (app_session_conteudo_visivel passa
-- por app_session_clinica_visivel).
--
-- Correção: o WHERE ganha o predicado da policy de leitura da própria tabela
-- (`alerta_risco_scope`, forma da 0085), na tradução D23 já usada por
-- app_alerta_risco_visivel (0093): app_user_role_exigido() no lugar de
-- current_setting('app.user_role') e app_user_id_exigido() no lugar do cast
-- cru de app.user_id — em função, o cast cru é vetado pelo oráculo de
-- db/tests/clinic-id-helper-rls.int.test.ts. Copiado, não inventado
-- (CLAUDE.md §Migrações, item 5: o guard interno de um DEFINER é a fronteira e
-- espelha o predicado exato da policy de leitura correspondente).
--
-- Fail-closed por construção: linha de outra clínica não satisfaz o WHERE, a
-- função devolve NULL — nunca o trecho, nunca erro que nomeie a linha.

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
    -- predicado de alerta_risco_scope (0085), forma D23 (0093):
    AND a.deletado_em IS NULL
    AND a.clinic_id = app_clinic_id_exigido()
    AND (
      (a.pseudonimizado_em IS NOT NULL AND app_user_role_exigido() = 'coordenador')
      OR (a.pseudonimizado_em IS NULL
          AND app_patient_in_clinic(a.patient_id)
          AND (app_user_role_exigido() = 'coordenador'
               OR app_is_on_team(a.patient_id)
               OR app_session_terapeuta_id(a.session_id) = app_user_id_exigido()))
    );
$$;
--> statement-breakpoint

-- Grants inalterados (0122): REVOKE de PUBLIC e EXECUTE só para app_role.
-- CREATE OR REPLACE preserva os privilégios existentes; reafirmados aqui para
-- que a leitura desta migração baste.
REVOKE ALL ON FUNCTION public.app_alerta_trecho_fonte(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_alerta_trecho_fonte(uuid) TO app_role;
