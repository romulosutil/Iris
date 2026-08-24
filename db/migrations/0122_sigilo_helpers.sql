-- Helpers SECURITY DEFINER para sigilo de nota de sessão por disciplina (#119 T2).
-- Implementam a barreira de visibilidade restrita (discipline_only)
-- sem hardcode de string e com fail-closed por construção.

CREATE OR REPLACE FUNCTION public.app_session_sob_sigilo(p_session uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM session_note sn
    WHERE sn.session_id = p_session
      AND sn.visibility_level = 'discipline_only'
  );
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_session_disciplina_liberada(p_session uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM session s
    WHERE s.id = p_session
      AND (
        s.terapeuta_id = app_user_id_exigido()
        OR EXISTS (
          SELECT 1 FROM care_team_membership m
          WHERE m.patient_id = s.patient_id
            AND m.user_id = app_user_id_exigido()
            AND m.vigencia_fim IS NULL
            AND m.disciplina = s.disciplina
        )
      )
  );
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_session_conteudo_visivel(p_session uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT app_session_clinica_visivel(p_session)
    AND (NOT app_session_sob_sigilo(p_session) OR app_session_disciplina_liberada(p_session));
$$;
--> statement-breakpoint

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
  WHERE a.id = p_alerta;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_session_sob_sigilo(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_session_sob_sigilo(uuid) TO app_role;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_session_disciplina_liberada(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_session_disciplina_liberada(uuid) TO app_role;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_session_conteudo_visivel(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_session_conteudo_visivel(uuid) TO app_role;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_alerta_trecho_fonte(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_alerta_trecho_fonte(uuid) TO app_role;
