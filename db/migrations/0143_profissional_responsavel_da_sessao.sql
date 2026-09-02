-- #539 (auditoria 360, achado PR-05 · decisão D-AUD-7, proposta pendente de
-- validação): régua ÚNICA de "quem é o profissional responsável pela sessão".
--
-- Antes desta migração havia três réguas para a mesma pergunta:
--   1. RLS de session_note / audio_capture / extraction / session_protocol_scope
--      (0006, reescritas em 0053 e 0085): `app_session_terapeuta_id(session_id)
--      = app.user_id` — só `terapeuta_id`.
--   2. `ehDono` na UI e `lib/sessao/fila.ts`: `terapeuta_id = eu`.
--   3. `app_desarquivar_paciente` (0092): `terapeuta_id OR atendido_por_id`.
-- A agenda (0034) deixa designar um substituto em `session.atendido_por_id`
-- ("terapeuta faltou, outro cobre"), que na hora de documentar batia em "new
-- row violates row-level security policy" — e, não estando na equipe de
-- cuidado, nem sequer lia a própria sessão (`session_select`, 0004/0085).
--
-- Régua nova, em UM lugar: `app_session_profissional_responsavel(session_id)`
-- é verdadeiro quando `app_user_id_exigido() IN (terapeuta_id,
-- atendido_por_id)`. Toda policy de ESCRITA de documentação passa a chamá-la;
-- as policies/funções de LEITURA da sessão ganham o mesmo `atendido_por_id`.
--
-- SECURITY INVOKER, de propósito (CLAUDE.md §Migrações, item 5, ao contrário):
-- a função lê `session` sob a RLS de quem chama. Isso só funciona porque, nesta
-- mesma migração, `session_select` passa a deixar o substituto ler a própria
-- sessão. Quem NÃO enxerga a linha (recepção, terapeuta alheio, outro tenant)
-- recebe `false` — fail-closed sem precisar de mais um DEFINER que ignora a
-- RLS. O guard de tenant `clinic_id = app_clinic_id_exigido()` é redundante
-- com a RLS e está aqui por disciplina (D16/#229: função tenant-scoped resolve
-- o tenant pelo helper, nunca por cast cru) — ela entra em FUNCOES_COM_HELPER e
-- FUNCOES_COM_USER_ID_EXIGIDO_HELPER em db/tests/clinic-id-helper-rls.int.test.ts.
--
-- `x IN (a, NULL)` é NULL quando `x <> a`; dentro de EXISTS isso é `false`.
-- Sessão sem substituto continua exigindo `terapeuta_id`.
--
-- FORA desta migração (registrado na PR como pendência): `alerta_risco_scope`
-- (0085) e `app_alerta_risco_visivel` (0093) ainda usam
-- `app_session_terapeuta_id(session_id) = ...` como ramo de leitura de
-- alertas — o mesmo predicado que o #529/W1 reescreve em `app_alerta_trecho_fonte`
-- (0142 do W1). Unificar ali depois que o W1 entrar, para não editar a mesma
-- função em dois PRs.

CREATE OR REPLACE FUNCTION public.app_session_profissional_responsavel(p_session uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM session s
    WHERE s.id = p_session
      AND s.clinic_id = app_clinic_id_exigido()
      AND app_user_id_exigido() IN (s.terapeuta_id, s.atendido_por_id)
  );
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_session_profissional_responsavel(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_session_profissional_responsavel(uuid) TO app_role;
--> statement-breakpoint

-- ─── Leitura da sessão: o substituto lê e atualiza a própria sessão ──────────
-- Forma da 0085, com o ramo de dono trocado por `terapeuta_id OU atendido_por_id`
-- e o cast cru de `app.user_id` trocado por `app_user_id_exigido()` (D23/0093:
-- P0001 diagnosticável em vez de 22P02/42704). Papéis e `app_is_on_team`
-- inalterados.

ALTER POLICY session_select ON session
  USING (
    clinic_id = app_clinic_id_exigido()
    AND (
      current_setting('app.user_role') IN ('coordenador', 'admin_recepcao')
      OR terapeuta_id = app_user_id_exigido()
      OR atendido_por_id = app_user_id_exigido()
      OR app_is_on_team(patient_id)
    )
  );
--> statement-breakpoint

-- `session_update`: `consolidarSessao` grava `numero_sequencial_paciente` com
-- UPDATE em `session`. Sem este ramo o UPDATE do substituto afeta 0 linhas em
-- silêncio (USING filtra) e a sessão fica sem número — sem erro nenhum.
ALTER POLICY session_update ON session
  USING (
    clinic_id = app_clinic_id_exigido()
    AND (
      current_setting('app.user_role') IN ('coordenador', 'admin_recepcao')
      OR terapeuta_id = app_user_id_exigido()
      OR atendido_por_id = app_user_id_exigido()
    )
    AND NOT app_prontuario_somente_leitura(patient_id)
  )
  WITH CHECK (
    clinic_id = app_clinic_id_exigido()
    AND (
      current_setting('app.user_role') IN ('coordenador', 'admin_recepcao')
      OR terapeuta_id = app_user_id_exigido()
      OR atendido_por_id = app_user_id_exigido()
    )
    AND app_patient_in_clinic(patient_id)
    AND app_user_in_clinic(terapeuta_id)
    AND (atendido_por_id IS NULL OR app_user_in_clinic(atendido_por_id))
    AND NOT app_prontuario_somente_leitura(patient_id)
  );
--> statement-breakpoint

-- `app_session_clinica_visivel` (0087 → 0093) é o predicado de LEITURA de
-- session_note/audio_capture/extraction/session_protocol_scope (`*_select`).
-- Sem o ramo do substituto ele escreveria a nota e não a leria de volta
-- (`temCaptura`/`notaConsolidada` da tela mentiriam). Corpo idêntico ao da
-- 0093 fora o `IN (terapeuta_id, atendido_por_id)`. Continua DEFINER com o
-- mesmo guard de tenant.
CREATE OR REPLACE FUNCTION public.app_session_clinica_visivel(p_session uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM session s
    WHERE s.id = p_session
      AND s.clinic_id = app_clinic_id_exigido()
      AND (
        app_user_role_exigido() = 'coordenador'
        OR app_user_id_exigido() IN (s.terapeuta_id, s.atendido_por_id)
        OR app_is_on_team(s.patient_id)
      )
  );
$$;
--> statement-breakpoint

-- `app_session_disciplina_liberada` (0121, #119): quem lê nota `discipline_only`
-- é o autor da sessão ou colega da mesma disciplina na equipe. O substituto que
-- escreveu a nota sob sigilo precisa lê-la — mesma régua. Corpo idêntico ao da
-- 0121 fora o `IN (...)`.
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
        app_user_id_exigido() IN (s.terapeuta_id, s.atendido_por_id)
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

-- ─── Escrita de documentação: DROP + CREATE com a função nova ────────────────
-- Inventário (pg_policies em 02/09/2026, `qual`/`with_check` contendo
-- app_session_terapeuta_id): session_note_insert/update, audio_insert/update,
-- extraction_insert/update/delete, sps_insert/update/delete. Predicados
-- copiados da forma viva (0053/0085), trocando SÓ o ramo de dono e o cast cru
-- de `app.user_id`. `alerta_risco_scope` fica de fora (ver cabeçalho).

-- session_note (0006 → 0053 → 0085)
DROP POLICY session_note_insert ON session_note;
--> statement-breakpoint
CREATE POLICY session_note_insert ON session_note FOR INSERT TO app_role
  WITH CHECK (
    clinic_id = app_clinic_id_exigido()
    AND autor_id = app_user_id_exigido()
    AND app_session_profissional_responsavel(session_id)
    AND NOT app_prontuario_somente_leitura_por_sessao(session_id)
  );
--> statement-breakpoint

DROP POLICY session_note_update ON session_note;
--> statement-breakpoint
CREATE POLICY session_note_update ON session_note FOR UPDATE TO app_role
  USING (
    clinic_id = app_clinic_id_exigido()
    AND app_session_profissional_responsavel(session_id)
    AND NOT app_prontuario_somente_leitura_por_sessao(session_id)
  )
  WITH CHECK (
    clinic_id = app_clinic_id_exigido()
    AND app_session_profissional_responsavel(session_id)
    AND NOT app_prontuario_somente_leitura_por_sessao(session_id)
  );
--> statement-breakpoint

-- audio_capture (0006 → 0053 → 0085)
DROP POLICY audio_insert ON audio_capture;
--> statement-breakpoint
CREATE POLICY audio_insert ON audio_capture FOR INSERT TO app_role
  WITH CHECK (
    clinic_id = app_clinic_id_exigido()
    AND app_session_profissional_responsavel(session_id)
    AND NOT app_prontuario_somente_leitura_por_sessao(session_id)
  );
--> statement-breakpoint

DROP POLICY audio_update ON audio_capture;
--> statement-breakpoint
CREATE POLICY audio_update ON audio_capture FOR UPDATE TO app_role
  USING (
    clinic_id = app_clinic_id_exigido()
    AND app_session_profissional_responsavel(session_id)
    AND NOT app_prontuario_somente_leitura_por_sessao(session_id)
  )
  WITH CHECK (
    clinic_id = app_clinic_id_exigido()
    AND app_session_profissional_responsavel(session_id)
    AND NOT app_prontuario_somente_leitura_por_sessao(session_id)
  );
--> statement-breakpoint

-- extraction (0006 → 0053 → 0085): mantém o gate de finalidade de IA.
DROP POLICY extraction_insert ON extraction;
--> statement-breakpoint
CREATE POLICY extraction_insert ON extraction FOR INSERT TO app_role
  WITH CHECK (
    clinic_id = app_clinic_id_exigido()
    AND app_session_profissional_responsavel(session_id)
    AND NOT app_prontuario_somente_leitura_por_sessao(session_id)
    AND NOT app_finalidade_revogada_por_sessao(session_id, 'uso_ia_processamento')
  );
--> statement-breakpoint

DROP POLICY extraction_update ON extraction;
--> statement-breakpoint
CREATE POLICY extraction_update ON extraction FOR UPDATE TO app_role
  USING (
    clinic_id = app_clinic_id_exigido()
    AND app_session_profissional_responsavel(session_id)
    AND NOT app_prontuario_somente_leitura_por_sessao(session_id)
    AND NOT app_finalidade_revogada_por_sessao(session_id, 'uso_ia_processamento')
  )
  WITH CHECK (
    clinic_id = app_clinic_id_exigido()
    AND app_session_profissional_responsavel(session_id)
    AND NOT app_prontuario_somente_leitura_por_sessao(session_id)
    AND NOT app_finalidade_revogada_por_sessao(session_id, 'uso_ia_processamento')
  );
--> statement-breakpoint

DROP POLICY extraction_delete ON extraction;
--> statement-breakpoint
CREATE POLICY extraction_delete ON extraction FOR DELETE TO app_role
  USING (
    clinic_id = app_clinic_id_exigido()
    AND app_session_profissional_responsavel(session_id)
    AND NOT app_prontuario_somente_leitura_por_sessao(session_id)
    AND NOT app_finalidade_revogada_por_sessao(session_id, 'uso_ia_processamento')
  );
--> statement-breakpoint

-- session_protocol_scope (0006 → 0053): sem clinic_id na tabela; o tenant vem
-- de app_session_profissional_responsavel (guard interno) e app_protocol_in_clinic.
DROP POLICY sps_insert ON session_protocol_scope;
--> statement-breakpoint
CREATE POLICY sps_insert ON session_protocol_scope FOR INSERT TO app_role
  WITH CHECK (
    app_session_profissional_responsavel(session_id)
    AND app_protocol_in_clinic(protocol_id)
    AND (ajustado_por IS NULL OR ajustado_por = app_user_id_exigido())
    AND NOT app_prontuario_somente_leitura_por_sessao(session_id)
  );
--> statement-breakpoint

DROP POLICY sps_update ON session_protocol_scope;
--> statement-breakpoint
CREATE POLICY sps_update ON session_protocol_scope FOR UPDATE TO app_role
  USING (
    app_session_profissional_responsavel(session_id)
    AND NOT app_prontuario_somente_leitura_por_sessao(session_id)
  )
  WITH CHECK (
    app_session_profissional_responsavel(session_id)
    AND app_protocol_in_clinic(protocol_id)
    AND (ajustado_por IS NULL OR ajustado_por = app_user_id_exigido())
    AND NOT app_prontuario_somente_leitura_por_sessao(session_id)
  );
--> statement-breakpoint

DROP POLICY sps_delete ON session_protocol_scope;
--> statement-breakpoint
CREATE POLICY sps_delete ON session_protocol_scope FOR DELETE TO app_role
  USING (
    app_session_profissional_responsavel(session_id)
    AND NOT app_prontuario_somente_leitura_por_sessao(session_id)
  );
