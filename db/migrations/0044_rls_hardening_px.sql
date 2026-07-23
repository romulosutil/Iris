-- Fase 6.1 — Hardening RLS (PX1–PX4). Fecha reassociação intra-clínica por
-- UPDATE de FK/identidade. Mesmo idioma da 0006: RLS WITH CHECK não compara
-- OLD vs NEW, então imutabilidade de coluna se trava por GRANT-por-coluna
-- (REVOKE UPDATE global + GRANT UPDATE só nas colunas mutáveis). A ausência do
-- privilégio de coluna NEGA no nível de tabela (lição postgres-column-grant-
-- denies-table), então listar as mutáveis é a única fonte de verdade.
--
-- O GRANT ... ON ALL TABLES da 0001 é point-in-time e deu UPDATE amplo a todas
-- estas tabelas; aqui reduzimos cirurgicamente coluna a coluna.

-- ============================ PX1 · session ============================
-- Identidade/posse imutáveis: id, clinic_id (tenant), patient_id, terapeuta_id
-- (dono clínico), criado_em (auditoria). Reatribuir a sessão a outro paciente
-- ou terapeuta via UPDATE = forja de posse — barrado aqui, não na policy.
-- Mutáveis = todo o restante operacional da agenda (check-in, remarcação,
-- estado, disciplina/modalidade/tipo, substituto, reposição, nº sequencial).
REVOKE UPDATE ON session FROM app_role;
--> statement-breakpoint
GRANT UPDATE (
  estado, check_in_em, numero_sequencial_paciente, agendada_para,
  recorrente_id, disciplina, duracao_min, justificada, modalidade, tipo,
  atendido_por_id, reposta_de
) ON session TO app_role;
--> statement-breakpoint

-- ==================== PX2 · patient_clinical_profile ====================
-- id/patient_id/criado_em imutáveis (patient_id é o vínculo 1:1 com o
-- paciente; reapontar o perfil clínico a outro paciente = vazamento de dado
-- sensível). Mutável = só o conteúdo clínico.
REVOKE UPDATE ON patient_clinical_profile FROM app_role;
--> statement-breakpoint
GRANT UPDATE (
  diagnostico, medicacoes, alergias, convulsoes, contatos_emergencia
) ON patient_clinical_profile TO app_role;
--> statement-breakpoint

-- ======================== PX3a · patient_protocol ========================
-- PK/FKs imutáveis: id, patient_id, protocol_id (reapontar o vínculo a outro
-- paciente/protocolo), ativado_por (autoria da ativação — auditoria). Mutável
-- = só a vigência (datas de ativação/desativação).
REVOKE UPDATE ON patient_protocol FROM app_role;
--> statement-breakpoint
GRANT UPDATE (ativado_em, desativado_em) ON patient_protocol TO app_role;
--> statement-breakpoint

-- ===================== PX3b · care_team_membership =====================
-- PK/FKs de identidade imutáveis: id, patient_id, user_id (reatribuir a
-- filiação a outro paciente/profissional forjaria pertencimento de equipe e
-- abriria visibilidade clínica via app_is_on_team). Mutável = atributos e
-- vigência da filiação, incluindo o responsável técnico (reassinalável).
REVOKE UPDATE ON care_team_membership FROM app_role;
--> statement-breakpoint
GRANT UPDATE (
  disciplina, papel_na_equipe, vigencia_inicio, vigencia_fim,
  responsavel_tecnico_id
) ON care_team_membership TO app_role;
--> statement-breakpoint

-- ============================ PX4 · patient ============================
-- A10: decisão explícita (sem TBD). Travadas: id, clinic_id (tenant — antes só
-- barrado pelo WITH CHECK da patient_update; agora também no nível de
-- privilégio), criado_em (auditoria). Mutáveis = campos de cadastro
-- administrativo mantidos por recepção/coordenação.
REVOKE UPDATE ON patient FROM app_role;
--> statement-breakpoint
GRANT UPDATE (
  nome, nascimento, responsavel_contato, escola, convenio
) ON patient TO app_role;
