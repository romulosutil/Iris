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
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
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
  (t) => [index("idx_patient_clinic").on(t.clinicId)],
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
    index("idx_session_clinic_dia").on(t.clinicId, t.agendadaPara),
    index("idx_session_terapeuta_dia").on(t.terapeutaId, t.agendadaPara),
  ],
);
