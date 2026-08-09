-- 0085 — D16 (#229): as 48 policies deixam de resolver o tenant com
-- `current_setting('app.clinic_id')::uuid` cru e passam a chamar
-- `app_clinic_id_exigido()`.
--
-- POR QUÊ
--
-- O predicado cru falha de duas maneiras, nenhuma delas diagnosticável:
--   * GUC ausente          → 42704 `unrecognized configuration parameter`
--   * GUC presente e lixo  → 22P02 `invalid input syntax for type uuid`
--     (string vazia, texto qualquer, UUID truncado)
-- Nos dois casos a exceção nasce **na policy**, antes de qualquer guard
-- interno decidir — foi o que fez o guard de `app_conta_somente_leitura()`
-- não bastar na #215. E a mensagem não nomeia o tenant, então o diagnóstico
-- custa caro justamente no incidente em que se está sem contexto.
--
-- O QUE ESTA MIGRAÇÃO **NÃO** FAZ
--
-- Não troca as policies por `app_clinic_id_atual()` (o helper da 0082, que
-- devolve NULL). Num predicado de isolamento multi-tenant, transformar
-- "estoura" em "não vê linha nenhuma" é trocar o modo de falha ruim pelo
-- pior: `clinic_id = NULL` é NULL, a linha some, e ninguém fica sabendo.
--
-- O DESENHO
--
-- Sob `app_role`, GUC ausente ou malformado é sempre **bug**, nunca estado
-- legítimo: `withTenant()` (src/db/rls.ts) já falha rápido, antes de abrir a
-- transação, se `clinicId` vier vazio. Então a resposta certa continua sendo
-- falhar barulhento — só que com um erro único, nomeando o tenant.
--
-- `app_clinic_id_exigido()` é SQL/STABLE de propósito: o planner faz inlining,
-- o custo por linha continua o de hoje e o predicado segue utilizável como
-- qual de índice. Quem levanta é uma segunda função (plpgsql, porque SQL não
-- levanta), alcançada só pelo ramo direito do COALESCE — que curto-circuita
-- quando o tenant resolve. Ela é STABLE, e não IMMUTABLE, para o planner não
-- dobrar a chamada em tempo de plano e levantar durante o planejamento.
--
-- MUDANÇA DE COMPORTAMENTO DELIBERADA
--
-- 4 das 48 policies (`subscription_select`, `billing_cycle_select`,
-- `billing_cycle_patient_select`, `professional_consent_select`) usavam a
-- forma leniente `current_setting(..., true)` e devolviam 0 linhas em
-- silêncio com GUC ausente. Passam a levantar como as outras 44. Medido
-- caller a caller (#229): nenhum leitor sob `app_role` lê essas tabelas sem
-- GUC — todo o caminho de billing/cadastro/backoffice usa `authDb`
-- (`iris_auth`), que tem policies próprias `*_auth_all`/`*_auth_select` e não
-- lê o GUC. Os comentários da 0071/0058 dizem espelhar `clinic_read`, que é a
-- forma estrita; a leniência era divergência, não decisão.
--
-- Por que levantar dentro da policy é seguro: as 48 são `TO app_role`, e
-- nenhuma tabela envolvida tem policy permissiva de `app_role` **sem** o termo
-- de clínica. Não existe, portanto, o caso em que o `OR` entre policies
-- permissivas permitiria a linha e a exceção de um dos ramos aborta assim
-- mesmo.
--
-- As 48 statements abaixo foram geradas a partir do texto vivo de
-- `pg_policies` trocando **apenas** o termo de clínica, e conferidas por
-- comparação normalizada antes/depois. Trava de regressão (inclusive contra
-- policy nova escrita na forma velha) em
-- `db/tests/clinic-id-helper-rls.int.test.ts`.

CREATE OR REPLACE FUNCTION app_tenant_nao_resolvido()
RETURNS uuid LANGUAGE plpgsql STABLE AS $$
BEGIN
  RAISE EXCEPTION 'tenant não resolvido: GUC app.clinic_id ausente ou fora do formato uuid'
    USING ERRCODE = 'P0001',
          HINT = 'toda leitura de dado de paciente passa por withTenant() — src/db/rls.ts';
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_tenant_nao_resolvido() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_tenant_nao_resolvido() TO app_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_tenant_nao_resolvido() TO iris_auth;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_clinic_id_exigido()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT COALESCE(app_clinic_id_atual(), app_tenant_nao_resolvido());
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_clinic_id_exigido() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_clinic_id_exigido() TO app_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_clinic_id_exigido() TO iris_auth;
--> statement-breakpoint

ALTER POLICY agendamento_recorrente_delete ON agendamento_recorrente
  USING (((clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role'::text) = 'coordenador'::text)));
--> statement-breakpoint

ALTER POLICY agendamento_recorrente_insert ON agendamento_recorrente
  WITH CHECK (((clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role'::text) = 'coordenador'::text) AND app_patient_in_clinic(patient_id) AND app_user_in_clinic(terapeuta_id)));
--> statement-breakpoint

ALTER POLICY agendamento_recorrente_select ON agendamento_recorrente
  USING (((clinic_id = app_clinic_id_exigido()) AND ((current_setting('app.user_role'::text) = ANY (ARRAY['coordenador'::text, 'admin_recepcao'::text])) OR app_is_on_team(patient_id))));
--> statement-breakpoint

ALTER POLICY agendamento_recorrente_update ON agendamento_recorrente
  USING (((clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role'::text) = 'coordenador'::text)))
  WITH CHECK (((clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role'::text) = 'coordenador'::text) AND app_patient_in_clinic(patient_id) AND app_user_in_clinic(terapeuta_id)));
--> statement-breakpoint

ALTER POLICY alerta_risco_scope ON alerta_risco_clinico
  USING (((deletado_em IS NULL) AND (clinic_id = app_clinic_id_exigido()) AND (((pseudonimizado_em IS NOT NULL) AND (current_setting('app.user_role'::text) = 'coordenador'::text)) OR ((pseudonimizado_em IS NULL) AND app_patient_in_clinic(patient_id) AND ((current_setting('app.user_role'::text) = 'coordenador'::text) OR app_is_on_team(patient_id) OR (app_session_terapeuta_id(session_id) = (current_setting('app.user_id'::text))::uuid))))))
  WITH CHECK (((pseudonimizado_em IS NULL) AND (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND ((current_setting('app.user_role'::text) = 'coordenador'::text) OR app_is_on_team(patient_id) OR (app_session_terapeuta_id(session_id) = (current_setting('app.user_id'::text))::uuid))));
--> statement-breakpoint

ALTER POLICY app_user_read ON app_user
  USING ((EXISTS ( SELECT 1
   FROM user_role r
  WHERE ((r.user_id = app_user.id) AND (r.clinic_id = app_clinic_id_exigido())))));
--> statement-breakpoint

ALTER POLICY audio_insert ON audio_capture
  WITH CHECK (((clinic_id = app_clinic_id_exigido()) AND (app_session_terapeuta_id(session_id) = (current_setting('app.user_id'::text))::uuid) AND (NOT app_prontuario_somente_leitura_por_sessao(session_id))));
--> statement-breakpoint

ALTER POLICY audio_select ON audio_capture
  USING (((clinic_id = app_clinic_id_exigido()) AND app_session_clinica_visivel(session_id)));
--> statement-breakpoint

ALTER POLICY audio_update ON audio_capture
  USING (((clinic_id = app_clinic_id_exigido()) AND (app_session_terapeuta_id(session_id) = (current_setting('app.user_id'::text))::uuid) AND (NOT app_prontuario_somente_leitura_por_sessao(session_id))))
  WITH CHECK (((clinic_id = app_clinic_id_exigido()) AND (app_session_terapeuta_id(session_id) = (current_setting('app.user_id'::text))::uuid) AND (NOT app_prontuario_somente_leitura_por_sessao(session_id))));
--> statement-breakpoint

ALTER POLICY audit_insert ON audit_log
  WITH CHECK (((clinic_id = app_clinic_id_exigido()) AND (ator_id = (current_setting('app.user_id'::text))::uuid)));
--> statement-breakpoint

ALTER POLICY audit_select ON audit_log
  USING (((clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role'::text) = 'coordenador'::text)));
--> statement-breakpoint

ALTER POLICY billing_cycle_select ON billing_cycle
  USING ((clinic_id = app_clinic_id_exigido()));
--> statement-breakpoint

ALTER POLICY billing_cycle_patient_select ON billing_cycle_patient
  USING ((clinic_id = app_clinic_id_exigido()));
--> statement-breakpoint

ALTER POLICY bloqueio_delete ON bloqueio
  USING (((clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role'::text) = 'coordenador'::text)));
--> statement-breakpoint

ALTER POLICY bloqueio_insert ON bloqueio
  WITH CHECK (((clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role'::text) = 'coordenador'::text) AND ((patient_id IS NULL) OR app_patient_in_clinic(patient_id)) AND ((terapeuta_id IS NULL) OR app_user_in_clinic(terapeuta_id))));
--> statement-breakpoint

ALTER POLICY bloqueio_select ON bloqueio
  USING ((clinic_id = app_clinic_id_exigido()));
--> statement-breakpoint

ALTER POLICY bloqueio_update ON bloqueio
  USING (((clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role'::text) = 'coordenador'::text)))
  WITH CHECK (((clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role'::text) = 'coordenador'::text) AND ((patient_id IS NULL) OR app_patient_in_clinic(patient_id)) AND ((terapeuta_id IS NULL) OR app_user_in_clinic(terapeuta_id))));
--> statement-breakpoint

ALTER POLICY clinic_read ON clinic
  USING ((id = app_clinic_id_exigido()));
--> statement-breakpoint

ALTER POLICY extraction_delete ON extraction
  USING (((clinic_id = app_clinic_id_exigido()) AND (app_session_terapeuta_id(session_id) = (current_setting('app.user_id'::text))::uuid) AND (NOT app_prontuario_somente_leitura_por_sessao(session_id)) AND (NOT app_finalidade_revogada_por_sessao(session_id, 'uso_ia_processamento'::text))));
--> statement-breakpoint

ALTER POLICY extraction_insert ON extraction
  WITH CHECK (((clinic_id = app_clinic_id_exigido()) AND (app_session_terapeuta_id(session_id) = (current_setting('app.user_id'::text))::uuid) AND (NOT app_prontuario_somente_leitura_por_sessao(session_id)) AND (NOT app_finalidade_revogada_por_sessao(session_id, 'uso_ia_processamento'::text))));
--> statement-breakpoint

ALTER POLICY extraction_select ON extraction
  USING (((clinic_id = app_clinic_id_exigido()) AND app_session_clinica_visivel(session_id)));
--> statement-breakpoint

ALTER POLICY extraction_update ON extraction
  USING (((clinic_id = app_clinic_id_exigido()) AND (app_session_terapeuta_id(session_id) = (current_setting('app.user_id'::text))::uuid) AND (NOT app_prontuario_somente_leitura_por_sessao(session_id)) AND (NOT app_finalidade_revogada_por_sessao(session_id, 'uso_ia_processamento'::text))))
  WITH CHECK (((clinic_id = app_clinic_id_exigido()) AND (app_session_terapeuta_id(session_id) = (current_setting('app.user_id'::text))::uuid) AND (NOT app_prontuario_somente_leitura_por_sessao(session_id)) AND (NOT app_finalidade_revogada_por_sessao(session_id, 'uso_ia_processamento'::text))));
--> statement-breakpoint

ALTER POLICY goal_insert ON goal
  WITH CHECK (((clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role'::text) = ANY (ARRAY['coordenador'::text, 'terapeuta'::text])) AND app_patient_in_clinic(patient_id) AND (criado_por = (current_setting('app.user_id'::text))::uuid) AND ((current_setting('app.user_role'::text) = 'coordenador'::text) OR app_is_on_team(patient_id)) AND (NOT app_prontuario_somente_leitura(patient_id))));
--> statement-breakpoint

ALTER POLICY goal_select ON goal
  USING (((clinic_id = app_clinic_id_exigido()) AND ((current_setting('app.user_role'::text) = 'coordenador'::text) OR app_is_on_team(patient_id))));
--> statement-breakpoint

ALTER POLICY goal_update ON goal
  USING (((clinic_id = app_clinic_id_exigido()) AND ((current_setting('app.user_role'::text) = 'coordenador'::text) OR app_is_on_team(patient_id)) AND (NOT app_prontuario_somente_leitura(patient_id))))
  WITH CHECK (((clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND ((current_setting('app.user_role'::text) = 'coordenador'::text) OR app_is_on_team(patient_id)) AND (NOT app_prontuario_somente_leitura(patient_id))));
--> statement-breakpoint

ALTER POLICY janela_trabalho_delete ON janela_trabalho
  USING (((clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role'::text) = 'coordenador'::text)));
--> statement-breakpoint

ALTER POLICY janela_trabalho_insert ON janela_trabalho
  WITH CHECK (((clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role'::text) = 'coordenador'::text) AND app_user_in_clinic(terapeuta_id)));
--> statement-breakpoint

ALTER POLICY janela_trabalho_select ON janela_trabalho
  USING ((clinic_id = app_clinic_id_exigido()));
--> statement-breakpoint

ALTER POLICY janela_trabalho_update ON janela_trabalho
  USING (((clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role'::text) = 'coordenador'::text)))
  WITH CHECK (((clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role'::text) = 'coordenador'::text) AND app_user_in_clinic(terapeuta_id)));
--> statement-breakpoint

ALTER POLICY patient_delete ON patient
  USING (((clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role'::text) = 'coordenador'::text)));
--> statement-breakpoint

ALTER POLICY patient_insert ON patient
  WITH CHECK (((clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role'::text) = ANY (ARRAY['admin_recepcao'::text, 'coordenador'::text]))));
--> statement-breakpoint

ALTER POLICY patient_select ON patient
  USING (((clinic_id = app_clinic_id_exigido()) AND ((current_setting('app.user_role'::text) = ANY (ARRAY['coordenador'::text, 'admin_recepcao'::text])) OR app_is_on_team(id))));
--> statement-breakpoint

ALTER POLICY patient_update ON patient
  USING (((clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role'::text) = ANY (ARRAY['admin_recepcao'::text, 'coordenador'::text]))))
  WITH CHECK (((clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role'::text) = ANY (ARRAY['admin_recepcao'::text, 'coordenador'::text]))));
--> statement-breakpoint

ALTER POLICY patient_alvo_disciplina_insert ON patient_alvo_disciplina
  WITH CHECK (((clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role'::text) = ANY (ARRAY['admin_recepcao'::text, 'coordenador'::text])) AND app_patient_in_clinic(patient_id) AND (NOT app_prontuario_somente_leitura(patient_id))));
--> statement-breakpoint

ALTER POLICY patient_alvo_disciplina_select ON patient_alvo_disciplina
  USING (((clinic_id = app_clinic_id_exigido()) AND ((current_setting('app.user_role'::text) = ANY (ARRAY['coordenador'::text, 'admin_recepcao'::text])) OR app_is_on_team(patient_id))));
--> statement-breakpoint

ALTER POLICY patient_alvo_disciplina_update ON patient_alvo_disciplina
  USING (((clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role'::text) = ANY (ARRAY['admin_recepcao'::text, 'coordenador'::text])) AND (NOT app_prontuario_somente_leitura(patient_id))))
  WITH CHECK (((clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role'::text) = ANY (ARRAY['admin_recepcao'::text, 'coordenador'::text])) AND app_patient_in_clinic(patient_id) AND (NOT app_prontuario_somente_leitura(patient_id))));
--> statement-breakpoint

ALTER POLICY professional_consent_select ON professional_consent
  USING ((clinic_id = app_clinic_id_exigido()));
--> statement-breakpoint

ALTER POLICY protocol_read ON protocol
  USING ((clinic_id = app_clinic_id_exigido()));
--> statement-breakpoint

ALTER POLICY protocol_write ON protocol
  USING (((clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role'::text) = 'coordenador'::text)))
  WITH CHECK (((clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role'::text) = 'coordenador'::text)));
--> statement-breakpoint

ALTER POLICY session_delete ON session
  USING (((clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role'::text) = 'coordenador'::text) AND (NOT app_prontuario_somente_leitura(patient_id))));
--> statement-breakpoint

ALTER POLICY session_insert ON session
  WITH CHECK (((clinic_id = app_clinic_id_exigido()) AND (current_setting('app.user_role'::text) = ANY (ARRAY['admin_recepcao'::text, 'coordenador'::text])) AND app_patient_in_clinic(patient_id) AND app_user_in_clinic(terapeuta_id) AND ((atendido_por_id IS NULL) OR app_user_in_clinic(atendido_por_id)) AND (NOT app_prontuario_somente_leitura(patient_id))));
--> statement-breakpoint

ALTER POLICY session_select ON session
  USING (((clinic_id = app_clinic_id_exigido()) AND ((current_setting('app.user_role'::text) = ANY (ARRAY['coordenador'::text, 'admin_recepcao'::text])) OR (terapeuta_id = (current_setting('app.user_id'::text))::uuid) OR app_is_on_team(patient_id))));
--> statement-breakpoint

ALTER POLICY session_update ON session
  USING (((clinic_id = app_clinic_id_exigido()) AND ((current_setting('app.user_role'::text) = ANY (ARRAY['coordenador'::text, 'admin_recepcao'::text])) OR (terapeuta_id = (current_setting('app.user_id'::text))::uuid)) AND (NOT app_prontuario_somente_leitura(patient_id))))
  WITH CHECK (((clinic_id = app_clinic_id_exigido()) AND ((current_setting('app.user_role'::text) = ANY (ARRAY['coordenador'::text, 'admin_recepcao'::text])) OR (terapeuta_id = (current_setting('app.user_id'::text))::uuid)) AND app_patient_in_clinic(patient_id) AND app_user_in_clinic(terapeuta_id) AND ((atendido_por_id IS NULL) OR app_user_in_clinic(atendido_por_id)) AND (NOT app_prontuario_somente_leitura(patient_id))));
--> statement-breakpoint

ALTER POLICY session_note_insert ON session_note
  WITH CHECK (((clinic_id = app_clinic_id_exigido()) AND (autor_id = (current_setting('app.user_id'::text))::uuid) AND (app_session_terapeuta_id(session_id) = (current_setting('app.user_id'::text))::uuid) AND (NOT app_prontuario_somente_leitura_por_sessao(session_id))));
--> statement-breakpoint

ALTER POLICY session_note_select ON session_note
  USING (((clinic_id = app_clinic_id_exigido()) AND app_session_clinica_visivel(session_id)));
--> statement-breakpoint

ALTER POLICY session_note_update ON session_note
  USING (((clinic_id = app_clinic_id_exigido()) AND (app_session_terapeuta_id(session_id) = (current_setting('app.user_id'::text))::uuid) AND (NOT app_prontuario_somente_leitura_por_sessao(session_id))))
  WITH CHECK (((clinic_id = app_clinic_id_exigido()) AND (app_session_terapeuta_id(session_id) = (current_setting('app.user_id'::text))::uuid) AND (NOT app_prontuario_somente_leitura_por_sessao(session_id))));
--> statement-breakpoint

ALTER POLICY subscription_select ON subscription
  USING ((clinic_id = app_clinic_id_exigido()));
--> statement-breakpoint

ALTER POLICY user_role_read ON user_role
  USING ((clinic_id = app_clinic_id_exigido()));
