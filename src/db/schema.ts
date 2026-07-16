/**
 * Schema Drizzle — Fase 1 (cadastro de paciente + agenda).
 * Só definições de TABELA. RLS, roles, REVOKE e seed ficam numa migração SQL
 * escrita à mão (`db/migrations/*_rls.sql`) — segurança crítica, controle total.
 * Fonte: docs/dados/modelo-de-dados.md. Padrão RLS: session GUC (app.*).
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Enum de papel. Nome _tipo evita colisão com a tabela associativa user_role.
export const userRoleTipo = pgEnum("user_role_tipo", [
  "terapeuta",
  "coordenador",
  "admin_recepcao",
]);

export const consentTipo = pgEnum("consent_tipo", [
  "tratamento_dados_menor",
  "uso_ia_processamento",
  "exportacao_relatorios",
]);

// Estados de check-in de uma sessão (Fase 1d). Ciclo mínimo: `agendada` →
// (check-in do terapeuta) `presente` → `realizada`; `falta`/`cancelada` são
// desfechos alternativos. Não é máquina de estados completa — só o esqueleto
// da agenda ("agenda não é módulo completo", modelo-de-dados §1.3).
export const sessionEstado = pgEnum("session_estado", [
  "agendada",
  "presente",
  "realizada",
  "falta",
  "cancelada",
]);

export const goalEstado = pgEnum("goal_estado", [
  "rascunho", "ativa", "dominada", "pausada", "descontinuada",
]);

export const sessionProtocolScopeOrigem = pgEnum("session_protocol_scope_origem", [
  "inferido_disciplina", "ajustado_manualmente",
]);

export const sessionNoteTipo = pgEnum("session_note_tipo", [
  "captura_rapida", "nota_consolidada",
]);

export const audioStatusUpload = pgEnum("audio_status_upload", [
  "rascunho_local", "pendente", "confirmado", "falhou",
]);

export const extractionEstado = pgEnum("extraction_estado", [
  "sugerida", "pendente_reprocessamento",
  // estados de revisão humana (Fase 3 Plano 2): a extração aprovada É o registro
  // oficial (tabela `evidence` dedicada adiada p/ Fase 4).
  "aprovada", "editada", "descartada", "erro_validacao",
]);

// subtipo/confianca text→enum agora que o contrato do agente estabilizou (dívida
// registrada na Fase 2). "pendente" entra no enum de subtipo porque o
// NullProvider já gravou linhas assim em produção (não quebrar dado existente).
export const extractionSubtipo = pgEnum("extraction_subtipo", [
  "evidencia", "registro_abc", "ausencia_comportamento", "cadeia",
  "preferencia_reforcador", "pendente",
]);

export const extractionConfianca = pgEnum("extraction_confianca", [
  "alta", "media", "baixa",
]);

export const milestoneTipoEstrutura = pgEnum("milestone_tipo_estrutura", [
  "marco_simples", "marco_com_barreira", "escore_composto", "faixa_normativa",
]);

// Fase 4 (4A — Evidence layer). Ação de revisão do coordenador sobre uma
// evidência já gravada (log append-only, nunca sobrescreve a linha original).
export const evidenceRevisionAcao = pgEnum("evidence_revision_acao", [
  "confirmar", "reclassificar", "invalidar",
]);

// Fase 4 (4C.1) — valência de reforçador/preferência observada (R17,
// preferencia_reforcador). `saciado` é first-class: precisa poder DEMOVER um
// item que já foi visto como reforçador forte (série, não conjunto flat).
export const reinforcerValencia = pgEnum("reinforcer_valencia", [
  "alta", "baixa", "saciado",
]);

// ─── Auth (Better-Auth) — `app_user` é a tabela `user` do Better-Auth ────────
// Chaves em camelCase = o que o Better-Auth espera; colunas em snake_case.
export const appUser = pgTable("app_user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const authSession = pgTable("auth_session", {
  id: uuid("id").primaryKey().defaultRandom(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id")
    .notNull()
    .references(() => appUser.id, { onDelete: "cascade" }),
});

export const authAccount = pgTable("auth_account", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => appUser.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const authVerification = pgTable("auth_verification", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Tenant + papéis ─────────────────────────────────────────────────────────
export const clinic = pgTable("clinic", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  responsavelContaId: uuid("responsavel_conta_id").references(() => appUser.id),
  politicaRetencaoMeses: integer("politica_retencao_meses"),
  politicaRetencaoConfig: jsonb("politica_retencao_config"),
  isDemo: boolean("is_demo").notNull().default(false),
  // Agenda 2.0: zona IANA da clínica (materialização/DST corretos).
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  // granularidade visual do calendário semanal (minutos).
  passoGradeMin: integer("passo_grade_min").notNull().default(30),
  // default de duração por disciplina, ex {"aba":60,"fono":30,"to":50}.
  duracaoDisciplina: jsonb("duracao_disciplina").notNull().default({}),
  criadoEm: timestamp("criado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userRole = pgTable(
  "user_role",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    papel: userRoleTipo("papel").notNull(),
  },
  // PK inclui clinic_id: a mesma pessoa pode ter o mesmo papel em clínicas
  // diferentes (conta global multi-tenant). PK(user_id, papel) violaria isso.
  (t) => [primaryKey({ columns: [t.userId, t.clinicId, t.papel] })],
);

// ─── Paciente (administrativo) + perfil clínico (bloqueado p/ recepção) ──────
export const patient = pgTable(
  "patient",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "restrict" }),
    nome: text("nome").notNull(),
    nascimento: date("nascimento"),
    responsavelContato: text("responsavel_contato"),
    escola: text("escola"),
    convenio: text("convenio"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_patient_clinic").on(t.clinicId),
    // Alvo das FKs compostas (patient_id, clinic_id) das tabelas da Agenda 2.0
    // (anti-IDOR em nível de banco). PK só em `id` não satisfaz FK de 2 colunas.
    unique("uq_patient_id_clinic").on(t.id, t.clinicId),
  ],
);

export const patientClinicalProfile = pgTable("patient_clinical_profile", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id")
    .notNull()
    .unique()
    .references(() => patient.id, { onDelete: "cascade" }),
  diagnostico: text("diagnostico"),
  medicacoes: text("medicacoes"),
  alergias: text("alergias"),
  convulsoes: text("convulsoes"),
  contatosEmergencia: text("contatos_emergencia"),
  criadoEm: timestamp("criado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const consent = pgTable("consent", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id")
    .notNull()
    .references(() => patient.id, { onDelete: "restrict" }),
  tipo: consentTipo("tipo").notNull(),
  responsavelSignatario: text("responsavel_signatario").notNull(),
  versaoTermo: text("versao_termo").notNull(),
  assinadoEm: timestamp("assinado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Protocolos (catálogo + instância por paciente) ──────────────────────────
export const protocolFamiliaCatalogo = pgTable("protocol_familia_catalogo", {
  id: text("id").primaryKey(),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
});

export const protocol = pgTable(
  "protocol",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "restrict" }),
    nome: text("nome").notNull(),
    versao: text("versao"),
    disciplina: text("disciplina").notNull(),
    familia: text("familia")
      .notNull()
      .references(() => protocolFamiliaCatalogo.id),
    taxonomiaAjuda: jsonb("taxonomia_ajuda").notNull().default([]),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_protocol_familia").on(t.familia)],
);

export const patientProtocol = pgTable(
  "patient_protocol",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patient.id, { onDelete: "cascade" }),
    protocolId: uuid("protocol_id")
      .notNull()
      .references(() => protocol.id, { onDelete: "restrict" }),
    ativadoEm: date("ativado_em").notNull().defaultNow(),
    desativadoEm: date("desativado_em"),
    ativadoPor: uuid("ativado_por")
      .notNull()
      .references(() => appUser.id),
  },
  (t) => [
    check(
      "patient_protocol_vigencia",
      sql`${t.desativadoEm} IS NULL OR ${t.desativadoEm} >= ${t.ativadoEm}`,
    ),
    index("idx_patient_protocol_ativo")
      .on(t.patientId)
      .where(sql`${t.desativadoEm} IS NULL`),
  ],
);

export const careTeamMembership = pgTable(
  "care_team_membership",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patient.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "restrict" }),
    disciplina: text("disciplina").notNull(),
    papelNaEquipe: text("papel_na_equipe").notNull(),
    vigenciaInicio: date("vigencia_inicio").notNull().defaultNow(),
    vigenciaFim: date("vigencia_fim"),
    responsavelTecnicoId: uuid("responsavel_tecnico_id").references(
      () => appUser.id,
    ),
  },
  (t) => [
    check(
      "ctm_papel",
      sql`${t.papelNaEquipe} IN ('terapeuta_referencia','coordenador_referencia','substituto')`,
    ),
    check(
      "ctm_nao_auto_supervisao",
      sql`${t.responsavelTecnicoId} IS NULL OR ${t.responsavelTecnicoId} <> ${t.userId}`,
    ),
    index("idx_ctm_patient_vigente")
      .on(t.patientId)
      .where(sql`${t.vigenciaFim} IS NULL`),
    index("idx_ctm_user_vigente")
      .on(t.userId)
      .where(sql`${t.vigenciaFim} IS NULL`),
  ],
);

// ─── Agenda mínima + check-in (Fase 1d) ──────────────────────────────────────
// `session` = ocorrência (realizada/falta/cancelada) de atendimento. Carrega o
// esqueleto mínimo da agenda: quem, qual paciente, quando, estado de check-in.
// Recorrência (`appointment`) e o texto da sessão (`session_note`) ficam para
// fases futuras (2/3). RLS à mão em db/migrations (segurança crítica).
export const session = pgTable(
  "session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "restrict" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patient.id, { onDelete: "restrict" }),
    // Profissional que conduz a sessão (referência global; o vínculo à clínica
    // vem de user_role, validado no WITH CHECK do RLS via app_user_in_clinic).
    terapeutaId: uuid("terapeuta_id")
      .notNull()
      .references(() => appUser.id),
    agendadaPara: timestamp("agendada_para", { withTimezone: true }).notNull(),
    estado: sessionEstado("estado").notNull().default("agendada"),
    checkInEm: timestamp("check_in_em", { withTimezone: true }),
    // Base numérica da linha do tempo ("sessão 45"). Só é populado na
    // consolidação da sessão (Fase 2/3) — nullable de propósito na 1d.
    numeroSequencialPaciente: integer("numero_sequencial_paciente"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Índices por clínica/terapeuta + horário. A grade do dia filtra por
    // INTERVALO na coluna crua (`agendada_para >= início AND < fim`, ver
    // listarSessoesDoDia), que é sargable e usa estes índices — em vez de um
    // cast por linha (`AT TIME ZONE …`::date), que seria non-sargable.
    index("idx_session_clinic_dia").on(t.clinicId, t.agendadaPara),
    index("idx_session_terapeuta_dia").on(t.terapeutaId, t.agendadaPara),
    // Rede contra corrida no cálculo de numero_sequencial_paciente (ver
    // db/migrations/0007_session_numero_seq.sql) — nunca duplica por paciente.
    uniqueIndex("uq_session_numero_por_paciente")
      .on(t.patientId, t.numeroSequencialPaciente)
      .where(sql`${t.numeroSequencialPaciente} IS NOT NULL`),
  ],
);

// ─── Diário de sessão + captura de áudio + extração (Fase 2) ────────────────
export const sessionNote = pgTable(
  "session_note",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => session.id, { onDelete: "restrict" }),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "restrict" }),
    tipo: sessionNoteTipo("tipo").notNull(),
    texto: text("texto").notNull(),
    autorId: uuid("autor_id")
      .notNull()
      .references(() => appUser.id),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // 1 captura_rapida + 1 nota_consolidada por sessão
    unique("uq_session_note_tipo").on(t.sessionId, t.tipo),
    index("idx_session_note_session").on(t.sessionId),
  ],
);

export const sessionProtocolScope = pgTable(
  "session_protocol_scope",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => session.id, { onDelete: "cascade" }),
    protocolId: uuid("protocol_id")
      .notNull()
      .references(() => protocol.id, { onDelete: "restrict" }),
    origem: sessionProtocolScopeOrigem("origem").notNull().default("inferido_disciplina"),
    ajustadoPor: uuid("ajustado_por").references(() => appUser.id),
  },
  (t) => [unique("uq_session_protocol_scope").on(t.sessionId, t.protocolId)],
);

export const audioCapture = pgTable(
  "audio_capture",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => session.id, { onDelete: "restrict" }),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "restrict" }),
    statusUpload: audioStatusUpload("status_upload").notNull().default("rascunho_local"),
    // Referência ao objeto no storage — nulo enquanto o áudio vive só local (Fase 2).
    objetoRef: text("objeto_ref"),
    duracaoSegundos: integer("duracao_segundos"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_audio_capture_session").on(t.sessionId)],
);

export const extraction = pgTable(
  "extraction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => session.id, { onDelete: "restrict" }),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "restrict" }),
    estado: extractionEstado("estado").notNull().default("sugerida"),
    subtipo: extractionSubtipo("subtipo").notNull(),
    trechoFonte: text("trecho_fonte").notNull(),
    confianca: extractionConfianca("confianca").notNull(),
    justificativaConfianca: text("justificativa_confianca"),
    inconsistenteComHistorico: boolean("inconsistente_com_historico").notNull().default(false),
    parContrasteId: text("par_contraste_id"),
    payload: jsonb("payload").notNull(),           // sugestão ORIGINAL da IA — imutável (auditoria Camada 1)
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    // revisão humana: conteúdo editado pelo terapeuta (null = aprovado sem
    // edição); conteúdo efetivo = payloadEditado ?? payload. Preserva a
    // distinção "o que a IA sugeriu" vs "o que o humano aprovou".
    payloadEditado: jsonb("payload_editado"),
    revisadoPor: uuid("revisado_por").references(() => appUser.id),
    revisadoEm: timestamp("revisado_em", { withTimezone: true }),
    versao: integer("versao").notNull().default(1),
  },
  (t) => [index("idx_extraction_session").on(t.sessionId)],
);

// ─── Metas + marcos (Fase 2) ─────────────────────────────────────────────────
export const milestone = pgTable(
  "milestone",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    protocolId: uuid("protocol_id")
      .notNull()
      .references(() => protocol.id, { onDelete: "cascade" }),
    dominioId: text("dominio_id").notNull(),       // 'mando','tato',... chave estável do agente
    nome: text("nome").notNull(),
    nivel: text("nivel"),
    tipoEstrutura: milestoneTipoEstrutura("tipo_estrutura").notNull(),
    estrutura: jsonb("estrutura").notNull(),       // escala/critério formal/componentes
    ordem: integer("ordem"),
  },
  (t) => [
    unique("uq_milestone_protocol_dominio_nivel")
      .on(t.protocolId, t.dominioId, t.nivel)
      .nullsNotDistinct(),
    index("idx_milestone_protocol_dominio").on(t.protocolId, t.dominioId),
  ],
);

export const goal = pgTable(
  "goal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patient.id, { onDelete: "restrict" }),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "restrict" }),
    descricao: text("descricao").notNull(),        // linguagem simples (família também vê)
    disciplina: text("disciplina"),                // 'ABA'|'Fono'|'TO' — nullable: meta pode não mapear marco (wireframe 4.4)
    estado: goalEstado("estado").notNull().default("rascunho"),
    criterioDominio: jsonb("criterio_dominio").notNull(), // {"tipo":"...","valor":3}
    cicloRevisaoSemanas: integer("ciclo_revisao_semanas").notNull().default(10),
    proximaRevisaoEm: date("proxima_revisao_em"),
    criadoPor: uuid("criado_por")
      .notNull()
      .references(() => appUser.id),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_goal_patient_estado").on(t.patientId, t.estado)],
);

export const goalMilestoneMapping = pgTable(
  "goal_milestone_mapping",
  {
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goal.id, { onDelete: "cascade" }),
    milestoneId: uuid("milestone_id")
      .notNull()
      .references(() => milestone.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.goalId, t.milestoneId] })],
);

export const goalCandidacy = pgTable("goal_candidacy", {
  goalId: uuid("goal_id")
    .primaryKey()
    .references(() => goal.id, { onDelete: "cascade" }),
  isCandidateDominada: boolean("is_candidate_dominada").notNull().default(false),
  candidacySince: timestamp("candidacy_since", { withTimezone: true }),
});

export const milestoneCandidacy = pgTable(
  "milestone_candidacy",
  {
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patient.id, { onDelete: "cascade" }),
    milestoneId: uuid("milestone_id")
      .notNull()
      .references(() => milestone.id, { onDelete: "cascade" }),
    isCandidate: boolean("is_candidate").notNull().default(false),
    candidacySince: timestamp("candidacy_since", { withTimezone: true }),
    evidenceCount: integer("evidence_count").notNull().default(0),
    distinctSessions: integer("distinct_sessions").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.patientId, t.milestoneId] })],
);

// ─── Evidence layer (Fase 4 · 4A) ────────────────────────────────────────────
// `evidence` — grão de ALVO (1 linha = 1 item de `alvos[]` da extração
// aprovada/editada), identificado pela POSIÇÃO no array (`alvoOrdinal`, base 0).
// Append-only por design (sem coluna de UPDATE prevista; UPDATE/DELETE
// revogados de app_role na migração de RLS). O agente emite refs CRUS de
// catálogo (`protocolSlug`/`dominioId`/`goalRef`, texto livre); os UUIDs
// resolvidos (`protocolId`/`goalId`/`milestoneId`) são best-effort agora e
// preenchidos pela resolução slug→UUID depois — por isso nullable.
export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    extractionId: uuid("extraction_id")
      .notNull()
      .references(() => extraction.id),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patient.id),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => session.id),
    // número sequencial do paciente; base da linha do tempo
    sessionNumero: integer("session_numero").notNull(),
    // posição do alvo em alvos[] (base 0); discriminador de idempotência
    alvoOrdinal: integer("alvo_ordinal").notNull(),
    // refs CRUS do agente (texto livre, preservados para a resolução futura)
    protocolSlug: text("protocol_slug"),
    dominioId: text("dominio_id"),
    goalRef: text("goal_ref"),
    // UUIDs resolvidos (best-effort agora, resolução completa depois)
    protocolId: uuid("protocol_id").references(() => protocol.id),
    goalId: uuid("goal_id").references(() => goal.id),
    milestoneId: uuid("milestone_id").references(() => milestone.id),
    // cópia congelada do alvo aprovado (payloadEditado ?? payload)
    classificacaoOriginal: jsonb("classificacao_original").notNull(),
    aprovadoPor: uuid("aprovado_por")
      .notNull()
      .references(() => appUser.id),
    aprovadoEm: timestamp("aprovado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_evidence_patient_session").on(t.patientId, t.sessionNumero),
    index("idx_evidence_goal").on(t.goalId).where(sql`${t.goalId} IS NOT NULL`),
    index("idx_evidence_milestone")
      .on(t.milestoneId)
      .where(sql`${t.milestoneId} IS NOT NULL`),
    // Idempotência do backfill e do insert por alvo: o discriminador é o ORDINAL
    // do alvo na extração, NÃO os FKs (que podem estar nulos até a resolução
    // slug→UUID rodar). `(extraction_id, alvo_ordinal)` é estável e único.
    unique("uq_evidence_alvo").on(t.extractionId, t.alvoOrdinal),
  ],
);

// `evidence_revision` — log append-only de reclassificação/invalidação pelo
// coordenador (governança V1/V2). `autor_id` é sempre coordenador — a
// aplicação garante, RLS reforça.
export const evidenceRevision = pgTable(
  "evidence_revision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id),
    acao: evidenceRevisionAcao("acao").notNull(),
    classificacaoAnterior: jsonb("classificacao_anterior").notNull(),
    classificacaoNova: jsonb("classificacao_nova"), // NULL quando acao = 'invalidar'
    justificativa: text("justificativa").notNull(),
    autorId: uuid("autor_id")
      .notNull()
      .references(() => appUser.id),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_evidence_revision_evidence").on(t.evidenceId, t.criadoEm.desc()),
  ],
);

// `evidence_query` — "devolver com dúvida" (governança V2): coordenador pede
// esclarecimento ao terapeuta sobre uma evidência antes de decidir.
export const evidenceQuery = pgTable("evidence_query", {
  id: uuid("id").primaryKey().defaultRandom(),
  evidenceId: uuid("evidence_id")
    .notNull()
    .references(() => evidence.id),
  coordenadorId: uuid("coordenador_id")
    .notNull()
    .references(() => appUser.id),
  pergunta: text("pergunta").notNull(),
  respostaTexto: text("resposta_texto"),
  resultanteEvidenceRevisionId: uuid(
    "resultante_evidence_revision_id",
  ).references(() => evidenceRevision.id),
  criadoEm: timestamp("criado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
  respondidoEm: timestamp("respondido_em", { withTimezone: true }),
});

// `reinforcer_profile` (Fase 4 · 4C.1) — perfil vivo do que reforça o
// paciente (modelo-de-dados.md §1.4). Preserva RECÊNCIA + VALÊNCIA como
// SÉRIE (1 linha por observação), não conjunto flat: `saciado` precisa poder
// demover um item visto antes como reforçador forte, e o Briefing lê o
// most-recent-per-item — por isso é append-per-observation, igual a
// `evidence` (grão de alvo), não upsert-por-item.
export const reinforcerProfile = pgTable(
  "reinforcer_profile",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    extractionId: uuid("extraction_id")
      .notNull()
      .references(() => extraction.id),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patient.id),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => session.id),
    // número sequencial do paciente; base da recência (most-recent-per-item)
    sessionNumero: integer("session_numero").notNull(),
    itemAtividade: text("item_atividade").notNull(),
    valencia: reinforcerValencia("valencia").notNull(),
    registradoEm: timestamp("registrado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_reinforcer_profile_patient_session").on(
      t.patientId,
      t.sessionNumero.desc(),
    ),
    // idempotência: 1 extração só pode gerar 1 observação por item — re-aprovar
    // (ou reprocessar) não duplica, mesmo padrão de uq_evidence_alvo.
    unique("uq_reinforcer_profile_extraction_item").on(
      t.extractionId,
      t.itemAtividade,
    ),
  ],
);

// ─── SessionSnapshot (Fase 4 · 4B) ───────────────────────────────────────────
// Materialização do estado do repertório do paciente ao fim de cada sessão
// (decisão "b4", modelo-de-dados.md §2.5). Espelha o padrão FK-a-paciente de
// `milestone_candidacy` (sem clinic_id direto). Escrita só via função
// SECURITY DEFINER `app_materializar_snapshot` (0016) — app_role tem GRANT
// SELECT apenas.
export const sessionSnapshot = pgTable(
  "session_snapshot",
  {
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patient.id),
    sessionNumero: integer("session_numero").notNull(),
    // ESTRITAMENTE numérico/enum — nunca texto livre nem narrativa ABC (LGPD:
    // tabela de alto tráfego lida em todo briefing/scrubber). A narrativa ABC
    // é lida de `evidence` no render, não materializada aqui.
    repertorioState: jsonb("repertorio_state").notNull(), // {goal_id/milestone_id: {metrica_recente, contagem, is_candidata}}
    // Chaveado por (goal_id, protocol_id) e carregando a métrica-por-tipo —
    // nunca eixo único de nivel_ajuda (reconciliação 13/07/2026, Fase 4):
    segmentacao: jsonb("segmentacao").notNull(), // {goal_id: {protocol_id: {tipo_estrutura, metrica, rotulo}}}
    geradoEm: timestamp("gerado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.patientId, t.sessionNumero] }),
    index("idx_session_snapshot_patient").on(t.patientId, t.sessionNumero.desc()),
  ],
);
