-- #119: Sigilo da disciplina em alertas de risco clínico.
-- Revoga SELECT em nível de tabela de alerta_risco_clinico para app_role,
-- concedendo SELECT apenas nas colunas não-literais (excluindo trecho_fonte).
-- O acesso a trecho_fonte para sessões sigilosas é mediado pela função
-- SECURITY DEFINER app_alerta_trecho_fonte(p_alerta uuid).

REVOKE SELECT ON alerta_risco_clinico FROM app_role;
--> statement-breakpoint
GRANT SELECT (
  id,
  clinic_id,
  patient_id,
  session_id,
  origem,
  rpd_entry_id,
  origem_extraction_id,
  instrumento_aplicacao_id,
  categoria,
  severidade,
  certeza,
  detalhe,
  status,
  canais_notificados,
  prazo_minutos,
  prazo_reconhecimento,
  reconhecido_por,
  reconhecido_em,
  escalado_em,
  escalado_estagio_2_em,
  conduta_registrada,
  motivo_descarte,
  pseudonimizado_em,
  criado_em,
  atualizado_por,
  atualizado_em,
  deletado_em
) ON alerta_risco_clinico TO app_role;
