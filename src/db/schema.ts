/**
 * Schema Drizzle — Fase 1 (cadastro de paciente + agenda).
 * Só definições de TABELA. RLS, roles, REVOKE e seed ficam numa migração SQL
 * escrita à mão (`db/migrations/*_rls.sql`) — segurança crítica, controle total.
 * Fonte: docs/dados/modelo-de-dados.md. Padrão RLS: session GUC (app.*).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
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

export const clinicalModalityEnum = pgEnum("clinical_modality", [
  "conventional",
  "protocol_driven",
  "cognitive_behavioral",
]);

// `tratamento_dados_menor` = responsável legal assina pelo paciente menor.
// `autoconsentimento_titular_adulto` (#100) = o próprio titular adulto assina.
// `representacao_curador` (#134) = curador assina pelo adulto sob curatela.
// `autoconsentimento_titular_emancipado` (#134) = menor emancipado assina por si.
// `revogacao_consentimento` (#133) = NÃO é uma concessão: é a linha nova que
// aponta (via `consentRevogadoId`) para a concessão que deixa de valer —
// `consent` é append-only, revogar nunca edita a linha original.
// O tipo é ESCOLHA EXPLÍCITA do operador no formulário, NUNCA derivado de
// `patient.nascimento` (nullable, e a idade erra nos dois sentidos: adolescente
// emancipado, adulto sob curatela).
export const consentTipo = pgEnum("consent_tipo", [
  "tratamento_dados_menor",
  "uso_ia_processamento",
  "exportacao_relatorios",
  "autoconsentimento_titular_adulto",
  "revogacao_consentimento",
  "representacao_curador",
  "autoconsentimento_titular_emancipado",
]);

// Estados de sessão (Agenda 2.0, Etapa A). Expande/substitui o enum da Fase 1d.
// O check-in não é mais um estado: presença é registrada por `checkInEm` e o
// estado permanece `agendada` até a consolidação (`realizada`). Migração de
// dados: presente→realizada, falta→falta_paciente (ver 0032).
export const sessionEstado = pgEnum("session_estado", [
  "agendada",
  "realizada",
  "falta_paciente",
  "falta_terapeuta",
  "cancelada",
]);

export const goalEstado = pgEnum("goal_estado", [
  "rascunho",
  "ativa",
  "dominada",
  "pausada",
  "descontinuada",
]);

export const sessionProtocolScopeOrigem = pgEnum(
  "session_protocol_scope_origem",
  ["inferido_disciplina", "ajustado_manualmente"],
);

export const sessionNoteTipo = pgEnum("session_note_tipo", [
  "captura_rapida",
  "nota_consolidada",
]);

export const sessionNoteVisibilityLevel = pgEnum(
  "session_note_visibility_level",
  ["multidisciplinary", "discipline_only"],
);

export const audioStatusUpload = pgEnum("audio_status_upload", [
  "rascunho_local",
  "pendente",
  "confirmado",
  "falhou",
]);

export const extractionEstado = pgEnum("extraction_estado", [
  "sugerida",
  "pendente_reprocessamento",
  // estados de revisão humana (Fase 3 Plano 2): a extração aprovada É o registro
  // oficial (tabela `evidence` dedicada adiada p/ Fase 4).
  "aprovada",
  "editada",
  "descartada",
  "erro_validacao",
]);

// subtipo/confianca text→enum agora que o contrato do agente estabilizou (dívida
// registrada na Fase 2). "pendente" entra no enum de subtipo porque o
// NullProvider já gravou linhas assim em produção (não quebrar dado existente).
export const extractionSubtipo = pgEnum("extraction_subtipo", [
  "evidencia",
  "registro_abc",
  "ausencia_comportamento",
  "cadeia",
  "preferencia_reforcador",
  "pendente",
  "registro_pensamento",
  "aplicacao_escala_relatada",
  "tarefa_casa",
]);

export const extractionConfianca = pgEnum("extraction_confianca", [
  "alta",
  "media",
  "baixa",
]);

export const milestoneTipoEstrutura = pgEnum("milestone_tipo_estrutura", [
  "marco_simples",
  "marco_com_barreira",
  "escore_composto",
  "faixa_normativa",
]);

// Fase 4 (4A — Evidence layer). Ação de revisão do coordenador sobre uma
// evidência já gravada (log append-only, nunca sobrescreve a linha original).
export const evidenceRevisionAcao = pgEnum("evidence_revision_acao", [
  "confirmar",
  "reclassificar",
  "invalidar",
]);

// Fase 4 (4C.1) — valência de reforçador/preferência observada (R17,
// preferencia_reforcador). `saciado` é first-class: precisa poder DEMOVER um
// item que já foi visto como reforçador forte (série, não conjunto flat).
export const reinforcerValencia = pgEnum("reinforcer_valencia", [
  "alta",
  "baixa",
  "saciado",
]);

// ─── Auth (Better-Auth) — `app_user` é a tabela `user` do Better-Auth ────────
// Chaves em camelCase = o que o Better-Auth espera; colunas em snake_case.
export const appUser = pgTable("app_user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  // Fase 6.2b: flag de enrollment do 2º fator (plugin twoFactor). Vira true no
  // 1º verifyTotp bem-sucedido. Papéis clínicos só operam com isto true.
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Registro profissional DECLARADO no cadastro aberto (spec §2, D6). Não há
  // verificação na API do conselho — o valor está na trilha, não na barreira.
  conselho: text("conselho"),
  registroNumero: text("registro_numero"),
  registroUf: text("registro_uf"),
  // Flag de administrador global/plataforma (#184). Dá acesso ao backoffice /benjamin.
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
});

// Fase 6.2b — tabela do plugin twoFactor (Better-Auth). Chaves em camelCase = o
// que o Better-Auth espera; colunas snake_case. `secret`/`backupCodes` guardam
// texto CIFRADO pelo Better-Auth (não modelar como array). Credencial: só
// iris_auth acessa (RLS em 0047), nunca app_role.
export const twoFactor = pgTable(
  "two_factor",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    verified: boolean("verified").notNull().default(true),
    failedVerificationCount: integer("failed_verification_count")
      .notNull()
      .default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => [index("idx_two_factor_user").on(t.userId)],
);

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
  issuer: text("issuer"),
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
  // Documento (CPF ou CNPJ) do titular da conta de cobrança. NULLABLE porque a
  // clínica existe e opera todo o trial sem ele: o documento só é exigido na
  // ativação da assinatura, onde o Asaas o pede para registrar o cliente do Pix
  // Automático (a ausência dele era a causa do 400 na ativação — #36). Só
  // dígitos, sem máscara; validado na aplicação e no guard da função definer.
  cpfCnpj: text("cpf_cnpj"),
  responsavelContaId: uuid("responsavel_conta_id").references(() => appUser.id),
  politicaRetencaoMeses: integer("politica_retencao_meses"),
  politicaRetencaoConfig: jsonb("politica_retencao_config"),
  isDemo: boolean("is_demo").notNull().default(false),
  // Agenda 2.0: zona IANA da clínica (materialização/DST corretos).
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  // granularidade visual do calendário semanal (minutos).
  passoGradeMin: integer("passo_grade_min").notNull().default(60),
  // default de duração por disciplina, ex {"aba":60,"fono":30,"to":50}.
  duracaoDisciplina: jsonb("duracao_disciplina").notNull().default({}),
  // #389 — taxonomia de distorções cognitivas do RPD é config por clínica,
  // não enum/CHECK fixo (R19: não existe fonte canônica única entre manuais
  // de TCC). Array de slugs; rótulos ficam em constants.ts. Mesmo padrão de
  // `protocol.taxonomia_ajuda` (array simples de strings, sem objetos).
  taxonomiaDistorcoes: jsonb("taxonomia_distorcoes")
    .notNull()
    .default([
      "catastrofizacao",
      "leitura_mental",
      "tudo_ou_nada",
      "generalizacao_excessiva",
      "desqualificacao_positivo",
      "raciocinio_emocional",
      "afirmacoes_deveria",
      "rotulacao",
      "personalizacao",
      "filtro_mental",
      "adivinhacao_futuro",
      "outra_nao_especificada",
    ]),
  // Fase 5 Fatia 2 (Supervisão): limiar de "faltas excessivas" do paciente —
  // N faltas (falta_paciente) numa janela de M semanas dispara o alerta.
  faltasLimiar: integer("faltas_limiar").notNull().default(3),
  faltasJanelaSemanas: integer("faltas_janela_semanas").notNull().default(4),
  // #122 — pré-requisitos do alerta de risco clínico (Fatia 4).
  // Responsável técnico: destinatário do estágio 2 (§4.2.1). É um usuário DA
  // clínica — nunca um contato externo. Distinto de `responsavelContaId`, que é
  // dono da conta/billing e pode não ser profissional de saúde.
  responsavelTecnicoId: uuid("responsavel_tecnico_id").references(
    () => appUser.id,
  ),
  // Protocolo de Emergência Interno DA PRÓPRIA CLÍNICA, exibido no estágio 2.
  // O Iris mostra o protocolo da clínica; nunca propõe conduta própria.
  protocoloEmergenciaInterno: text("protocolo_emergencia_interno"),
  // Declaração obrigatória (matriz do parecer + cláusula X.3 dos termos):
  // "Declaro que a clínica possui protocolo próprio de atendimento de
  // emergências". Guardamos QUEM e QUANDO — é prova de aceite, não um booleano.
  protocoloEmergenciaDeclaradoEm: timestamp(
    "protocolo_emergencia_declarado_em",
    {
      withTimezone: true,
    },
  ),
  protocoloEmergenciaDeclaradoPor: uuid(
    "protocolo_emergencia_declarado_por",
  ).references(() => appUser.id),
  // Fatia A (#163) / #175: relógio do trial. `trial_dias` é dado, não
  // constante, porque o valor é hipótese de produto (spec §2, D3).
  //
  // `trial_comeco_em` é NULLABLE de propósito (#175): NULL significa
  // "clínica cadastrada, ainda sem 1º paciente — relógio não começou". O
  // relógio dispara no cadastro do 1º paciente (mesma transação) ou, se
  // nenhum paciente for cadastrado, no teto de 14 dias após `criado_em`.
  // Foi `NOT NULL DEFAULT now()` na 0057, que precisou de um sentinela
  // '2020-01-01' para o legado — sentinela removido junto com esta mudança.
  trialComecoEm: timestamp("trial_comeco_em", { withTimezone: true }),
  trialDias: integer("trial_dias").notNull().default(7),
  // Clínicas pré-self-service (existiam antes da 0057) nunca contrataram um
  // trial. Sem esta flag elas cairiam no teto de 14 dias sobre `criado_em` e
  // virariam "trial vencido" — exatamente o bug que `ad789a6` corrigiu no
  // paliativo. `true` = fora do relógio de trial e do gate de pagamento.
  isentoTrial: boolean("isento_trial").notNull().default(false),
  criadoEm: timestamp("criado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // #262 (D31) — dados cadastrais e fiscais da clínica. Todos NULLABLE: a
  // clínica opera sem eles; são exigência do faturamento (Asaas) e do fiscal.
  // Escrita SOMENTE via app_salvar_dados_clinica (SECURITY DEFINER, 0095) —
  // sem GRANT UPDATE de coluna para app_role, mesmo padrão de cpf_cnpj (0090).
  razaoSocial: text("razao_social"),
  enderecoLogradouro: text("endereco_logradouro"),
  enderecoNumero: text("endereco_numero"),
  enderecoComplemento: text("endereco_complemento"),
  enderecoBairro: text("endereco_bairro"),
  enderecoCidade: text("endereco_cidade"),
  // UF em 2 letras maiúsculas; CEP só dígitos (8). Validação na aplicação e
  // no guard da função definer.
  enderecoUf: text("endereco_uf"),
  enderecoCep: text("endereco_cep"),
  emailFinanceiro: text("email_financeiro"),
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
    // Fase 6.3: data de alta clínica — fonte da regra de retenção/expurgo LGPD
    // (MAX(18 anos, alta+10a)). Nullable: em acompanhamento = nunca expurgável.
    altaEm: date("alta_em"),
    // #174 — arquivamento COMERCIAL, independente da alta clínica acima.
    // NULL = paciente ativo (critério (c) da contagem de faturados do ciclo).
    // Dar alta arquiva (trigger `patient_alta_arquiva_trg`, 0065); arquivar
    // nunca dá alta. Arquivado continua legível/exportável — é filtro de
    // negócio, nunca de RLS.
    arquivadoEm: timestamp("arquivado_em", { withTimezone: true }),
    responsavelContato: text("responsavel_contato"),
    escola: text("escola"),
    convenio: text("convenio"),
    // #191 — CPF do próprio paciente (titular adulto) ou do responsável legal
    // (menor). Exatamente um dos dois é preenchido, espelhando a escolha de
    // `tipoConsentimento` no cadastro — nunca os dois, nunca nenhum.
    cpf: text("cpf"),
    responsavelCpf: text("responsavel_cpf"),
    // Hash cego (HMAC-SHA256 + salt fora do repo) do CPF/responsavelCpf acima,
    // usado só para o EXISTS cross-tenant de #191 — nunca para reidentificar.
    cpfHash: text("cpf_hash"),
    clinicalModality: clinicalModalityEnum("clinical_modality")
      .notNull()
      .default("protocol_driven"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_patient_clinic").on(t.clinicId),
    index("patient_clinic_arquivado_idx").on(t.clinicId, t.arquivadoEm),
    // Alvo das FKs compostas (patient_id, clinic_id) das tabelas da Agenda 2.0
    // (anti-IDOR em nível de banco). PK só em `id` não satisfaz FK de 2 colunas.
    unique("uq_patient_id_clinic").on(t.id, t.clinicId),
    // #191 — unicidade SÓ no CPF do próprio titular adulto: ali o CPF
    // identifica o paciente, e repetir significa cadastro duplicado. UNIQUE do
    // Postgres trata múltiplos NULL como distintos, então as linhas de menores
    // (sempre NULL aqui) não colidem entre si.
    unique("uq_patient_clinic_cpf").on(t.clinicId, t.cpf),
    // `responsavel_cpf` NÃO é único de propósito: o CPF é de OUTRA pessoa, e um
    // mesmo responsável legitimamente tem mais de um filho em terapia na mesma
    // clínica — irmãos com TEA são comuns, não borda. UNIQUE aqui bloquearia o
    // cadastro do 2º filho. Índice simples só para a busca.
    index("idx_patient_clinic_responsavel_cpf").on(
      t.clinicId,
      t.responsavelCpf,
    ),
    index("idx_patient_cpf_hash").on(t.cpfHash),
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

// Append-only por design (LGPD): `REVOKE UPDATE, DELETE ON consent FROM
// app_role` em 0001_rls.sql. Renovação de consentimento é LINHA NOVA — não há
// UNIQUE em patient_id nem coluna de vigência. REVOGAÇÃO também é linha nova
// (#133): `tipo = 'revogacao_consentimento'` + `consentRevogadoId` apontando
// para a concessão que deixa de valer. Logo "consentimento vigente" NÃO é mais
// só "linha de maior `assinadoEm`" — é a última linha do tipo (desempate
// determinístico por `assinadoEm DESC, id DESC`, porque `defaultNow()` empata
// dentro de uma mesma transação) que NÃO tenha revogação apontando para ela.
// Espelho testável em `src/lib/consent/vigencia.ts`; fronteira real é a RLS.
//
// `versaoTermo` só é a versão de um TERMO ASSINADO quando
// `tipo <> 'revogacao_consentimento'`. Na linha de revogação ela guarda a
// versão do PROCEDIMENTO administrativo de revogação (`revogacao-v1`) — não
// existe termo de revogação assinado pelo titular. Relatórios/exports que
// tratarem `versaoTermo` como "versão de termo LGPD" precisam excluir esse
// tipo. O CHECK `consent_versao_termo_por_tipo` torna a convenção verificável.
export const consent = pgTable(
  "consent",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patient.id, { onDelete: "restrict" }),
    tipo: consentTipo("tipo").notNull(),
    // Nullable desde #100: no autoconsentimento de titular adulto não existe
    // responsável. NULL é a representação correta — preencher com o nome do
    // próprio paciente seria semanticamente falso e contaminaria exports.
    responsavelSignatario: text("responsavel_signatario"),
    // #133 — só preenchido em `revogacao_consentimento`: aponta a concessão
    // revogada. A FK é COMPOSTA com `patientId` (ver extras abaixo), não
    // `.references(() => consent.id)`: um ponteiro só por `id` permitiria
    // revogar consentimento de OUTRO paciente (e de outra clínica).
    consentRevogadoId: uuid("consent_revogado_id"),
    // #134 — identificação do documento que comprova a representação/
    // capacidade: processo/termo de curatela, ou certidão de emancipação.
    // "idade > 18" não é prova de capacidade civil; o instrumento é a prova
    // rastreável dentro do próprio registro append-only.
    instrumentoRepresentacao: text("instrumento_representacao"),
    versaoTermo: text("versao_termo").notNull(),
    assinadoEm: timestamp("assinado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Alvo da auto-FK composta. `id` já é PK; este UNIQUE existe só para dar
    // ao par (id, patient_id) um índice único referenciável.
    unique("consent_id_patient_uniq").on(t.id, t.patientId),
    // Auto-FK COMPOSTA: a revogação tem de apontar para uma linha do MESMO
    // paciente. `MATCH SIMPLE` (padrão, não escrever MATCH FULL): com
    // `consentRevogadoId` NULL a restrição é satisfeita sem lookup — é o que
    // permite que linhas de concessão existam. `ON DELETE NO ACTION` (não
    // RESTRICT): `app_purgar_paciente` apaga todo o `consent` do paciente num
    // único DELETE, e RESTRICT quebraria o expurgo LGPD.
    foreignKey({
      name: "consent_revogado_mesmo_paciente",
      columns: [t.consentRevogadoId, t.patientId],
      foreignColumns: [t.id, t.patientId],
    }).onDelete("no action"),
    // Última linha de defesa: qualquer novo caminho de escrita (script admin,
    // migração de dados, outro formulário) é barrado pelo banco, não só pela
    // validação de app. `::text` espelha o SQL de 0051 — ver a nota lá.
    //
    // CUSTO DO `::text`: a constraint fica CEGA a `ALTER TYPE ... RENAME VALUE`
    // — renomear um valor de `consentTipo` não reescreve o literal de texto do
    // lado direito, e o CHECK passa a rejeitar silenciosamente toda linha
    // daquele valor. Quem renomear tem que reescrever esta constraint junto.
    //
    // `IS NOT NULL` E `btrim(...) <> ''`, nunca um no lugar do outro: `''` e
    // `'   '` satisfazem NOT NULL e são a sentinela falsa que a constraint
    // existe para impedir; e trocar o NULL-check pelo btrim abriria um buraco
    // maior, porque em CHECK uma expressão que avalia para NULL SATISFAZ a
    // constraint (só FALSE rejeita).
    //
    // FAIL-CLOSED INTENCIONAL: um valor futuro de `consentTipo` não casa
    // nenhum arm e é REJEITADO no INSERT. Quem adicionar valor ao enum tem de
    // adicionar o arm aqui e na migração — é de propósito, para que um tipo
    // novo não entre no banco com combinação de colunas não decidida.
    check(
      "consent_responsavel_por_tipo",
      sql`(${t.tipo}::text = 'tratamento_dados_menor'
    AND ${t.responsavelSignatario} IS NOT NULL
    AND btrim(${t.responsavelSignatario}) <> ''
    AND ${t.instrumentoRepresentacao} IS NULL
    AND ${t.consentRevogadoId} IS NULL)
  OR (${t.tipo}::text = 'autoconsentimento_titular_adulto'
    AND ${t.responsavelSignatario} IS NULL
    AND ${t.instrumentoRepresentacao} IS NULL
    AND ${t.consentRevogadoId} IS NULL)
  OR (${t.tipo}::text = 'representacao_curador'
    AND ${t.responsavelSignatario} IS NOT NULL
    AND btrim(${t.responsavelSignatario}) <> ''
    AND ${t.instrumentoRepresentacao} IS NOT NULL
    AND btrim(${t.instrumentoRepresentacao}) <> ''
    AND ${t.consentRevogadoId} IS NULL)
  OR (${t.tipo}::text = 'autoconsentimento_titular_emancipado'
    AND ${t.responsavelSignatario} IS NULL
    AND ${t.instrumentoRepresentacao} IS NOT NULL
    AND btrim(${t.instrumentoRepresentacao}) <> ''
    AND ${t.consentRevogadoId} IS NULL)
  OR (${t.tipo}::text IN ('uso_ia_processamento', 'exportacao_relatorios')
    AND ${t.instrumentoRepresentacao} IS NULL
    AND ${t.consentRevogadoId} IS NULL)
  OR (${t.tipo}::text = 'revogacao_consentimento'
    AND ${t.consentRevogadoId} IS NOT NULL
    AND ${t.instrumentoRepresentacao} IS NULL)`,
    ),
    // Torna VERIFICÁVEL a convenção de `versaoTermo` documentada no comentário
    // da tabela: `revogacao-%` sse a linha for de revogação. Bicondicional, não
    // implicação — impede tanto revogação com "adulto-v1" quanto concessão
    // gravada com "revogacao-v1".
    check(
      "consent_versao_termo_por_tipo",
      sql`(${t.tipo}::text = 'revogacao_consentimento') = (${t.versaoTermo} LIKE 'revogacao-%')`,
    ),
  ],
);

/**
 * Aceite dos termos de uso pelo PROFISSIONAL (adulto) no cadastro self-service.
 * Não confundir com o consentimento do titular do tratamento (paciente) —
 * outro titular, outra base legal. Imutável para a aplicação de produto.
 */
export const professionalConsent = pgTable(
  "professional_consent",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id),
    versaoTermo: text("versao_termo").notNull(),
    aceitoEm: timestamp("aceito_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [
    // Corrida entre requisições concorrentes de retomada não deve criar
    // dois aceites para a mesma tripla — onConflictDoNothing em cadastro.ts
    // depende deste índice existir (migração 0060).
    uniqueIndex("uq_professional_consent_user_clinic_versao").on(
      t.userId,
      t.clinicId,
      t.versaoTermo,
    ),
  ],
);

/**
 * Contador de tentativas da rota pública de cadastro (migração 0061).
 * Compartilhado entre instâncias e persistente de propósito — ver o comentário
 * longo da migração e `src/lib/throttle.ts`. Não é dado de paciente: só
 * `iris_auth` tem grant.
 */
export const authThrottle = pgTable("auth_throttle", {
  chave: text("chave").primaryKey(),
  contagem: integer("contagem").notNull().default(0),
  // Âncora do backoff (migração 0062): o fim da janela é calculado a partir do
  // INÍCIO dela, não de `now()` — senão cada requisição extra empurra o fim e o
  // bloqueio vira prorrogável para sempre.
  janelaInicioEm: timestamp("janela_inicio_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
  janelaExpiraEm: timestamp("janela_expira_em", {
    withTimezone: true,
  }).notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
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
    // #203 — carga semanal que este vínculo consome do alvo prescrito
    // (patient_alvo_disciplina). NULLABLE de propósito, por duas razões, não
    // por falta de rigor: vínculos legado anteriores à 0076 não têm carga, e
    // `coordenador_referencia` é gestão e NUNCA tem (ver ctmGestaoSemHoras).
    // A obrigatoriedade em papel que consome é validação de aplicação (D-D).
    horasSemana: numeric("horas_semana", { precision: 4, scale: 1 }),
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
    // Passo de 30 min (a agenda é marcada assim) + teto de 60h como rede contra
    // erro de digitação. `IS NULL OR` explícito: expressão NULL num CHECK
    // SATISFAZ a constraint, então a nulidade tem que ser decisão declarada.
    check(
      "ctm_horas_semana_passo",
      sql`${t.horasSemana} IS NULL OR (${t.horasSemana} > 0 AND ${t.horasSemana} <= 60 AND (${t.horasSemana} * 10)::int % 5 = 0)`,
    ),
    // D-C: coordenador de referência é gestão do caso, não carga clínica. Quem
    // coordena E atende tem um SEGUNDO vínculo como terapeuta_referencia.
    check(
      "ctm_gestao_sem_horas",
      sql`${t.papelNaEquipe} <> 'coordenador_referencia' OR ${t.horasSemana} IS NULL`,
    ),
    index("idx_ctm_patient_vigente")
      .on(t.patientId)
      .where(sql`${t.vigenciaFim} IS NULL`),
    index("idx_ctm_user_vigente")
      .on(t.userId)
      .where(sql`${t.vigenciaFim} IS NULL`),
    // Sem isto, duplo-clique no submit vira DUPLA CONTAGEM de carga e a barra
    // de cobertura estoura sem causa visível. `papelNaEquipe` está na chave por
    // causa da D-C (mesma pessoa como gestora E terapeuta na mesma disciplina);
    // parcial para que encerrar libere a combinação e recontratar seja possível.
    uniqueIndex("ctm_unico_vigente")
      .on(t.patientId, t.userId, t.disciplina, t.papelNaEquipe)
      .where(sql`${t.vigenciaFim} IS NULL`),
  ],
);

// ─── Agenda 2.0 (Etapa A) — alvo de carga por disciplina, com vigência ───────
// Alvo CONTRATADO auditável: prescrição muda no meio do tratamento (2h→4h de
// ABA) e o convênio audita o alvo DA ÉPOCA. Vigência aberta (vigenciaFim null)
// = alvo vigente. FK composta (patient_id, clinic_id) impede IDOR cross-tenant.
export const patientAlvoDisciplina = pgTable(
  "patient_alvo_disciplina",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "restrict" }),
    patientId: uuid("patient_id").notNull(),
    disciplina: text("disciplina").notNull(),
    horasAlvoSemana: numeric("horas_alvo_semana", {
      precision: 4,
      scale: 1,
    }).notNull(),
    vigenciaInicio: date("vigencia_inicio").notNull(),
    vigenciaFim: date("vigencia_fim"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.patientId, t.clinicId],
      foreignColumns: [patient.id, patient.clinicId],
      name: "patient_alvo_disciplina_patient_fk",
    }).onDelete("cascade"),
    check(
      "patient_alvo_disciplina_vigencia",
      sql`${t.vigenciaFim} IS NULL OR ${t.vigenciaFim} >= ${t.vigenciaInicio}`,
    ),
    // #203 — mesma regra do lado do CONSUMO (ctm_horas_semana_passo). Constraint
    // só no lado da equipe produziria o absurdo de prescrever 0,3h e nunca
    // conseguir alocar contra isso. Aqui NOT NULL, então sem `IS NULL OR`.
    check(
      "patient_alvo_horas_passo",
      sql`${t.horasAlvoSemana} > 0 AND ${t.horasAlvoSemana} <= 60 AND (${t.horasAlvoSemana} * 10)::int % 5 = 0`,
    ),
    // #203 (0077) — UNIQUE, não só index: sem isso nada impedia DUAS
    // prescrições vigentes para a mesma disciplina, e o teto da barra de
    // cobertura passaria a depender de qual linha a query pegasse. Espelho
    // exato do `ctm_unico_vigente` do lado do consumo.
    //
    // PARCIAL de propósito: encerrar a vigência libera a combinação, então
    // represcrever a mesma disciplina segue possível com as duas passagens
    // preservadas — é o que o SCD2 desta tabela exige.
    uniqueIndex("patient_alvo_unico_vigente")
      .on(t.patientId, t.disciplina)
      .where(sql`${t.vigenciaFim} IS NULL`),
  ],
);

// ─── Agenda 2.0 (Etapa A) — disponibilidade recorrente do terapeuta ──────────
// Várias faixas por dia permitidas (manhã + tarde). Exceções finas (feriado/
// férias) NÃO vivem aqui — vão em `bloqueio`. terapeuta_id é FK global a
// app_user; o vínculo à clínica é validado no RLS por app_user_in_clinic.
export const janelaTrabalho = pgTable(
  "janela_trabalho",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "restrict" }),
    terapeutaId: uuid("terapeuta_id")
      .notNull()
      .references(() => appUser.id),
    diaSemana: smallint("dia_semana").notNull(),
    horaInicio: time("hora_inicio").notNull(),
    horaFim: time("hora_fim").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("janela_trabalho_dia_semana", sql`${t.diaSemana} BETWEEN 0 AND 6`),
    check("janela_trabalho_faixa", sql`${t.horaFim} > ${t.horaInicio}`),
    index("idx_janela_terapeuta").on(t.terapeutaId, t.diaSemana),
  ],
);

export const bloqueioEscopo = pgEnum("bloqueio_escopo", [
  "clinica",
  "terapeuta",
  "paciente",
]);

// ─── Agenda 2.0 (Etapa A) — bloqueio de agenda (feriado/férias/afastamento) ──
// Polimórfico por escopo. Bloqueio de PACIENTE é obrigatório na v1: sem ele a
// criança viajando 3 semanas gera "falta" fantasma. A materialização (Etapa D)
// pula datas bloqueadas do escopo aplicável.
export const bloqueio = pgTable(
  "bloqueio",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "restrict" }),
    escopo: bloqueioEscopo("escopo").notNull(),
    terapeutaId: uuid("terapeuta_id").references(() => appUser.id),
    patientId: uuid("patient_id"),
    dataInicio: date("data_inicio").notNull(),
    dataFim: date("data_fim").notNull(),
    motivo: text("motivo").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.patientId, t.clinicId],
      foreignColumns: [patient.id, patient.clinicId],
      name: "bloqueio_patient_fk",
    }).onDelete("cascade"),
    check("bloqueio_intervalo", sql`${t.dataFim} >= ${t.dataInicio}`),
    check(
      "bloqueio_escopo_alvo",
      sql`(${t.escopo} = 'clinica'   AND ${t.terapeutaId} IS NULL AND ${t.patientId} IS NULL)
       OR (${t.escopo} = 'terapeuta' AND ${t.terapeutaId} IS NOT NULL AND ${t.patientId} IS NULL)
       OR (${t.escopo} = 'paciente'  AND ${t.patientId} IS NOT NULL AND ${t.terapeutaId} IS NULL)`,
    ),
    index("idx_bloqueio_clinic_periodo").on(
      t.clinicId,
      t.dataInicio,
      t.dataFim,
    ),
  ],
);

export const agendamentoRecorrenteStatus = pgEnum(
  "agendamento_recorrente_status",
  ["ativo", "encerrado"],
);

// ─── Agenda 2.0 (Etapa A) — regra recorrente standing ────────────────────────
// Um paciente tem N regras (uma por disciplina/terapeuta/horário) — é assim que
// a criança de 3 terapeutas é representada. As `session` são geradas a partir
// dela (Etapa D). Editar horário no meio do tratamento = encerrar+abrir nova.
export const agendamentoRecorrente = pgTable(
  "agendamento_recorrente",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "restrict" }),
    patientId: uuid("patient_id").notNull(),
    terapeutaId: uuid("terapeuta_id")
      .notNull()
      .references(() => appUser.id),
    disciplina: text("disciplina").notNull(),
    diaSemana: smallint("dia_semana").notNull(),
    horaInicio: time("hora_inicio").notNull(),
    duracaoMin: integer("duracao_min").notNull(),
    vigenciaInicio: date("vigencia_inicio").notNull(),
    vigenciaFim: date("vigencia_fim"),
    status: agendamentoRecorrenteStatus("status").notNull().default("ativo"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.patientId, t.clinicId],
      foreignColumns: [patient.id, patient.clinicId],
      name: "agendamento_recorrente_patient_fk",
    }).onDelete("cascade"),
    check(
      "agendamento_recorrente_dia_semana",
      sql`${t.diaSemana} BETWEEN 0 AND 6`,
    ),
    check("agendamento_recorrente_duracao", sql`${t.duracaoMin} > 0`),
    check(
      "agendamento_recorrente_vigencia",
      sql`${t.vigenciaFim} IS NULL OR ${t.vigenciaFim} >= ${t.vigenciaInicio}`,
    ),
    index("idx_agrecorrente_terapeuta_ativo")
      .on(t.terapeutaId, t.diaSemana)
      .where(sql`${t.status} = 'ativo'`),
    index("idx_agrecorrente_patient_ativo")
      .on(t.patientId, t.disciplina)
      .where(sql`${t.status} = 'ativo'`),
  ],
);

export const sessionModalidade = pgEnum("session_modalidade", [
  "presencial",
  "online",
]);
export const sessionTipo = pgEnum("session_tipo", [
  "terapia",
  "avaliacao",
  "devolutiva",
  "reuniao_pais",
  "outro",
]);

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
    // Agenda 2.0 (Etapa A): enriquecimento disciplina-aware. A FK de
    // `recorrente_id → agendamento_recorrente` é criada na migration à mão 0034
    // (evita reordenar o arquivo / ciclo de import); aqui declara-se só a coluna.
    // recorrenteId null = avulsa; avulsa carrega a disciplina escolhida no
    // popover, nunca null (Etapa E+F: disciplina é NOT NULL, backfill legado
    // = 'desconhecida' — ver migration 0036).
    recorrenteId: uuid("recorrente_id"),
    disciplina: text("disciplina").notNull(),
    duracaoMin: integer("duracao_min").notNull().default(60),
    justificada: boolean("justificada"), // só relevante em falta_*
    modalidade: sessionModalidade("modalidade").notNull().default("presencial"),
    tipo: sessionTipo("tipo").notNull().default("terapia"),
    atendidoPorId: uuid("atendido_por_id").references(() => appUser.id), // substituto
    repostaDe: uuid("reposta_de"), // self-FK: esta sessão repõe outra
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
    foreignKey({
      columns: [t.repostaDe],
      foreignColumns: [t.id],
      name: "session_reposta_de_fk",
    }).onDelete("set null"),
    // Materialização idempotente: a mesma regra não gera 2 ocorrências no mesmo
    // instante (retry não duplica). Parcial: sessões avulsas (recorrente_id null)
    // não colidem entre si.
    uniqueIndex("uq_session_recorrente_agendada")
      .on(t.recorrenteId, t.agendadaPara)
      .where(sql`${t.recorrenteId} IS NOT NULL`),
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
    visibilityLevel: sessionNoteVisibilityLevel("visibility_level")
      .notNull()
      .default("multidisciplinary"),
    texto: text("texto").notNull(),
    autorId: uuid("autor_id")
      .notNull()
      .references(() => appUser.id),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // 1 captura_rapida + 1 nota_consolidada por sessão
    unique("uq_session_note_tipo").on(t.sessionId, t.tipo),
    index("idx_session_note_session").on(t.sessionId),
    index("idx_session_note_sigilo")
      .on(t.sessionId)
      .where(sql`visibility_level = 'discipline_only'`),
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
    origem: sessionProtocolScopeOrigem("origem")
      .notNull()
      .default("inferido_disciplina"),
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
    statusUpload: audioStatusUpload("status_upload")
      .notNull()
      .default("rascunho_local"),
    // Referência ao objeto no storage — nulo enquanto o áudio vive só local (Fase 2).
    objetoRef: text("objeto_ref"),
    duracaoSegundos: integer("duracao_segundos"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    inconsistenteComHistorico: boolean("inconsistente_com_historico")
      .notNull()
      .default(false),
    parContrasteId: text("par_contraste_id"),
    payload: jsonb("payload").notNull(), // sugestão ORIGINAL da IA — imutável (auditoria Camada 1)
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    dominioId: text("dominio_id").notNull(), // 'mando','tato',... chave estável do agente
    nome: text("nome").notNull(),
    nivel: text("nivel"),
    tipoEstrutura: milestoneTipoEstrutura("tipo_estrutura").notNull(),
    estrutura: jsonb("estrutura").notNull(), // escala/critério formal/componentes
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
    descricao: text("descricao").notNull(), // linguagem simples (família também vê)
    disciplina: text("disciplina"), // 'ABA'|'Fono'|'TO' — nullable: meta pode não mapear marco (wireframe 4.4)
    estado: goalEstado("estado").notNull().default("rascunho"),
    criterioDominio: jsonb("criterio_dominio").notNull(), // {"tipo":"...","valor":3}
    cicloRevisaoSemanas: integer("ciclo_revisao_semanas").notNull().default(10),
    proximaRevisaoEm: date("proxima_revisao_em"),
    criadoPor: uuid("criado_por")
      .notNull()
      .references(() => appUser.id),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
  isCandidateDominada: boolean("is_candidate_dominada")
    .notNull()
    .default(false),
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
    index("idx_evidence_goal")
      .on(t.goalId)
      .where(sql`${t.goalId} IS NOT NULL`),
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
    // #407 (Anamnese Marco Zero, D-A): No snapshot 0 (e preservado em subsequentes),
    // repertorioState carrega também {origem: 'anamnese', procedencia: ProcedenciaAlvo}
    // para diferenciar procedência do dado inicial sem quebrar a restrição de não-texto.
    repertorioState: jsonb("repertorio_state").notNull(), // {goal_id/milestone_id: {metrica_recente, contagem, is_candidata, origem?, procedencia?}}
    // Chaveado por (goal_id, protocol_id) e carregando a métrica-por-tipo —
    // nunca eixo único de nivel_ajuda (reconciliação 13/07/2026, Fase 4):
    segmentacao: jsonb("segmentacao").notNull(), // {goal_id: {protocol_id: {tipo_estrutura, metrica, rotulo}}}
    geradoEm: timestamp("gerado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.patientId, t.sessionNumero] }),
    index("idx_session_snapshot_patient").on(
      t.patientId,
      t.sessionNumero.desc(),
    ),
  ],
);

// ── Fase 5: relatórios ────────────────────────────────────────────────
// customType para bytea (não havia binário no banco até aqui). data = Buffer.
export const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

export const reportTipo = pgEnum("report_tipo", [
  "familia",
  "convenio_bruto",
  "convenio_narrativo",
  "avaliativo_interdisciplinar",
]);

export const reportStatus = pgEnum("report_status", [
  "rascunho",
  "revisado",
  "exportado",
]);

export const report = pgTable(
  "report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patient.id),
    tipo: reportTipo("tipo").notNull(),
    periodoInicio: date("periodo_inicio").notNull(),
    periodoFim: date("periodo_fim").notNull(),
    status: reportStatus("status").notNull().default("rascunho"),
    payload: jsonb("payload").notNull(),
    // incrementa a cada UPDATE de payload; trava a race de export (spec §5)
    payloadVersao: integer("payload_versao").notNull().default(1),
    geradoPorIa: boolean("gerado_por_ia").notNull().default(false),
    // null até export; sha256 hex dos bytes (bytes ficam em report_pdf)
    pdfHash: text("pdf_hash"),
    // null = vigente; soft-delete p/ retenção/erasure LGPD (spec §3.1)
    deletadoEm: timestamp("deletado_em", { withTimezone: true }),
    revisadoPor: uuid("revisado_por").references(() => appUser.id),
    exportadoPor: uuid("exportado_por").references(() => appUser.id),
    exportadoEm: timestamp("exportado_em", { withTimezone: true }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("report_periodo", sql`${t.periodoFim} >= ${t.periodoInicio}`),
    check(
      "report_exportado_congelado",
      sql`${t.status} <> 'exportado' OR (${t.exportadoPor} IS NOT NULL AND ${t.exportadoEm} IS NOT NULL AND ${t.pdfHash} IS NOT NULL)`,
    ),
    check(
      "report_bruto_sem_ia",
      sql`${t.tipo} <> 'convenio_bruto' OR ${t.geradoPorIa} = false`,
    ),
    check(
      "report_narrativo_com_ia",
      sql`${t.tipo} <> 'convenio_narrativo' OR ${t.geradoPorIa} = true`,
    ),
    index("idx_report_patient").on(t.patientId, t.criadoEm.desc()),
    index("idx_report_clinic_tipo").on(t.clinicId, t.tipo),
    index("idx_report_vigente")
      .on(t.patientId, t.criadoEm.desc())
      .where(sql`${t.deletadoEm} IS NULL`),
  ],
);

// Blob isolado da tabela quente de listagem (spec §1.1). 1:1 com report.
export const reportPdf = pgTable("report_pdf", {
  reportId: uuid("report_id")
    .primaryKey()
    .references(() => report.id, { onDelete: "cascade" }),
  bytes: bytea("bytes").notNull(),
  hash: text("hash").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Trilha de auditoria LGPD (spec §2). entidade_id SEM FK — sobrevive ao delete do alvo.
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id),
    // Nullable desde a 0049: `ator_id IS NULL` significa "ação automática do
    // sistema" (job de escalonamento, varredura de arquivamento) — não existe
    // humano a quem atribuir. `onDelete: "set null"` (0070 / #116) garante retenção
    // do audit_log por 6 meses mesmo se a conta do ator for excluída.
    atorId: uuid("ator_id").references(() => appUser.id, {
      onDelete: "set null",
    }),
    acao: text("acao").notNull(),
    entidade: text("entidade").notNull(),
    entidadeId: uuid("entidade_id").notNull(),
    patientId: uuid("patient_id").references(() => patient.id),
    detalhe: jsonb("detalhe"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_audit_log_patient").on(t.patientId, t.criadoEm.desc()),
    // #453 — a tela de trilha filtra por clínica (predicado fixo da view
    // `audit_log_mascarado`) e ordena por `criado_em DESC, id DESC`. Sem este
    // índice, cada página é seq scan + sort da tabela inteira: o único índice
    // existente é por `patient_id`, que a trilha não usa. O `id` na terceira
    // posição é o desempate da paginação — dois registros no mesmo instante
    // (o job de arquivamento grava um lote com um `p_agora` só) reapareceriam
    // em duas páginas sem ele.
    index("idx_audit_log_clinic_criado").on(
      t.clinicId,
      t.criadoEm.desc(),
      t.id.desc(),
    ),
  ],
);

// ─── Fase 5 Fatia 2 — Supervisão (fila de alertas do coordenador) ────────────
// Sinais derivados AO VIVO (estagnação/regressão via session_snapshot; faltas
// via session.estado) — nunca materializados por job. `alerta` é o LIVRO-RAZÃO
// da decisão do coordenador: só server actions escrevem. `novo` = sinal vivo
// SEM linha viva (não é valor de enum). Concorrência = advisory lock + re-check
// (padrão do repo), sem coluna de versão/OCC.
export const alertaTipo = pgEnum("alerta_tipo", [
  "estagnacao",
  "regressao",
  "faltas_excessivas",
]);
export const alertaStatus = pgEnum("alerta_status", [
  "reconhecido",
  "resolvido",
  "descartado",
]);

export const alerta = pgTable(
  "alerta",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id),
    patientId: uuid("patient_id").notNull(),
    tipo: alertaTipo("tipo").notNull(),
    status: alertaStatus("status").notNull(),
    // dedupe determinístico da condição; linha terminal suprime re-alerta.
    chaveNatural: text("chave_natural").notNull(),
    // localizador clínico (estagnação/regressão); NULL p/ faltas.
    goalId: uuid("goal_id").references(() => goal.id),
    protocolId: uuid("protocol_id").references(() => protocol.id),
    // snapshot do sinal no momento da decisão (métrica / contagem de faltas).
    detalhe: jsonb("detalhe").notNull(),
    nota: text("nota"), // preenchido em resolver
    motivo: text("motivo"), // preenchido em descartar
    criadoPor: uuid("criado_por")
      .notNull()
      .references(() => appUser.id),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoPor: uuid("atualizado_por")
      .notNull()
      .references(() => appUser.id),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // null = vigente; soft-delete p/ paridade RLS (espelha `report`).
    deletadoEm: timestamp("deletado_em", { withTimezone: true }),
  },
  (t) => [
    // anti-IDOR em nível de banco (mesma FK composta das tabelas Agenda 2.0).
    foreignKey({
      columns: [t.patientId, t.clinicId],
      foreignColumns: [patient.id, patient.clinicId],
      name: "alerta_patient_fk",
    }).onDelete("cascade"),
    // localizador clínico obrigatório p/ estagnação/regressão, ausente p/ faltas.
    check(
      "alerta_locator",
      sql`(${t.tipo} = 'faltas_excessivas' AND ${t.goalId} IS NULL AND ${t.protocolId} IS NULL)
       OR (${t.tipo} IN ('estagnacao','regressao') AND ${t.goalId} IS NOT NULL AND ${t.protocolId} IS NOT NULL)`,
    ),
    // 1 alerta vivo por condição (dedupe + supressão pós-terminal).
    uniqueIndex("alerta_chave_uk")
      .on(t.chaveNatural)
      .where(sql`${t.deletadoEm} IS NULL`),
    index("idx_alerta_fila")
      .on(t.clinicId, t.status)
      .where(sql`${t.deletadoEm} IS NULL`),
  ],
);

// ─── #122 — Alerta de risco clínico (spec: docs/agente/regra-alerta-risco.md) ─
// Fila DEDICADA, paralela a `alerta` e não filha dela (§3.2): risco é evento
// pontual (cada menção em cada sessão é uma linha), não sinal persistente com
// dedupe por chave natural; `alerta_locator` é hardcoded p/ os 3 tipos antigos;
// prazo/escalonamento não existem em nenhum sinal atual; e a RLS precisa incluir
// o terapeuta da sessão, não só o coordenador.
//
// REGRA DE OURO (§4.2.1): nenhuma coluna aqui é destinatário externo. O Iris
// nunca notifica família, contato de emergência, SAMU, polícia ou Conselho
// Tutelar — todo o fluxo encerra nos gestores da própria clínica.

export const alertaRiscoCategoria = pgEnum("alerta_risco_categoria", [
  "ideacao_suicida",
  "autolesao",
  "violencia_sofrida",
  "violencia_praticada",
  "risco_a_terceiro",
]);

export const alertaRiscoSeveridade = pgEnum("alerta_risco_severidade", [
  "ideacao_passiva",
  "ideacao_ativa_sem_plano",
  "ideacao_ativa_com_plano",
  "autolesao_recente",
  "tentativa_relatada",
  "violencia_sofrida",
  "violencia_praticada",
  "risco_a_terceiro",
]);

export const alertaRiscoCerteza = pgEnum("alerta_risco_certeza", [
  "explicito", // menção direta, inequívoca
  "ambiguo_citado", // texto ambíguo, citado literalmente — alerta mantido (§1.4)
]);

export const alertaRiscoStatus = pgEnum("alerta_risco_status", [
  "aberto", // recém-criado, aguardando reconhecimento
  "reconhecido", // um dos destinatários confirmou ciência (prazo cumprido)
  "escalado_estagio_1", // prazo vencido — todos os coordenadores da clínica
  // 2º prazo vencido — saturação INTERNA da clínica (§4.2.1, Opção B do parecer):
  // banner clínica-wide + responsável técnico + protocolo interno + log imutável.
  // Não existe canal externo em nenhum estágio.
  "escalado_estagio_2",
  "resolvido", // conduta humana definida e registrada
  "descartado", // avaliado como não-risco após revisão humana (nunca apaga)
]);

// #391 — de onde o alerta veio. `diario_sessao` é o único caminho até aqui
// (consolidação do diário); RPD e instrumento formal ganham âncora própria
// porque nem sempre têm `session_id` (RPD pode ser salvo sem sessão vinculada).
export const alertaRiscoOrigem = pgEnum("alerta_risco_origem", [
  "diario_sessao",
  "registro_pensamento",
  "instrumento_formal",
]);

export const alertaRiscoClinico = pgTable(
  "alerta_risco_clinico",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id),
    // patientId/sessionId são NOT NULL *enquanto o alerta vive* — garantido pelo
    // CHECK `alerta_risco_vinculo` abaixo, não pela coluna. A nulidade existe só
    // para o expurgo LGPD: o erasure do paciente DELETA `patient` e `session`,
    // e este registro PSEUDONIMIZA em vez de morrer junto (H2). Mesmo mecanismo
    // do `audit_log.patient_id` em `app_purgar_paciente` (0045): nula-se a FK
    // antes do delete. Resolve a contradição §7 (`sessionId notNull`) × H2.
    patientId: uuid("patient_id"),
    // o alerta segue a SESSÃO, não o paciente (H4) — o destinatário do
    // estágio 0 é derivado daqui, nunca difundido lateralmente. NULL quando
    // `origem` não é `diario_sessao` (#391) — RPD e instrumento formal usam
    // `rpdEntryId`/`origemExtractionId` como âncora no lugar da sessão.
    sessionId: uuid("session_id").references(() => session.id),
    // #391 — de onde este alerta nasceu. Default `diario_sessao` preserva o
    // sentido de toda linha existente antes desta coluna existir.
    origem: alertaRiscoOrigem("origem").notNull().default("diario_sessao"),
    rpdEntryId: uuid("rpd_entry_id").references(() => tccRpdEntry.id),
    origemExtractionId: uuid("origem_extraction_id").references(
      () => extraction.id,
    ),
    // #393 (gap fix) — âncora alternativa para `origem='instrumento_formal'`
    // quando o instrumento foi aplicado pelo caminho MANUAL (sem `extraction`
    // de origem). `origemExtractionId` continua sendo a âncora do caminho via
    // agente (#391 Fase E); as duas nunca coexistem preenchidas no mesmo
    // alerta — mesmo shape mutuamente exclusivo de `rpdEntryId`/
    // `origemExtractionId` em `registro_pensamento` (#392). Nome do FK dado
    // explicitamente (`foreignKey()` abaixo, não `.references()` inline):
    // o nome auto-gerado por Drizzle (`alerta_risco_clinico_instrumento_
    // aplicacao_id_instrumento_aplicacao_id_fk`) tem 73 chars > limite de 63
    // do Postgres (truncaria em silêncio).
    instrumentoAplicacaoId: uuid("instrumento_aplicacao_id"),

    categoria: alertaRiscoCategoria("categoria").notNull(),
    severidade: alertaRiscoSeveridade("severidade").notNull(),
    certeza: alertaRiscoCerteza("certeza").notNull(),
    trechoFonte: text("trecho_fonte").notNull(), // citação literal do diário
    detalhe: text("detalhe").notNull(), // descrição do agente, sem juízo de gravidade

    status: alertaRiscoStatus("status").notNull().default("aberto"),

    // auditoria de ENVIO (o que de fato disparou), não decisão. Inclui registro
    // explícito de canal indisponível — canal que falha em silêncio é o modo de
    // falha da #108.
    canaisNotificados: jsonb("canais_notificados").notNull().default([]),
    emailRtTentativas: integer("email_rt_tentativas").notNull().default(0),

    // "prazos de notificação e escalonamento interno do software" (§4.1) —
    // NUNCA "SLA de atendimento de emergência": não há prazo legal brasileiro
    // p/ resposta clínica a crise e o Iris não presta atendimento.
    prazoMinutos: integer("prazo_minutos").notNull(),
    prazoReconhecimento: timestamp("prazo_reconhecimento", {
      withTimezone: true,
    }).notNull(),

    reconhecidoPor: uuid("reconhecido_por").references(() => appUser.id),
    reconhecidoEm: timestamp("reconhecido_em", { withTimezone: true }),

    escaladoEm: timestamp("escalado_em", { withTimezone: true }), // estágio 1
    escaladoEstagio2Em: timestamp("escalado_estagio_2_em", {
      withTimezone: true,
    }),

    condutaRegistrada: text("conduta_registrada"), // preenchido em resolver
    motivoDescarte: text("motivo_descarte"), // preenchido em descartar

    // marca de expurgo LGPD (H2): o expurgo PSEUDONIMIZA, nunca deleta.
    pseudonimizadoEm: timestamp("pseudonimizado_em", { withTimezone: true }),

    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoPor: uuid("atualizado_por").references(() => appUser.id),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),

    // paridade RLS com o resto do repo; NUNCA usado para expurgo (H2).
    deletadoEm: timestamp("deletado_em", { withTimezone: true }),
  },
  (t) => [
    // anti-IDOR em nível de banco. RESTRICT e não CASCADE de propósito: o
    // expurgo pseudonimiza esta tabela (H2); cascade deletaria a linha inteira,
    // o oposto exato da decisão.
    foreignKey({
      columns: [t.patientId, t.clinicId],
      foreignColumns: [patient.id, patient.clinicId],
      name: "alerta_risco_patient_fk",
    }).onDelete("restrict"),
    // #393 (gap fix) — nome curto explícito, ver comentário na coluna acima.
    foreignKey({
      columns: [t.instrumentoAplicacaoId],
      foreignColumns: [instrumentoAplicacao.id],
      name: "alerta_risco_instrumento_aplicacao_fk",
    }),
    // Invariante da §7 preservada onde importa: TODO alerta vivo tem paciente e
    // UMA âncora — sessão (diário), RPD ou extração de instrumento (#391), a
    // depender de `origem`. Só o expurgo (H2) pode soltar esses vínculos, e
    // apenas marcando `pseudonimizado_em` — não há caminho para uma linha
    // órfã silenciosa.
    check(
      "alerta_risco_vinculo",
      sql`(${t.pseudonimizadoEm} IS NULL
            AND ${t.patientId} IS NOT NULL
            AND (
              (${t.origem} = 'diario_sessao' AND ${t.sessionId} IS NOT NULL)
              OR (${t.origem} = 'registro_pensamento' AND ${t.rpdEntryId} IS NOT NULL)
              OR (${t.origem} = 'instrumento_formal' AND ${t.origemExtractionId} IS NOT NULL)
            ))
       OR (${t.pseudonimizadoEm} IS NOT NULL
            AND ${t.patientId} IS NULL
            AND ${t.sessionId} IS NULL
            AND ${t.rpdEntryId} IS NULL
            AND ${t.origemExtractionId} IS NULL)`,
    ),
    index("idx_alerta_risco_fila")
      .on(t.clinicId, t.status)
      .where(sql`${t.deletadoEm} IS NULL`),
    // serve o job de escalonamento (H1): status='aberto' AND prazo < now().
    index("idx_alerta_risco_sla").on(t.status, t.prazoReconhecimento),
  ],
);

// ─── Faturamento (Fase 7, #36): recepção de webhook do Asaas ────────────────
// Deduplicação de entrega: o Asaas reentrega o mesmo evento após qualquer
// falha de rede ou 5xx, então `asaasEventId` é UNIQUE e a barreira contra
// efeito duplicado é o próprio banco (0066), não uma checagem em memória.
// `payload` é guardado bruto porque a apuração do valor cobrado só existe a
// partir da tabela `subscription` (#159) — quando ela chegar, os eventos já
// recebidos precisam ser reprocessáveis sem pedir reenvio ao Asaas.
// `aplicadoEm`/`erroAplicacao` chegaram com o adapter Asaas (#36): a rota grava
// e responde 200 ANTES de aplicar o efeito, então `aplicadoEm` NULL com
// `processadoEm` preenchido = recebido e ainda não conciliado. É o que
// `reprocessarEventosPendentes` varre. Houve uma tabela irmã com os mesmos
// nomes de coluna (`mercadopago_webhook_event`), justamente para a varredura ser
// uma função só parametrizada pela tabela do provedor; ela saiu na 0091 com o
// adapter do Mercado Pago (#36, D24) — hoje a varredura tem um trilho só.
// Plano de billing/identidade: só `iris_auth` tem grant; `app_role` não toca.
export const asaasWebhookEvent = pgTable(
  "asaas_webhook_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    asaasEventId: text("asaas_event_id").notNull().unique(),
    evento: text("evento").notNull(),
    payload: jsonb("payload").notNull(),
    aplicadoEm: timestamp("aplicado_em", { withTimezone: true }),
    erroAplicacao: text("erro_aplicacao"),
    processadoEm: timestamp("processado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("asaas_webhook_event_processado_idx").on(t.processadoEm)],
);

// ─── Billing: assinatura, ciclo e apuração (#36, Fase 7 Fatia B) ────────────
// Modelo pay-as-you-grow por paciente ativo, faixas MARGINAIS. O preço não é
// calculado em SQL: a fonte da verdade é `src/lib/billing/calculator.ts`, em
// centavos inteiros. O banco guarda o RESULTADO e o memorial de quem foi
// contado — preço muda, fatura já emitida não.
// RLS/GRANT à mão em `db/migrations/0071_billing_assinatura_e_ciclo.sql`:
// `app_role` só tem SELECT da própria clínica; escrita é exclusiva de
// `iris_auth` (plano de billing/identidade, como asaas_webhook_event/0066).
export const subscriptionStatus = pgEnum("subscription_status", [
  "free_tier",
  "setup_pending",
  "active",
  "past_due",
  "canceled",
]);

// Fluxo pós-pago (0075): aberto → apurado → aguardando_pagamento → pago,
// com `falhou` no ramo de recusa/vencimento. `cobrado` é LEGADO: ficou de
// quando o job carimbava o ciclo como cobrado no instante em que ajustava o
// valor da recorrência — sem nenhuma cobrança emitida nem confirmada. Não é
// removido porque há memorial de fatura gravado com ele.
//
// `devido` (0097, #287/#290) é o ramo do CANCELAMENTO: o ciclo foi interrompido
// no meio, apurado e congelado como débito pro-rata, SEM cobrança emitida — a
// autorização do Pix Automático acabou de ser revogada e não há trilho para
// cobrar naquele instante. Não é `falhou` (ali houve cobrança recusada) nem
// `apurado` (que é estado de passagem do job e seria varrido de novo).
export const billingCycleStatus = pgEnum("billing_cycle_status", [
  "aberto",
  "apurado",
  "cobrado",
  "falhou",
  "aguardando_pagamento",
  "pago",
  "devido",
]);

// `ativo_nao_arquivado` deixou de ser PRODUZIDO na 0075 (o critério de
// faturamento passou a ser "criado ou interagiu no ciclo"), mas continua no
// enum: `billing_cycle_patient.motivo` é memorial de fatura emitida, e remover
// o valor reescreveria retroativamente o porquê de uma cobrança real.
export const billingMotivoAtivo = pgEnum("billing_motivo_ativo", [
  "criado_no_ciclo",
  "interacao_no_ciclo",
  "ativo_nao_arquivado",
]);

// 1:1 com `clinic`. Renovação reusa a linha e abre um `billingCycle` novo.
export const subscription = pgTable(
  "subscription",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .unique()
      .references(() => clinic.id, { onDelete: "restrict" }),
    status: subscriptionStatus("status").notNull().default("free_tier"),
    // Persistido em vez de lido de env: assinatura criada num provedor não pode
    // ser reinterpretada por outro só porque a env mudou depois.
    //
    // NULLABLE e SEM DEFAULT de propósito (D29/#36). O default
    // `'mercado_pago'` fazia toda linha nova nascer apontando para um gateway
    // que a clínica nunca escolheu — inclusive as `free_tier`, que não têm
    // provedor nenhum. "Sem vínculo de cobrança" precisa ser representável.
    // O invariante que sobra ("linha vinculada tem provedor") passa a ser um
    // CHECK no banco: `status = 'free_tier' OR provider IS NOT NULL`.
    provider: text("provider"),
    // `preapproval_id` no Mercado Pago. UNIQUE porque o webhook resolve a
    // clínica por ele — dois tenants no mesmo id seria cobrança cruzada.
    providerSubscriptionId: text("provider_subscription_id").unique(),
    // Cliente/vínculo de pagamento no gateway. Voltou a significar isso na
    // 0075 — estava sendo usado como cache da URL de checkout, que agora tem
    // coluna própria (`checkoutUrl`).
    providerCustomerId: text("provider_customer_id"),
    /**
     * URL de checkout — e **só** URL. Até a 0088 esta coluna também carregava o
     * BR Code do Pix Automático do Asaas, que não é URL nenhuma (débito D21);
     * o copia-e-cola agora tem coluna própria logo abaixo.
     */
    checkoutUrl: text("checkout_url"),
    /** BR Code (copia-e-cola) do Pix Automático. Exclusivo com `checkoutUrl`. */
    pixCopiaECola: text("pix_copia_e_cola"),
    /**
     * Quanto o QR de ativação do Pix Automático cobrou, em centavos (D22, 0089).
     *
     * Nulo no trilho de redirect, que não cobra para autorizar. Persistido — e
     * não recalculado da constante do adapter — porque a reentrada idempotente
     * de `iniciarAtivacao` devolve o BR Code JÁ EMITIDO: o valor está gravado
     * dentro do payload EMV, e reler a constante mostraria o preço de hoje para
     * um QR emitido com o preço de ontem.
     */
    valorAtivacaoCentavos: integer("valor_ativacao_centavos"),
    metodoPagamento: text("metodo_pagamento"),
    cicloDias: integer("ciclo_dias").notNull().default(30),
    cicloAtualInicio: timestamp("ciclo_atual_inicio", { withTimezone: true }),
    cicloAtualFim: timestamp("ciclo_atual_fim", { withTimezone: true }),
    // Falha de Pix Automático/cartão costuma ser do banco do cliente; derrubar
    // acesso a prontuário por isso é dano desproporcional.
    // 10 = 7 da janela de retentativa do Pix Automático
    // (`ALLOW_THREE_IN_SEVEN_DAYS`, #317) + 3 de folga: a retentativa corre
    // DENTRO da carência, porque `pastDueDesde` é carimbado na primeira recusa
    // e preservado nas seguintes — a última tentativa precisa de margem para
    // liquidar antes do corte.
    carenciaDias: integer("carencia_dias").notNull().default(10),
    pastDueDesde: timestamp("past_due_desde", { withTimezone: true }),
    ativadaEm: timestamp("ativada_em", { withTimezone: true }),
    canceladaEm: timestamp("cancelada_em", { withTimezone: true }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("subscription_renovacao_idx").on(t.status, t.cicloAtualFim),
    // Varredura de carência vencida: filtra `status = 'past_due'` e
    // ordena/filtra por `pastDueDesde`. O índice de renovação acima é
    // (status, ciclo_atual_fim) e não cobre essa segunda coluna.
    index("subscription_carencia_idx").on(t.status, t.pastDueDesde),
    check(
      "subscription_ciclo_valido",
      sql`${t.cicloAtualFim} IS NULL OR ${t.cicloAtualInicio} IS NULL OR ${t.cicloAtualFim} > ${t.cicloAtualInicio}`,
    ),
    check("subscription_carencia_nao_negativa", sql`${t.carenciaDias} >= 0`),
    check("subscription_ciclo_dias_positivo", sql`${t.cicloDias} > 0`),
  ],
);

export const billingCycle = pgTable(
  "billing_cycle",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "restrict" }),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscription.id, { onDelete: "restrict" }),
    inicio: timestamp("inicio", { withTimezone: true }).notNull(),
    fim: timestamp("fim", { withTimezone: true }).notNull(),
    status: billingCycleStatus("status").notNull().default("aberto"),
    pacientesContados: integer("pacientes_contados").notNull().default(0),
    valorCentavos: integer("valor_centavos").notNull().default(0),
    apuradoEm: timestamp("apurado_em", { withTimezone: true }),
    cobradoEm: timestamp("cobrado_em", { withTimezone: true }),
    // Id da cobrança AVULSA deste ciclo no gateway. É por ele que o webhook
    // reconcilia pagamento ↔ ciclo — o `preapproval_id` da assinatura não
    // identifica ciclo nenhum. UNIQUE parcial na 0075 = guarda de idempotência
    // da emissão.
    providerChargeId: text("provider_charge_id"),
    cobrancaEmitidaEm: timestamp("cobranca_emitida_em", { withTimezone: true }),
    /**
     * O **vencimento que mandamos ao gateway** nesta cobrança (#318, 0101).
     *
     * É o marco do backstop de D+7 (`aplicarBackstopDePrazo`), e por isso
     * precisa ser um FATO PERSISTIDO, não um cálculo refeito. Os candidatos que
     * já existiam nesta tabela foram descartados por erro de sinal, não por
     * gosto:
     *
     * - `cobranca_emitida_em` e `apurado_em` são o instante da EMISSÃO, e a
     *   emissão acontece de 2 a 10 dias ANTES do vencimento
     *   (`vencimentoCobrancaDeCiclo`). D+7 a partir deles cairia, no cluster de
     *   fim de ano, ANTES da data em que a clínica tinha de pagar — carimbar
     *   inadimplência antes do vencimento;
     * - `fim` é o fim do PERÍODO apurado, e a cobrança nasce depois dele: mesmo
     *   erro de sinal, com a mesma sazonalidade do bug que a #317 fechou;
     * - `criado_em` é a abertura do ciclo, ~30 dias antes de haver cobrança;
     * - `cobrado_em` só existe depois de PAGO — o backstop trata do não pago.
     *
     * Recalcular `vencimentoCobrancaDeCiclo(cobranca_emitida_em)` também não
     * serve: a função depende do calendário bancário e das constantes da janela,
     * então uma mudança nelas reescreveria retroativamente o vencimento de
     * cobranças JÁ emitidas — o backstop passaria a medir de uma data que nunca
     * foi enviada a gateway nenhum. Guardar o valor que saiu é a única leitura
     * que não se move sozinha.
     *
     * Nullable: ciclo sem cobrança emitida (`aberto`, `apurado`, o de valor zero
     * fechado direto como `pago`) não tem vencimento nenhum — e é exatamente o
     * que o mantém FORA do backstop, que só cobra o que foi de fato cobrado.
     *
     * `timestamptz` e não `date`: a janela do gateway é contada em dias, mas o
     * predicado do backstop compara instantes, e é o tipo que o resto da tabela
     * usa. Truncar para data aqui reintroduziria a ambiguidade de fuso que
     * `calendario-bancario.ts` existe para resolver.
     */
    vencimentoCobranca: timestamp("vencimento_cobranca", {
      withTimezone: true,
    }),
    /**
     * Âncora do agrupamento de débito (#290, 0098).
     *
     * O débito de uma reativação pode somar mais de um ciclo `devido` — a #290
     * decidiu que débito abaixo do piso de cobrança do gateway ACUMULA em vez de
     * caducar ou travar a volta. Cobrar isso como N cobranças seria N QR Codes
     * para a mesma dívida, e gravar o mesmo `provider_charge_id` nas N linhas
     * esbarra no UNIQUE parcial da 0075 (que é a guarda de idempotência da
     * emissão, e não se abre mão dela por um agrupamento).
     *
     * Então: uma cobrança só, do total, em `provider_charge_id` do ciclo
     * `devido` mais ANTIGO — a âncora. Os demais apontam para ela aqui e são
     * liquidados junto quando o webhook confirma o pagamento dela.
     *
     * Mais antigo, e não mais recente, por determinismo: a mesma entrada elege
     * sempre a mesma âncora, então a reentrada do gate encontra a cobrança já
     * emitida (`debito:<ancora>`) em vez de eleger outro ciclo e emitir uma
     * segunda cobrança da mesma dívida.
     *
     * `NULL` no ciclo normal e na própria âncora.
     */
    debitoAgrupadoEm: uuid("debito_agrupado_em"),
    erro: text("erro"),
    /**
     * Código CRU da recusa, do jeito que o gateway mandou (#318, 0100).
     *
     * Não é redundante com `erro`: `erro` é texto livre de diagnóstico, e texto
     * livre cobrindo situações distintas é justamente o defeito que a #318
     * existe para matar — `LIKE '%teto%'` não é consulta, é adivinhação. A
     * classificação acontece na ESCRITA (webhook) e a tela lê DEPOIS, noutro
     * request: sem o código persistido o app não tem como saber por que o ciclo
     * falhou, e os 9 grupos de desfecho passam a diferir só em log.
     *
     * Guarda o **código**, nunca o grupo. Do código sempre se re-deriva o grupo
     * (`classificarRecusa`, que evolui com o catálogo); do grupo não se recupera
     * o código. E o catálogo é ABERTO — o OpenAPI do Asaas declara
     * `refusalReason` como `string` sem `enum` —, então nada de tipar isto como
     * enum do Postgres: código novo do gateway viraria erro de escrita num
     * caminho que não pode falhar.
     *
     * Nullable e sem default, igual a `erro`: ciclo que nunca foi recusado não
     * tem código, e `NULL` é exatamente isso. Só os grupos que levam o ciclo a
     * `falhou` escrevem aqui — ver `conciliarPagamentoDeCiclo`.
     */
    recusaCodigo: text("recusa_codigo"),
    /**
     * Orçamento de retentativa extradia já GASTO neste ciclo (#322, D-7).
     *
     * O Asaas permite no máximo 3 comandos de retentativa por cobrança, então
     * este contador é o teto — e é também a base do compare-and-set da D-4:
     * a reserva é `SET retentativas_comandadas = n + 1 WHERE ... = n`, e zero
     * linhas afetadas significa que outra passada do job ganhou a corrida e
     * esta tem de pular sem chamar o gateway.
     *
     * `NOT NULL DEFAULT 0` porque "nunca retentou" é 0, não desconhecido:
     * `NULL` aqui quebraria a aritmética do CAS em toda linha pré-existente.
     */
    retentativasComandadas: integer("retentativas_comandadas")
      .notNull()
      .default(0),
    /**
     * Instante em que a reserva da última retentativa foi gravada (#322, D-7).
     *
     * Marca o ATO de comandar, não o desfecho: a ordem da D-4 é reserva →
     * chamada → desfecho, então este carimbo existe mesmo quando a chamada ao
     * gateway falha depois. É o que permite ler no relatório do job quando a
     * tentativa foi gasta.
     *
     * `timestamptz` como o resto da tabela; nullable porque ciclo sem
     * retentativa nenhuma não tem instante.
     */
    ultimaRetentativaEm: timestamp("ultima_retentativa_em", {
      withTimezone: true,
    }),
    /**
     * A `dueDate` já comandada na última retentativa (#322, D-7).
     *
     * A validação 1 do Asaas exige datas DIFERENTES entre retentativas da mesma
     * cobrança, então o passo 2 do cálculo da D-3 compara a candidata com este
     * valor e anda +1 dia se colidir. Sem persistir a data comandada, a segunda
     * passada repetiria a primeira e levaria 400.
     *
     * `date` e não `timestamptz`: o que o gateway aceita é dia civil, e é dia
     * civil que se compara aqui — guardar instante reintroduziria fuso numa
     * comparação que não tem hora.
     */
    ultimaRetentativaVencimento: date("ultima_retentativa_vencimento"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // "1 cobrança consolidada por mês" vira barreira física: retry do job de
    // fechamento não consegue abrir um segundo ciclo com o mesmo início.
    uniqueIndex("billing_cycle_clinic_inicio_uq").on(t.clinicId, t.inicio),
    index("billing_cycle_clinic_fim_idx").on(t.clinicId, t.fim.desc()),
    // Backstop de D+7 (#318): filtra `status IN ('aguardando_pagamento',
    // 'falhou')` e compara `vencimento_cobranca`. Nenhum dos índices acima
    // começa por `status`, e a varredura roda todo dia sobre a tabela inteira —
    // mesmo motivo (e mesmo formato) de `subscription_carencia_idx` na 0099.
    index("billing_cycle_backstop_idx").on(t.status, t.vencimentoCobranca),
    // Autorreferência (0098). `foreignKey` no array em vez de `.references()`
    // na coluna porque a tabela ainda não existe no escopo quando a coluna é
    // definida — self-FK inline vira referência circular em TypeScript.
    foreignKey({
      columns: [t.debitoAgrupadoEm],
      foreignColumns: [t.id],
      name: "billing_cycle_debito_agrupado_em_fk",
    }).onDelete("set null"),
    index("billing_cycle_debito_agrupado_idx").on(t.debitoAgrupadoEm),
    check("billing_cycle_intervalo_valido", sql`${t.fim} > ${t.inicio}`),
    // Um ciclo não pode ser a própria âncora: `debito_agrupado_em` significa
    // "cobrado JUNTO COM a linha X", e a autorreferência faria a liquidação em
    // cascata do webhook se morder o próprio rabo.
    check(
      "billing_cycle_debito_agrupado_nao_reflexivo",
      sql`${t.debitoAgrupadoEm} IS NULL OR ${t.debitoAgrupadoEm} <> ${t.id}`,
    ),
    check("billing_cycle_valor_nao_negativo", sql`${t.valorCentavos} >= 0`),
    check(
      "billing_cycle_contagem_nao_negativa",
      sql`${t.pacientesContados} >= 0`,
    ),
  ],
);

// Memorial da fatura. FK COMPOSTA (patient_id, clinic_id) contra
// `uq_patient_id_clinic`: um ciclo da clínica A não contabiliza paciente da B
// nem pela role de billing. CASCADE porque o expurgo LGPD é destrutivo e
// manter o id aqui ressuscitaria o vínculo apagado — a prova do valor cobrado
// sobrevive no agregado de `billingCycle`.
export const billingCyclePatient = pgTable(
  "billing_cycle_patient",
  {
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => billingCycle.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id").notNull(),
    clinicId: uuid("clinic_id").notNull(),
    motivo: billingMotivoAtivo("motivo").notNull(),
    registradoEm: timestamp("registrado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.cycleId, t.patientId] }),
    foreignKey({
      columns: [t.patientId, t.clinicId],
      foreignColumns: [patient.id, patient.clinicId],
      name: "billing_cycle_patient_patient_fk",
    }).onDelete("cascade"),
    index("billing_cycle_patient_clinic_idx").on(t.clinicId, t.cycleId),
  ],
);

// `mercadopagoWebhookEvent` (0071) foi removida na 0091 (#36, T18/D24): com o
// adapter e a rota do Mercado Pago deletados no T16, ninguém mais escrevia nem
// lia a tabela, e o trilho nunca faturou. A 0091 aborta se houver linha, para
// que "remoção de código morto" nunca vire descarte de evento não conciliado.

// ─── Nicho TCC (Terapia Cognitivo-Comportamental) — Registro de Pensamentos Distorcidos (RPD) ───
export const tccRpdEntry = pgTable(
  "tcc_rpd_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "restrict" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patient.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => session.id, {
      onDelete: "set null",
    }),
    situacao: text("situacao").notNull(),
    pensamentoAutomatico: text("pensamento_automatico").notNull(),
    emocao: text("emocao").notNull(),
    intensidade: integer("intensidade").notNull(),
    // #389 — formato Padesky (Mind Over Mood): evidências a favor/contra
    // viram o núcleo; distorção vira opcional/multivalorada e posterior à
    // reestruturação (era `distorcao_cognitiva text NOT NULL`, Burns puro).
    // Backfill em `0109`.
    distorcoesCognitivas: jsonb("distorcoes_cognitivas"),
    evidenciasFavor: text("evidencias_favor"),
    evidenciasContra: text("evidencias_contra"),
    credibilidadeInicial: smallint("credibilidade_inicial"),
    credibilidadeAlternativa: smallint("credibilidade_alternativa"),
    // "resposta racional" era NOT NULL (Burns); vira opcional — só a
    // completude "reestruturação completa" (derivada em leitura, nunca
    // coluna) exige. Rótulo na UI passa a ser "pensamento alternativo".
    respostaRacional: text("resposta_racional"),
    comportamentoResultante: text("comportamento_resultante"),
    intensidadePos: integer("intensidade_pos"),
    criadoPor: uuid("criado_por")
      .notNull()
      .references(() => appUser.id),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // #392 — proveniência: qual extração do agente originou esta linha
    // aprovada (NULL para RPD criado manualmente, sem sugestão). DISTINTA de
    // `alertaRiscoClinico.origemExtractionId` (tabela diferente, mesmo nome
    // por clareza semântica — âncora de alerta pré-aprovação, não proveniência
    // de RPD aprovado; sem FK cruzada entre as duas).
    origemExtractionId: uuid("origem_extraction_id").references(
      () => extraction.id,
    ),
    origemAgente: boolean("origem_agente").notNull().default(false),
  },
  (t) => [
    check("tcc_rpd_intensidade_range", sql`${t.intensidade} BETWEEN 0 AND 100`),
    check(
      "tcc_rpd_intensidade_pos_range",
      sql`${t.intensidadePos} IS NULL OR (${t.intensidadePos} BETWEEN 0 AND 100)`,
    ),
    check(
      "tcc_rpd_credibilidade_inicial_range",
      sql`${t.credibilidadeInicial} IS NULL OR (${t.credibilidadeInicial} BETWEEN 0 AND 100)`,
    ),
    check(
      "tcc_rpd_credibilidade_alternativa_range",
      sql`${t.credibilidadeAlternativa} IS NULL OR (${t.credibilidadeAlternativa} BETWEEN 0 AND 100)`,
    ),
    index("idx_tcc_rpd_patient").on(t.patientId, t.criadoEm.desc()),
    index("idx_tcc_rpd_clinic").on(t.clinicId),
  ],
);

// ─── #393 — Instrumentos padronizados (PHQ-9/GAD-7) ──────────────────────────
// Compartilhado com `instrumento_item_texto` (T3, mesma migração 0113): ambas
// as tabelas referenciam o mesmo tipo de instrumento.
export const instrumentoTipo = pgEnum("instrumento_tipo", ["phq9", "gad7"]);

// Mesmos valores de `fonte_do_escore` em `aplicacaoEscalaRelatadaSchema`
// (agent-output-schema.ts:149-151) — procedimental (como o número chegou),
// não taxonomia clínica.
export const instrumentoFonteEscore = pgEnum("instrumento_fonte_escore", [
  "paciente_informou",
  "terapeuta_calculou_na_sessao",
  "nao_informado",
]);

// Única superfície de escrita OFICIAL de `instrumento_aplicacao` é o form
// manual (`salvarInstrumentoAplicacao`, T4) — sem SECURITY DEFINER no
// caminho de escrita, então `app_role` recebe GRANT direto sob RLS, mesmo
// padrão de `tcc_rpd_entry` (não o padrão de `alerta_risco_clinico`, que é
// definer-only). Ver GRANT no `.sql` desta migração.
export const instrumentoAplicacao = pgTable(
  "instrumento_aplicacao",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "restrict" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patient.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => session.id, {
      onDelete: "set null",
    }),
    // Referência ao catálogo do instrumento (protocol.familia), NÃO ao
    // protocolo clínico ABA — mesmo nome de coluna por paralelismo com
    // `tccRpdEntry`/protocolos ABA, mas sem FK: catálogo de instrumento não
    // vive em `protocol` hoje (design.md §1).
    protocolId: text("protocol_id").notNull(),
    tipoInstrumento: instrumentoTipo("tipo_instrumento").notNull(),
    escoreTotal: integer("escore_total"),
    fonteDoEscore: instrumentoFonteEscore("fonte_do_escore").notNull(),
    respostasPorItem: jsonb("respostas_por_item").notNull(),
    // Só relevante PHQ-9 (item 9 = ideação suicida); NULL para GAD-7 ou item
    // não respondido.
    item9Valor: integer("item_9_valor"),
    // `null` ≠ `false`: item de risco não respondido é distinto de
    // "respondeu 0/negou" (mesma regra de `item_risco_positivo` no schema do
    // agente, agent-output-schema.ts:152-158). NUNCA `.default(false)`.
    itemRiscoPositivo: boolean("item_risco_positivo"),
    criadoPor: uuid("criado_por")
      .notNull()
      .references(() => appUser.id),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "instrumento_aplicacao_item9_range",
      sql`${t.item9Valor} IS NULL OR (${t.item9Valor} BETWEEN 0 AND 3)`,
    ),
    index("idx_instrumento_aplicacao_patient").on(
      t.patientId,
      t.criadoEm.desc(),
    ),
    index("idx_instrumento_aplicacao_clinic").on(t.clinicId),
  ],
);

// `instrumento_item_texto` (T3) — vaso vazio para o texto PT-BR (PHQ-9/GAD-7).
// Conteúdo é licenciado (Pfizer), pendente de confirmação jurídica: esta
// migração NÃO insere nenhuma linha com texto real; `texto` fica NULL até
// uma migração futura, depois da licença confirmada. `clinicId` nullable
// permite override por clínica no futuro, mas #393 não popula nada
// clinic-scoped nem global — zero seed. Tabela separada de `clinic` (não
// coluna JSONB): conteúdo é regulatório/compartilhado, não config por
// clínica (design.md, "Decisões técnicas").
export const instrumentoItemTexto = pgTable(
  "instrumento_item_texto",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tipoInstrumento: instrumentoTipo("tipo_instrumento").notNull(),
    numeroItem: integer("numero_item").notNull(),
    texto: text("texto"),
    clinicId: uuid("clinic_id").references(() => clinic.id, {
      onDelete: "cascade",
    }),
  },
  (t) => [
    index("idx_instrumento_item_texto_tipo").on(
      t.tipoInstrumento,
      t.numeroItem,
    ),
  ],
);

// ─── #407 — Anamnese, marco 0 da timeline (T01) ──────────────────────────────
// GRANTs, RLS, `app_anamnese_em_rascunho` e `app_validar_anamnese` são
// escritos à mão em 0115 (T03/T05) — fora do escopo desta task. Aqui só
// enums + tabelas + FKs + índices + CHECKs nomeados, no padrão de
// `instrumento_aplicacao` (0113) e `patient_protocol` (CHECK nomeado).
export const anamneseEstado = pgEnum("anamnese_estado", [
  "rascunho",
  "validada",
]);

// D-D: enum por linha do alvo, copiando o shape de `fonte_do_escore` (0113).
export const anamneseProcedencia = pgEnum("anamnese_procedencia", [
  "relatado_responsavel",
  "observado_avaliador",
  "registro_anterior",
]);

export const anamnese = pgTable(
  "anamnese",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "restrict" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patient.id, { onDelete: "cascade" }),
    estado: anamneseEstado("estado").notNull().default("rascunho"),
    // P3/ANAM-21: sugestão de protocolo e nível de entrada. Sempre editável
    // antes da validação; `sugestaoAceita` registra que o valor veio de
    // sugestão e não de escolha direta.
    protocolId: uuid("protocol_id").references(() => protocol.id, {
      onDelete: "restrict",
    }),
    nivelEntradaSugerido: text("nivel_entrada_sugerido"),
    sugestaoAceita: boolean("sugestao_aceita"),
    observacoes: text("observacoes"),
    // D-F: aponta para a anamnese validada que esta linha complementa. Nunca
    // UPDATE na original — append-only, linha nova complementa.
    complementaAnamneseId: uuid("complementa_anamnese_id"),
    criadoPor: uuid("criado_por")
      .notNull()
      .references(() => appUser.id),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    validadaPor: uuid("validada_por").references(() => appUser.id),
    validadaEm: timestamp("validada_em", { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      columns: [t.complementaAnamneseId],
      foreignColumns: [t.id],
      name: "anamnese_complementa_anamnese_id_anamnese_id_fk",
    }).onDelete("set null"),
    check(
      "anamnese_validada_coerente",
      // Os dois estados válidos, escritos por extensão. A forma anterior
      // (`(estado = 'validada') = (validada_em IS NOT NULL AND validada_por IS
      // NOT NULL)`) aceitava rascunho sujo: com só UM dos campos de auditoria
      // preenchido os dois lados dão FALSE e o CHECK passa.
      sql`(${t.estado} = 'validada' AND ${t.validadaEm} IS NOT NULL AND ${t.validadaPor} IS NOT NULL) OR (${t.estado} = 'rascunho' AND ${t.validadaEm} IS NULL AND ${t.validadaPor} IS NULL)`,
    ),
    index("idx_anamnese_patient").on(t.patientId, t.criadoEm.desc()),
    index("idx_anamnese_clinic").on(t.clinicId),
    // D-F: a vigente é a de maior `validadaEm`, com `id` como desempate
    // secundário. Nunca `criadoEm`. O índice espelha essa ordenação exata.
    index("idx_anamnese_vigente")
      .on(t.patientId, t.validadaEm.desc(), t.id.desc())
      .where(sql`${t.estado} = 'validada'`),
  ],
);

// `clinicId`/`patientId` denormalizados de propósito: permitem copiar o
// predicado canônico de RLS de `instrumento_aplicacao` (0113) literal, sem
// inventar policy com join (T03).
export const anamneseAlvo = pgTable(
  "anamnese_alvo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    anamneseId: uuid("anamnese_id")
      .notNull()
      .references(() => anamnese.id, { onDelete: "cascade" }),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "restrict" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patient.id, { onDelete: "cascade" }),
    // Espelha ORDEM_EIXOS de `src/lib/evidence/espectro.ts`. Text + CHECK em
    // vez de enum: o conjunto de eixos é derivado de domínio no código, e
    // mudar um enum em produção é migração com dado. Mantidos em sincronia
    // por teste.
    eixo: text("eixo").notNull(),
    descricao: text("descricao").notNull(),
    disciplina: text("disciplina"),
    milestoneId: uuid("milestone_id").references(() => milestone.id, {
      onDelete: "set null",
    }),
    // D-E: NULL = eixo não medido nesta anamnese. Nunca 0. `null` != "apoio
    // total" — mesmo raciocínio de `instrumentoAplicacao.itemRiscoPositivo`
    // (schema.ts, sem `.default`).
    nivelAjudaInicial: integer("nivel_ajuda_inicial"),
    procedencia: anamneseProcedencia("procedencia").notNull(),
    criterioN: integer("criterio_n").notNull().default(3),
    criterioM: integer("criterio_m").notNull().default(4),
    cicloRevisaoSemanas: integer("ciclo_revisao_semanas").notNull().default(8),
    // Preenchido na validação: liga o alvo à `goal` criada. `set null`
    // porque meta excluída deixa chave órfã tolerada (D-I), não apaga o
    // alvo.
    goalId: uuid("goal_id").references(() => goal.id, {
      onDelete: "set null",
    }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "anamnese_alvo_eixo_valido",
      sql`${t.eixo} IN (
        'comunicacao_expressiva','comunicacao_receptiva','interacao_social',
        'autonomia','regulacao','cognicao_academico'
      )`,
    ),
    check(
      "anamnese_alvo_disciplina_valida",
      sql`${t.disciplina} IS NULL OR ${t.disciplina} IN ('ABA','Fono','TO')`,
    ),
    check(
      "anamnese_alvo_nivel_range",
      sql`${t.nivelAjudaInicial} IS NULL OR (${t.nivelAjudaInicial} BETWEEN 0 AND 20)`,
    ),
    check(
      "anamnese_alvo_criterio_range",
      sql`${t.criterioN} BETWEEN 1 AND 99 AND ${t.criterioM} BETWEEN 1 AND 99`,
    ),
    check(
      "anamnese_alvo_ciclo_range",
      sql`${t.cicloRevisaoSemanas} BETWEEN 8 AND 12`,
    ),
    unique("anamnese_alvo_goal_unique").on(t.goalId),
    index("idx_anamnese_alvo_anamnese").on(t.anamneseId),
    index("idx_anamnese_alvo_clinic").on(t.clinicId),
  ],
);

// ─── #374 ∪ #353 — Exportação Integral do Acervo da Clínica (T1) ─────────────
// Bundle de exportação assíncrona do acervo da clínica (NDJSON + PDFs).
// GRANTs, RLS e funções SECURITY DEFINER de transição de estado são escritos
// à mão na migração 0117.
export const exportBundleStatus = pgEnum("export_bundle_status", [
  "pendente",
  "processando",
  "pronto",
  "falhou",
  "expirado",
]);

export const exportBundle = pgTable(
  "export_bundle",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "restrict" }),
    solicitadoPor: uuid("solicitado_por")
      .notNull()
      .references(() => appUser.id, { onDelete: "restrict" }),
    status: exportBundleStatus("status").notNull().default("pendente"),
    solicitadoEm: timestamp("solicitado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    iniciadoEm: timestamp("iniciado_em", { withTimezone: true }),
    concluidoEm: timestamp("concluido_em", { withTimezone: true }),
    expiraEm: timestamp("expira_em", { withTimezone: true }),
    tentativas: integer("tentativas").notNull().default(0),
    erro: text("erro"),
    bytesTamanho: bigint("bytes_tamanho", { mode: "number" }),
    sha256: text("sha256"),
    tokenHash: text("token_hash"),
    manifest: jsonb("manifest"),
  },
  (t) => [
    uniqueIndex("uq_export_bundle_ativo")
      .on(t.clinicId)
      .where(sql`${t.status} IN ('pendente', 'processando')`),
    check(
      "export_bundle_pronto_congelado",
      sql`${t.status} <> 'pronto' OR (${t.sha256} IS NOT NULL AND ${t.bytesTamanho} IS NOT NULL AND ${t.expiraEm} IS NOT NULL AND ${t.tokenHash} IS NOT NULL AND ${t.concluidoEm} IS NOT NULL)`,
    ),
    check(
      "export_bundle_falhou_motivado",
      sql`${t.status} <> 'falhou' OR ${t.erro} IS NOT NULL`,
    ),
    index("idx_export_bundle_clinic").on(t.clinicId, t.solicitadoEm.desc()),
  ],
);

export const exportBundleBlob = pgTable("export_bundle_blob", {
  bundleId: uuid("bundle_id")
    .primaryKey()
    .references(() => exportBundle.id, { onDelete: "cascade" }),
  bytes: bytea("bytes").notNull(),
});
