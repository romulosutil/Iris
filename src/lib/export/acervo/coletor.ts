/**
 * Coletor do Acervo Integral da Clínica (#374 ∪ #353, Task T2).
 *
 * Princípios inegociáveis:
 * 1. Roda SEMPRE sob `withTenant(clinicId, solicitanteId)` (D9) — nunca como owner/BYPASSRLS.
 * 2. Emissão em NDJSON ordenado determinística por PK (D5).
 * 3. Projeção controlada de `app_user` e exclusão de `patient.cpf_hash` e segredos.
 * 4. Exclusão de linhas com `deletado_em IS NOT NULL` (erasure LGPD aplicado).
 * 5. Coleta de PDFs congelados em `report_pdf` sem re-render e sem IA (D2).
 */
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/rls";

/**
 * Tabelas clínicas e contextuais no escopo da exportação integral (D4).
 */
export const TABELAS_EXPORTADAS = [
  "clinic",
  "app_user",
  "user_role",
  "patient",
  "patient_clinical_profile",
  "patient_alvo_disciplina",
  "consent",
  "professional_consent",
  "protocol",
  "patient_protocol",
  "care_team_membership",
  "janela_trabalho",
  "bloqueio",
  "agendamento_recorrente",
  "session",
  "session_note",
  "session_protocol_scope",
  "extraction",
  "milestone",
  "goal",
  "goal_milestone_mapping",
  "goal_candidacy",
  "milestone_candidacy",
  "evidence",
  "evidence_revision",
  "evidence_query",
  "reinforcer_profile",
  "session_snapshot",
  "report",
  "alerta",
  "alerta_risco_clinico",
  "tcc_rpd_entry",
  "instrumento_aplicacao",
  "instrumento_item_texto",
  "anamnese",
  "anamnese_alvo",
  "audit_log",
] as const;

export type TabelaExportada = (typeof TABELAS_EXPORTADAS)[number];

/**
 * Lista de negação explícita (D4) — tabelas que JAMAIS entram no acervo exportado.
 * Verificada por teste que varre o ZIP montado.
 */
export const TABELAS_NEGADAS = [
  "auth_account",
  "auth_session",
  "auth_verification",
  "two_factor",
  "auth_throttle",
  "subscription",
  "billing_cycle",
  "billing_cycle_patient",
  "asaas_webhook_event",
  "audio_capture",
  "protocol_familia_catalogo",
  "export_bundle",
  "export_bundle_blob",
] as const;

export type PdfCongelado = {
  reportId: string;
  bytes: Buffer;
};

export type TabelaColetada = {
  tabela: TabelaExportada;
  ndjson: string;
  total: number;
};

export type ResultadoColeta = {
  tabelas: TabelaColetada[];
  contagens: Record<string, number>;
  pdfs: PdfCongelado[];
};

/**
 * Normaliza valores de data e objetos para serialização JSON determinística.
 */
function serializarLinha(row: Record<string, unknown>): string {
  return JSON.stringify(row, (_key, value) => {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  });
}

/**
 * Coleta todos os dados do acervo da clínica na transação atual (sob RLS).
 */
export async function coletarAcervo(tx: Tx): Promise<ResultadoColeta> {
  const tabelas: TabelaColetada[] = [];
  const contagens: Record<string, number> = {};

  // 1. clinic
  const rowsClinic = (await tx.execute(sql`
    SELECT id, nome, cpf_cnpj, responsavel_conta_id, politica_retencao_meses,
           politica_retencao_config, is_demo, timezone, passo_grade_min,
           duracao_disciplina, taxonomia_distorcoes, faltas_limiar,
           faltas_janela_semanas, responsavel_tecnico_id, protocolo_emergencia_interno,
           protocolo_emergencia_declarado_em, protocolo_emergencia_declarado_por,
           trial_comeco_em, trial_dias, isento_trial, criado_em, razao_social,
           endereco_logradouro, endereco_numero, endereco_complemento,
           endereco_bairro, endereco_cidade, endereco_uf, endereco_cep,
           email_financeiro
      FROM clinic
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.clinic = rowsClinic.length;
  tabelas.push({
    tabela: "clinic",
    ndjson: rowsClinic.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsClinic.length,
  });

  // 2. app_user (projeção restrita a id, name, email, created_at)
  const rowsAppUser = (await tx.execute(sql`
    SELECT id, name, email, created_at
      FROM app_user
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.app_user = rowsAppUser.length;
  tabelas.push({
    tabela: "app_user",
    ndjson: rowsAppUser.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsAppUser.length,
  });

  // 3. user_role
  const rowsUserRole = (await tx.execute(sql`
    SELECT user_id, clinic_id, role
      FROM user_role
     ORDER BY user_id, clinic_id, role
  `)) as unknown as Record<string, unknown>[];
  contagens.user_role = rowsUserRole.length;
  tabelas.push({
    tabela: "user_role",
    ndjson: rowsUserRole.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsUserRole.length,
  });

  // 4. patient (exclusão estrita de cpf_hash)
  const rowsPatient = (await tx.execute(sql`
    SELECT id, clinic_id, nome, nascimento, alta_em, arquivado_em,
           responsavel_contato, escola, convenio, cpf, responsavel_cpf,
           clinical_modality, criado_em
      FROM patient
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.patient = rowsPatient.length;
  tabelas.push({
    tabela: "patient",
    ndjson: rowsPatient.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsPatient.length,
  });

  // 5. patient_clinical_profile
  const rowsPatientClinicalProfile = (await tx.execute(sql`
    SELECT id, patient_id, diagnostico, medicacoes, alergias, convulsoes,
           contatos_emergencia, criado_em
      FROM patient_clinical_profile
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.patient_clinical_profile = rowsPatientClinicalProfile.length;
  tabelas.push({
    tabela: "patient_clinical_profile",
    ndjson: rowsPatientClinicalProfile
      .map((r) => serializarLinha(r) + "\n")
      .join(""),
    total: rowsPatientClinicalProfile.length,
  });

  // 6. patient_alvo_disciplina
  const rowsPatientAlvoDisciplina = (await tx.execute(sql`
    SELECT id, patient_id, clinic_id, disciplina, ativo, criado_em, atualizado_em
      FROM patient_alvo_disciplina
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.patient_alvo_disciplina = rowsPatientAlvoDisciplina.length;
  tabelas.push({
    tabela: "patient_alvo_disciplina",
    ndjson: rowsPatientAlvoDisciplina
      .map((r) => serializarLinha(r) + "\n")
      .join(""),
    total: rowsPatientAlvoDisciplina.length,
  });

  // 7. consent
  const rowsConsent = (await tx.execute(sql`
    SELECT id, patient_id, clinic_id, tipo, versao_texto, assinado_em,
           assinado_por_nome, consent_revogado_id
      FROM consent
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.consent = rowsConsent.length;
  tabelas.push({
    tabela: "consent",
    ndjson: rowsConsent.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsConsent.length,
  });

  // 8. professional_consent
  const rowsProfessionalConsent = (await tx.execute(sql`
    SELECT id, user_id, clinic_id, versao_texto, assinado_em, criado_em
      FROM professional_consent
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.professional_consent = rowsProfessionalConsent.length;
  tabelas.push({
    tabela: "professional_consent",
    ndjson: rowsProfessionalConsent
      .map((r) => serializarLinha(r) + "\n")
      .join(""),
    total: rowsProfessionalConsent.length,
  });

  // 9. protocol
  const rowsProtocol = (await tx.execute(sql`
    SELECT id, clinic_id, nome, versao, taxonomia_ajuda, criado_em
      FROM protocol
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.protocol = rowsProtocol.length;
  tabelas.push({
    tabela: "protocol",
    ndjson: rowsProtocol.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsProtocol.length,
  });

  // 10. patient_protocol
  const rowsPatientProtocol = (await tx.execute(sql`
    SELECT id, patient_id, protocol_id, nivel_entrada, status, atribuido_em
      FROM patient_protocol
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.patient_protocol = rowsPatientProtocol.length;
  tabelas.push({
    tabela: "patient_protocol",
    ndjson: rowsPatientProtocol.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsPatientProtocol.length,
  });

  // 11. care_team_membership
  const rowsCareTeam = (await tx.execute(sql`
    SELECT id, patient_id, user_id, role, ativo, horas_semana_prescritas,
           prescricao_atualizada_em, prescricao_atualizada_por, criado_em
      FROM care_team_membership
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.care_team_membership = rowsCareTeam.length;
  tabelas.push({
    tabela: "care_team_membership",
    ndjson: rowsCareTeam.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsCareTeam.length,
  });

  // 12. janela_trabalho
  const rowsJanelaTrabalho = (await tx.execute(sql`
    SELECT id, clinic_id, terapeuta_id, dia_semana, hora_inicio, hora_fim, criado_em
      FROM janela_trabalho
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.janela_trabalho = rowsJanelaTrabalho.length;
  tabelas.push({
    tabela: "janela_trabalho",
    ndjson: rowsJanelaTrabalho.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsJanelaTrabalho.length,
  });

  // 13. bloqueio
  const rowsBloqueio = (await tx.execute(sql`
    SELECT id, clinic_id, terapeuta_id, data_inicio, data_fim, motivo, criado_em
      FROM bloqueio
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.bloqueio = rowsBloqueio.length;
  tabelas.push({
    tabela: "bloqueio",
    ndjson: rowsBloqueio.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsBloqueio.length,
  });

  // 14. agendamento_recorrente
  const rowsAgendamentoRecorrente = (await tx.execute(sql`
    SELECT id, clinic_id, patient_id, terapeuta_id, dia_semana, hora_inicio,
           hora_fim, disciplina, ativo, criado_em
      FROM agendamento_recorrente
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.agendamento_recorrente = rowsAgendamentoRecorrente.length;
  tabelas.push({
    tabela: "agendamento_recorrente",
    ndjson: rowsAgendamentoRecorrente
      .map((r) => serializarLinha(r) + "\n")
      .join(""),
    total: rowsAgendamentoRecorrente.length,
  });

  // 15. session
  const rowsSession = (await tx.execute(sql`
    SELECT id, clinic_id, patient_id, terapeuta_id, atendido_por_id,
           recorrente_id, agendada_para, duracao_minutos, estado, disciplina,
           check_in_em, cancelada_em, cancelada_motivo, reposta_de_id, criado_em
      FROM session
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.session = rowsSession.length;
  tabelas.push({
    tabela: "session",
    ndjson: rowsSession.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsSession.length,
  });

  // 16. session_note
  const rowsSessionNote = (await tx.execute(sql`
    SELECT id, session_id, clinic_id, tipo, texto, autor_id, criado_em, atualizado_em
      FROM session_note
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.session_note = rowsSessionNote.length;
  tabelas.push({
    tabela: "session_note",
    ndjson: rowsSessionNote.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsSessionNote.length,
  });

  // 17. session_protocol_scope
  const rowsSessionProtocolScope = (await tx.execute(sql`
    SELECT id, session_id, protocol_id, origem, ajustado_por
      FROM session_protocol_scope
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.session_protocol_scope = rowsSessionProtocolScope.length;
  tabelas.push({
    tabela: "session_protocol_scope",
    ndjson: rowsSessionProtocolScope
      .map((r) => serializarLinha(r) + "\n")
      .join(""),
    total: rowsSessionProtocolScope.length,
  });

  // 18. extraction
  const rowsExtraction = (await tx.execute(sql`
    SELECT id, session_id, clinic_id, estado, subtipo, trecho_fonte,
           confianca, justificativa_confianca, inconsistente_com_historico,
           criado_em, revisado_em, revisado_por, aprovado_em, versao,
           payload_snapshot
      FROM extraction
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.extraction = rowsExtraction.length;
  tabelas.push({
    tabela: "extraction",
    ndjson: rowsExtraction.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsExtraction.length,
  });

  // 19. milestone
  const rowsMilestone = (await tx.execute(sql`
    SELECT id, protocol_id, codigo, descricao, ordem, nivel, area
      FROM milestone
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.milestone = rowsMilestone.length;
  tabelas.push({
    tabela: "milestone",
    ndjson: rowsMilestone.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsMilestone.length,
  });

  // 20. goal
  const rowsGoal = (await tx.execute(sql`
    SELECT id, clinic_id, patient_id, titulo, descricao, area, status,
           prioridade, criada_em, atualizada_em
      FROM goal
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.goal = rowsGoal.length;
  tabelas.push({
    tabela: "goal",
    ndjson: rowsGoal.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsGoal.length,
  });

  // 21. goal_milestone_mapping
  const rowsGoalMilestoneMapping = (await tx.execute(sql`
    SELECT goal_id, milestone_id
      FROM goal_milestone_mapping
     ORDER BY goal_id, milestone_id
  `)) as unknown as Record<string, unknown>[];
  contagens.goal_milestone_mapping = rowsGoalMilestoneMapping.length;
  tabelas.push({
    tabela: "goal_milestone_mapping",
    ndjson: rowsGoalMilestoneMapping
      .map((r) => serializarLinha(r) + "\n")
      .join(""),
    total: rowsGoalMilestoneMapping.length,
  });

  // 22. goal_candidacy
  const rowsGoalCandidacy = (await tx.execute(sql`
    SELECT patient_id, goal_id, is_candidate
      FROM goal_candidacy
     ORDER BY patient_id, goal_id
  `)) as unknown as Record<string, unknown>[];
  contagens.goal_candidacy = rowsGoalCandidacy.length;
  tabelas.push({
    tabela: "goal_candidacy",
    ndjson: rowsGoalCandidacy.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsGoalCandidacy.length,
  });

  // 23. milestone_candidacy
  const rowsMilestoneCandidacy = (await tx.execute(sql`
    SELECT patient_id, milestone_id, is_candidate, candidacy_since,
           evidence_count, distinct_sessions
      FROM milestone_candidacy
     ORDER BY patient_id, milestone_id
  `)) as unknown as Record<string, unknown>[];
  contagens.milestone_candidacy = rowsMilestoneCandidacy.length;
  tabelas.push({
    tabela: "milestone_candidacy",
    ndjson: rowsMilestoneCandidacy
      .map((r) => serializarLinha(r) + "\n")
      .join(""),
    total: rowsMilestoneCandidacy.length,
  });

  // 24. evidence
  const rowsEvidence = (await tx.execute(sql`
    SELECT id, clinic_id, patient_id, session_id, extraction_id, milestone_id,
           goal_id, tipo, valor, raw_text, autor_id, criado_em, aprovado_em,
           atualizado_em
      FROM evidence
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.evidence = rowsEvidence.length;
  tabelas.push({
    tabela: "evidence",
    ndjson: rowsEvidence.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsEvidence.length,
  });

  // 25. evidence_revision
  const rowsEvidenceRevision = (await tx.execute(sql`
    SELECT id, evidence_id, clinic_id, autor_id, tipo_revisao, valor_anterior,
           valor_novo, justificativa, criado_em
      FROM evidence_revision
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.evidence_revision = rowsEvidenceRevision.length;
  tabelas.push({
    tabela: "evidence_revision",
    ndjson: rowsEvidenceRevision.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsEvidenceRevision.length,
  });

  // 26. evidence_query
  const rowsEvidenceQuery = (await tx.execute(sql`
    SELECT id, patient_id, clinic_id, user_id, query_text, resultado_count, criado_em
      FROM evidence_query
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.evidence_query = rowsEvidenceQuery.length;
  tabelas.push({
    tabela: "evidence_query",
    ndjson: rowsEvidenceQuery.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsEvidenceQuery.length,
  });

  // 27. reinforcer_profile
  const rowsReinforcerProfile = (await tx.execute(sql`
    SELECT id, patient_id, clinic_id, item, valencia, observacoes, criado_em, atualizado_em
      FROM reinforcer_profile
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.reinforcer_profile = rowsReinforcerProfile.length;
  tabelas.push({
    tabela: "reinforcer_profile",
    ndjson: rowsReinforcerProfile
      .map((r) => serializarLinha(r) + "\n")
      .join(""),
    total: rowsReinforcerProfile.length,
  });

  // 28. session_snapshot
  const rowsSessionSnapshot = (await tx.execute(sql`
    SELECT patient_id, session_numero, repertorio_state, segmentacao, gerado_em
      FROM session_snapshot
     ORDER BY patient_id, session_numero
  `)) as unknown as Record<string, unknown>[];
  contagens.session_snapshot = rowsSessionSnapshot.length;
  tabelas.push({
    tabela: "session_snapshot",
    ndjson: rowsSessionSnapshot.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsSessionSnapshot.length,
  });

  // 29. report (metadados; soft-delete deletado_em IS NULL)
  const rowsReport = (await tx.execute(sql`
    SELECT id, clinic_id, patient_id, tipo, periodo_inicio, periodo_fim,
           status, payload, payload_versao, gerado_por_ia, pdf_hash,
           revisado_por, exportado_por, exportado_em, criado_em
      FROM report
     WHERE deletado_em IS NULL
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.report = rowsReport.length;
  tabelas.push({
    tabela: "report",
    ndjson: rowsReport.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsReport.length,
  });

  // 30. alerta (soft-delete deletado_em IS NULL)
  const rowsAlerta = (await tx.execute(sql`
    SELECT id, clinic_id, patient_id, tipo, nivel, mensagem, criado_por,
           criado_em, atualizado_por, atualizado_em
      FROM alerta
     WHERE deletado_em IS NULL
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.alerta = rowsAlerta.length;
  tabelas.push({
    tabela: "alerta",
    ndjson: rowsAlerta.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsAlerta.length,
  });

  // 31. alerta_risco_clinico (soft-delete deletado_em IS NULL)
  const rowsAlertaRisco = (await tx.execute(sql`
    SELECT id, clinic_id, patient_id, session_id, origem, nivel_risco, estado,
           reconhecido_por, reconhecido_em, atualizado_por, atualizado_em, criado_em
      FROM alerta_risco_clinico
     WHERE deletado_em IS NULL
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.alerta_risco_clinico = rowsAlertaRisco.length;
  tabelas.push({
    tabela: "alerta_risco_clinico",
    ndjson: rowsAlertaRisco.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsAlertaRisco.length,
  });

  // 32. tcc_rpd_entry
  const rowsTccRpd = (await tx.execute(sql`
    SELECT id, clinic_id, patient_id, session_id, data_registro, situacao,
           pensamento_automatico, distorcoes_cognitivas, emocao,
           emocao_intensidade, resposta_racional, resultado_emocao,
           resultado_intensidade, criado_por, criado_em
      FROM tcc_rpd_entry
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.tcc_rpd_entry = rowsTccRpd.length;
  tabelas.push({
    tabela: "tcc_rpd_entry",
    ndjson: rowsTccRpd.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsTccRpd.length,
  });

  // 33. instrumento_aplicacao
  const rowsInstrumento = (await tx.execute(sql`
    SELECT id, clinic_id, patient_id, instrumento_slug, versao, data_aplicacao,
           pontuacao_total, resultado_interpretado, criado_por, criado_em
      FROM instrumento_aplicacao
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.instrumento_aplicacao = rowsInstrumento.length;
  tabelas.push({
    tabela: "instrumento_aplicacao",
    ndjson: rowsInstrumento.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsInstrumento.length,
  });

  // 34. instrumento_item_texto
  const rowsInstrumentoItem = (await tx.execute(sql`
    SELECT instrumento_aplicacao_id, item_numero, texto
      FROM instrumento_item_texto
     ORDER BY instrumento_aplicacao_id, item_numero
  `)) as unknown as Record<string, unknown>[];
  contagens.instrumento_item_texto = rowsInstrumentoItem.length;
  tabelas.push({
    tabela: "instrumento_item_texto",
    ndjson: rowsInstrumentoItem.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsInstrumentoItem.length,
  });

  // 35. anamnese
  const rowsAnamnese = (await tx.execute(sql`
    SELECT id, clinic_id, patient_id, estado, protocol_id,
           nivel_entrada_sugerido, sugestao_aceita, observacoes,
           complementa_anamnese_id, criado_por, criado_em, validada_por, validada_em
      FROM anamnese
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.anamnese = rowsAnamnese.length;
  tabelas.push({
    tabela: "anamnese",
    ndjson: rowsAnamnese.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsAnamnese.length,
  });

  // 36. anamnese_alvo
  const rowsAnamneseAlvo = (await tx.execute(sql`
    SELECT id, anamnese_id, clinic_id, patient_id, eixo, descricao,
           disciplina, milestone_id, nivel_ajuda_inicial, procedencia,
           criterio_n, criterio_m, ciclo_revisao_semanas, goal_id, criado_em
      FROM anamnese_alvo
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.anamnese_alvo = rowsAnamneseAlvo.length;
  tabelas.push({
    tabela: "anamnese_alvo",
    ndjson: rowsAnamneseAlvo.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsAnamneseAlvo.length,
  });

  // 37. audit_log
  const rowsAuditLog = (await tx.execute(sql`
    SELECT id, clinic_id, ator_id, acao, entidade, entidade_id, patient_id,
           detalhe, criado_em
      FROM audit_log
     ORDER BY id
  `)) as unknown as Record<string, unknown>[];
  contagens.audit_log = rowsAuditLog.length;
  tabelas.push({
    tabela: "audit_log",
    ndjson: rowsAuditLog.map((r) => serializarLinha(r) + "\n").join(""),
    total: rowsAuditLog.length,
  });

  // Coleta de PDFs congelados em report_pdf (join com report não deletado)
  const rowsPdf = (await tx.execute(sql`
    SELECT rp.report_id, rp.bytes
      FROM report_pdf rp
      JOIN report r ON r.id = rp.report_id
     WHERE r.deletado_em IS NULL
     ORDER BY rp.report_id
  `)) as unknown as { report_id: string; bytes: Buffer }[];

  const pdfs: PdfCongelado[] = rowsPdf.map((r) => ({
    reportId: r.report_id,
    bytes: Buffer.isBuffer(r.bytes) ? r.bytes : Buffer.from(r.bytes),
  }));

  return {
    tabelas,
    contagens,
    pdfs,
  };
}
