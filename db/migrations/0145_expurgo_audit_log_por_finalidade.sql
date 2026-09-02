-- 0142_expurgo_audit_log_por_finalidade.sql
-- #536 (auditoria 360, S-05) — o expurgo do audit_log aos 180 dias passa a ser
-- POR FINALIDADE, não por idade.
--
-- O QUE ESTAVA ERRADO NA 0070: `app_expurgar_audit_log_expirado()` apagava
-- TODA linha com `criado_em < now() - 180 days`, sem olhar `acao`. Isso
-- levava junto `reclassificacao`, `invalidacao`, `reconhecimento_alerta`,
-- `relatorio_exportado`, `evidencia_aprovada_lote`, `paciente_purgado`… —
-- trilha clínica e de governança que, por `docs/legal/politica-retencao-dados.md`,
-- ACOMPANHA O PRONTUÁRIO: 180 dias é o mínimo do Marco Civil (Art. 15) para
-- LOG DE ACESSO, "mínimo, não teto", e não se aplica ao resto. A trilha de
-- quem aprovou, reclassificou ou exportou o quê nunca é apagada por idade —
-- ela é pseudonimizada no expurgo do titular (`app_purgar_paciente`, 0045/0128)
-- e só.
--
-- D-AUD-4 (PROPOSTA PENDENTE DE VALIDAÇÃO COM O RÔMULO) — classificação das
-- ações gravadas em `audit_log`, medida em 02/09/2026 varrendo `INSERT` nas
-- migrações, `insert(auditLog)` e SQL cru em `src/`:
--
--   ACESSO (expurgável aos 180 dias — allowlist abaixo). Vocabulário
--   RESERVADO: hoje NENHUMA destas ações é gravada em `audit_log` — login,
--   sessão, IP, throttle e 2FA vivem nas tabelas do Better-Auth
--   (`auth_session`, `auth_throttle`, `two_factor`), fora desta trilha. A
--   allowlist existe para que, no dia em que um evento de acesso entrar aqui,
--   ele entre com um nome que JÁ está classificado — e para que a função
--   tenha semântica testável hoje (db/tests/expurgo-audit-log-por-finalidade).
--     login, logout, login_falhou, sessao_expirada, sessao_revogada,
--     mfa_verificado, mfa_falhou, throttle_bloqueio
--
--   TRILHA CLÍNICA / GOVERNANÇA (acompanha o prontuário; NUNCA apagada por
--   idade): check_in, marcar_estado, reclassificacao, invalidacao, devolucao,
--   resposta_duvida, evidencia_aprovada_lote, reconhecimento_alerta,
--   resolucao_alerta, descarte_alerta, alerta_risco_criado,
--   alerta_risco_escalado, alerta_risco_email_rt, alerta_risco_reconhecido,
--   alerta_risco_resolvido, alerta_risco_descartado,
--   relatorio_rascunho_gerado, relatorio_revisado, relatorio_exportado,
--   relatorio_purgado, prontuario_exportado_pdf, exportacao_integral_solicitada,
--   exportacao_integral_falhou, exportacao_integral_concluida,
--   exportacao_integral_download, exportacao_integral_expirada,
--   paciente_arquivado, paciente_desarquivado,
--   paciente_arquivado_automaticamente, paciente_desarquivado_automaticamente,
--   arquivamento_aviso_previo, expurgo_aviso_previo, paciente_purgado,
--   alta_registrada, alta_desfeita, paciente_modalidade_clinica_alterada,
--   dados_clinica_atualizados, clinica_emergencia_configurada,
--   assinatura_cancelada_por_inadimplencia, e_psi_declarado.
--
-- FAIL-CLOSED: ação fora das DUAS listas (nova, renomeada, não classificada)
-- NÃO é apagada. O custo do erro é assimétrico — reter um log de acesso a mais
-- é um débito de minimização; apagar uma linha de trilha é perda irreversível
-- de evidência clínica/legal.
--
-- FRONTEIRA DE EXECUÇÃO: a 0070 fez `REVOKE ALL ... FROM PUBLIC` e nunca
-- concedeu EXECUTE a role nenhuma — só a dona (`iris`) executava. O script
-- `scripts/expurgo-audit-log.mjs` lia `DATABASE_URL` (app_role), que estoura
-- 42501: ou o serviço `iris-expurgo-audit-log` não existe em produção, ou
-- falha a cada tick (pendência registrada em infra/README.md — medir). Aqui
-- entra a role dedicada `iris_expurgo_audit_log` (NOLOGIN; a de login é
-- provisionada fora das migrações, IN ROLE, como iris_retencao/iris_alarme),
-- com EXECUTE nas três funções e em NADA mais. `app_role` continua sem
-- EXECUTE: um SQL injection no app não pode disparar expurgo de trilha.
--
-- CREATE OR REPLACE torna o diff enganoso (memória
-- `create-or-replace-torna-diff-enganoso`): o corpo vivo é ESTE, não o da 0070.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iris_expurgo_audit_log') THEN
    CREATE ROLE iris_expurgo_audit_log NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO iris_expurgo_audit_log;
--> statement-breakpoint

-- Allowlist como constante SQL dentro do corpo: `pg_proc.prosrc` carrega a
-- lista, e o int-test mede isso (`prosrc` contém `'login'` e `= ANY`).
--
-- O DELETE mora numa função só, que devolve a contagem POR `acao` (o job loga
-- isso — só nomes de ação e números, nunca id/ator). A função de nome antigo
-- vira wrapper que soma: um predicado, zero drift entre "o que apaga" e "o que
-- conta".
CREATE OR REPLACE FUNCTION public.app_expurgar_audit_log_expirado_por_acao()
  RETURNS TABLE (acao text, apagadas int)
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH apagados AS (
    DELETE FROM audit_log
     WHERE criado_em < now() - INTERVAL '180 days'
       -- D-AUD-4: só LOG DE ACESSO expira. Tudo o mais é trilha e fica.
       AND acao = ANY (ARRAY[
         'login',
         'logout',
         'login_falhou',
         'sessao_expirada',
         'sessao_revogada',
         'mfa_verificado',
         'mfa_falhou',
         'throttle_bloqueio'
       ]::text[])
    RETURNING audit_log.acao
  )
  SELECT apagados.acao, count(*)::int FROM apagados GROUP BY apagados.acao ORDER BY apagados.acao;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_expurgar_audit_log_expirado_por_acao() FROM PUBLIC;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.app_expurgar_audit_log_expirado_por_acao() TO iris_expurgo_audit_log;
--> statement-breakpoint

-- Mesmo nome e mesma assinatura da 0070 (quem já chama continua funcionando);
-- o corpo agora delega — o predicado vive só na função acima.
CREATE OR REPLACE FUNCTION public.app_expurgar_audit_log_expirado() RETURNS int
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(apagadas), 0)::int FROM public.app_expurgar_audit_log_expirado_por_acao();
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_expurgar_audit_log_expirado() FROM PUBLIC;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_pseudonimizar_audit_log_orfao() FROM PUBLIC;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.app_expurgar_audit_log_expirado() TO iris_expurgo_audit_log;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.app_pseudonimizar_audit_log_orfao() TO iris_expurgo_audit_log;
