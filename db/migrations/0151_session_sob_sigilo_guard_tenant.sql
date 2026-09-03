-- #552 — guard de tenant próprio em `app_session_sob_sigilo`.
--
-- Origem: revisão pós-PR #544 (#529, auditoria 360 W1 — achados S-02/Q-05).
--
-- A versão da 0122 é SECURITY DEFINER (roda com os direitos do dono, IGNORA a
-- RLS de `session_note`) com EXECUTE para `app_role` e SEM predicado de
-- clínica: qualquer `app_role`, de qualquer tenant, que conhecesse o UUID de
-- uma sessão descobria se ela tem nota `discipline_only`. É 1 bit por uuid, sem
-- conteúdo — por isso estava em `DEFINERS_GLOBAIS_JUSTIFICADOS` — mas é um bit
-- que fala de sigilo clínico.
--
-- O guard interno é a única fronteira (CLAUDE.md §Migrações, item 5) e espelha
-- o predicado de tenant das policies de `session_note` (`app_clinic_id_exigido()`,
-- nunca `current_setting('app.clinic_id')` cru — D16/#229). Fail-closed: sessão
-- de outra clínica passa a devolver `false`, e sem tenant no contexto o helper
-- levanta `P0001` diagnosticável em vez de decidir errado em silêncio.
--
-- Efeito em `app_session_conteudo_visivel` (contraprova medida nos casos 16-18
-- de `db/tests/sigilo-disciplina-rls.int.test.ts`): `NOT app_session_sob_sigilo(x)`
-- vira `true` para sessão alheia, mas o `AND app_session_clinica_visivel(x)` já
-- era `false` — o composto continua `false`. Nenhum resultado in-tenant muda.
--
-- Migração à mão (Drizzle não modela função DEFINER): entrada manual no
-- `_journal.json`, snapshot intocado.

CREATE OR REPLACE FUNCTION public.app_session_sob_sigilo(p_session uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM session_note sn
    WHERE sn.session_id = p_session
      AND sn.clinic_id = app_clinic_id_exigido()
      AND sn.visibility_level = 'discipline_only'
  );
$$;
--> statement-breakpoint

-- Reafirma o regime de execução da 0122: nunca PUBLIC, só `app_role`.
REVOKE ALL ON FUNCTION public.app_session_sob_sigilo(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_session_sob_sigilo(uuid) TO app_role;
