/**
 * Seed Rico de 3 Meses para Conta Específica (Com Snapshots Materializados)
 *
 * Popula:
 * - 7 Terapeutas (ABA, Denver, PROC, TCC, Convencional, TO, Fono)
 * - 2 Recepção
 * - 6 Pacientes pediátricos com consentimentos, perfil clínico e care team
 * - Catálogo Mestre de Protocolos (ABA, Denver, PROC, TCC, Convencional)
 * - Marcos de Evolução (milestones) por protocolo
 * - Metas PEI vinculadas aos marcos de evolução
 * - Histórico de 3 meses de sessões (realizadas com diário, extrações e evidências)
 * - Materialização de Snapshots (session_snapshot) para renderização da Timeline,
 *   Gráfico de Espectro/Radar, Deltas e evolução por disciplina
 * - Alertas clínicos de supervisão e risco
 *
 * Uso:
 *   pnpm tsx --conditions=react-server --env-file=.env scripts/seed-demo-account.ts sutil.romulo@gmail.com
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import {
  clinic,
  appUser,
  userRole,
  patient,
  patientClinicalProfile,
  consent,
  protocolFamiliaCatalogo,
  protocol,
  milestone,
  goalMilestoneMapping,
  patientProtocol,
  careTeamMembership,
  goal,
  session,
  sessionNote,
  extraction,
  evidence,
  alerta,
  alertaRiscoClinico,
} from "@/db/schema";
import { provisionUser } from "@/auth/provisioning";
import {
  materializarSnapshot,
  drizzleMaterializarQueries,
} from "@/lib/evidence/materializar";
import { assertSeedAllowed } from "./lib/guardrail-seed";

async function main() {
  const targetEmail = (process.argv[2] || "sutil.romulo@gmail.com")
    .toLowerCase()
    .trim();
  const senhaPadrao = "SenhaLocal123!";

  const migrationUrl =
    process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!migrationUrl) {
    throw new Error("MIGRATION_DATABASE_URL / DATABASE_URL não definida.");
  }

  assertSeedAllowed(migrationUrl);

  console.log("🔄 Conectando ao Postgres com perfil de owner...");
  const ownerSql = postgres(migrationUrl, { max: 1 });
  const ownerDb = drizzle(ownerSql, { schema, casing: "snake_case" });

  // 1. Buscar ou provisionar o usuário coordenador alvo
  console.log(`👤 Buscando usuário coordenador: ${targetEmail}...`);
  let [coordenador] = await ownerDb
    .select()
    .from(appUser)
    .where(sql`LOWER(${appUser.email}) = ${targetEmail}`)
    .limit(1);

  if (!coordenador) {
    console.log(`Criando usuário coordenador ${targetEmail}...`);
    const { userId } = await provisionUser({
      email: targetEmail,
      nome: "Rômulo Sutil Corrêa",
      senha: senhaPadrao,
      clinicId: "", // será preenchido abaixo
      papel: "coordenador",
      emailVerificado: true,
      db: ownerDb,
    });
    [coordenador] = await ownerDb
      .select()
      .from(appUser)
      .where(sql`${appUser.id} = ${userId}`);
  }

  if (!coordenador) throw new Error("Falha ao obter usuário coordenador.");

  // 2. Buscar ou criar a clínica vinculada
  const [vinculoExistente] = await ownerDb
    .select({
      clinicId: userRole.clinicId,
      nome: clinic.nome,
    })
    .from(userRole)
    .innerJoin(clinic, sql`${clinic.id} = ${userRole.clinicId}`)
    .where(sql`${userRole.userId} = ${coordenador.id}`)
    .limit(1);

  let clinicId: string;
  let clinicNome: string;

  if (vinculoExistente) {
    clinicId = vinculoExistente.clinicId;
    clinicNome = vinculoExistente.nome;
    console.log(`🏥 Usando clínica existente: "${clinicNome}" (${clinicId})`);
  } else {
    clinicNome = "Clínica Iris - Desenvolvimento Infantil";
    console.log(`🏥 Criando nova clínica: "${clinicNome}"...`);
    const [novaClinica] = await ownerDb
      .insert(clinic)
      .values({ nome: clinicNome })
      .returning();
    if (!novaClinica) throw new Error("Falha ao criar clínica.");
    clinicId = novaClinica.id;

    await ownerDb
      .insert(userRole)
      .values({
        userId: coordenador.id,
        clinicId,
        papel: "coordenador",
      })
      .onConflictDoNothing();
  }

  // 3. Catálogo e Protocolos da Clínica (ABA, Denver, PROC, TCC, Convencional, TO)
  console.log("📦 Garantindo catálogo de famílias e protocolos completos...");
  await ownerDb.execute(sql`
    INSERT INTO protocol_familia_catalogo (id, nome, descricao) VALUES
      ('aba_marcos_desenvolvimento', 'ABA — marcos de desenvolvimento', 'Protocolos de marcos (ex.: VB-MAPP, ABLLS-R)'),
      ('intervencao_naturalista', 'Intervenção naturalista', 'Modelos naturalistas (ex.: Denver/ESDM)'),
      ('fonoaudiologia', 'Fonoaudiologia', 'Protocolos de linguagem e comunicação (ex.: PROC)'),
      ('terapia_ocupacional', 'Terapia ocupacional', 'Protocolos de integração sensorial e AVDs'),
      ('psicoterapia_tcc', 'Psicoterapia TCC', 'Terapia Cognitivo-Comportamental Infantil'),
      ('terapia_convencional', 'Terapia convencional', 'Abordagens clínicas convencionais e multidisciplinares')
    ON CONFLICT (id) DO NOTHING;
  `);

  const protocolosDesejados = [
    {
      nome: "VB-MAPP",
      disciplina: "ABA",
      familia: "aba_marcos_desenvolvimento",
      taxonomiaAjuda: [
        "independente",
        "dica_verbal",
        "dica_gestual",
        "ajuda_fisica",
      ],
    },
    {
      nome: "Denver (ESDM)",
      disciplina: "Psicopedagogia",
      familia: "intervencao_naturalista",
      taxonomiaAjuda: [
        "independente",
        "modelo",
        "ajuda_fisica_parcial",
        "ajuda_fisica_total",
      ],
    },
    {
      nome: "PROC",
      disciplina: "Fonoaudiologia",
      familia: "fonoaudiologia",
      taxonomiaAjuda: ["independente", "dica_verbal", "modelo"],
    },
    {
      nome: "TCC",
      disciplina: "TCC",
      familia: "psicoterapia_tcc",
      taxonomiaAjuda: ["autonomo", "suporte_cognitivo", "mediacao_terapeuta"],
    },
    {
      nome: "Terapia Convencional",
      disciplina: "Convencional",
      familia: "terapia_convencional",
      taxonomiaAjuda: ["independente", "assistido", "totalmente_dependente"],
    },
    {
      nome: "Perfil Sensorial 2",
      disciplina: "Terapia Ocupacional",
      familia: "terapia_ocupacional",
      taxonomiaAjuda: ["independente", "dica_tatil", "suporte_sensorial"],
    },
    {
      nome: "ABLLS-R",
      disciplina: "ABA",
      familia: "aba_marcos_desenvolvimento",
      taxonomiaAjuda: ["independente", "dica_verbal", "ajuda_fisica"],
    },
  ];

  const protocolosCadastrados: Record<string, string> = {};
  for (const p of protocolosDesejados) {
    const [existente] = await ownerDb
      .select({ id: protocol.id })
      .from(protocol)
      .where(
        sql`${protocol.clinicId} = ${clinicId} AND ${protocol.nome} = ${p.nome}`,
      )
      .limit(1);

    if (existente) {
      protocolosCadastrados[p.nome] = existente.id;
    } else {
      const [novo] = await ownerDb
        .insert(protocol)
        .values({
          clinicId,
          nome: p.nome,
          disciplina: p.disciplina,
          familia: p.familia,
          taxonomiaAjuda: p.taxonomiaAjuda,
        })
        .returning();
      if (novo) protocolosCadastrados[p.nome] = novo.id;
    }
  }

  // 3.5 Cadastrar Marcos de Evolução (milestones) por protocolo
  console.log(
    "🎯 Cadastrando marcos de evolução (milestones) para os protocolos...",
  );
  const marcosDefinidos = [
    // VB-MAPP (ABA)
    {
      protocolNome: "VB-MAPP",
      dominioId: "mando",
      nome: "Mando 1-M: Emite 2 palavras para pedir itens desejados",
      nivel: "nivel_1",
      tipoEstrutura: "marco_simples" as const,
      ordem: 1,
    },
    {
      protocolNome: "VB-MAPP",
      dominioId: "tato",
      nome: "Tato 1-M: Nomeia 5 objetos/figuras conhecidos",
      nivel: "nivel_1",
      tipoEstrutura: "marco_simples" as const,
      ordem: 1,
    },
    {
      protocolNome: "VB-MAPP",
      dominioId: "intraverbal",
      nome: "Intraverbal 2-M: Responde a perguntas simples sobre a rotina",
      nivel: "nivel_2",
      tipoEstrutura: "marco_simples" as const,
      ordem: 2,
    },

    // Denver (ESDM)
    {
      protocolNome: "Denver (ESDM)",
      dominioId: "comunicacao_receptiva",
      nome: "Denver R-1: Atende prontamente quando chamado pelo nome",
      nivel: "nivel_1",
      tipoEstrutura: "marco_simples" as const,
      ordem: 1,
    },
    {
      protocolNome: "Denver (ESDM)",
      dominioId: "social",
      nome: "Denver S-1: Mantém contato visual e atenção compartilhada",
      nivel: "nivel_1",
      tipoEstrutura: "marco_simples" as const,
      ordem: 1,
    },
    {
      protocolNome: "Denver (ESDM)",
      dominioId: "jogo_simbolico",
      nome: "Denver J-2: Realiza brincadeiras de faz-de-conta com miniaturas",
      nivel: "nivel_2",
      tipoEstrutura: "marco_simples" as const,
      ordem: 2,
    },

    // PROC (Fonoaudiologia)
    {
      protocolNome: "PROC",
      dominioId: "comunicacao_nao_verbal",
      nome: "PROC CNV-1: Aponta e gesticula para expressar intenção",
      nivel: "nivel_1",
      tipoEstrutura: "marco_simples" as const,
      ordem: 1,
    },
    {
      protocolNome: "PROC",
      dominioId: "comunicacao_verbal",
      nome: "PROC CV-2: Produção de enunciados verbais estruturados",
      nivel: "nivel_2",
      tipoEstrutura: "marco_simples" as const,
      ordem: 2,
    },

    // TCC (Psicoterapia Cognitivo-Comportamental)
    {
      protocolNome: "TCC",
      dominioId: "regulacao_emocional",
      nome: "TCC RE-1: Identifica e nomeia emoções básicas no termômetro emocional",
      nivel: "nivel_1",
      tipoEstrutura: "marco_simples" as const,
      ordem: 1,
    },
    {
      protocolNome: "TCC",
      dominioId: "reestruturacao_cognitiva",
      nome: "TCC RC-2: Identifica pensamentos disfuncionais e propõe alternativas",
      nivel: "nivel_2",
      tipoEstrutura: "marco_simples" as const,
      ordem: 2,
    },
    {
      protocolNome: "TCC",
      dominioId: "resolucao_problemas",
      nome: "TCC RP-2: Aplica técnica de 3 passos para resolução de conflitos",
      nivel: "nivel_2",
      tipoEstrutura: "marco_simples" as const,
      ordem: 2,
    },

    // Terapia Convencional
    {
      protocolNome: "Terapia Convencional",
      dominioId: "integracao_sensorial",
      nome: "Convencional IS-1: Tolera estímulos sensoriais em AVDs",
      nivel: "nivel_1",
      tipoEstrutura: "marco_simples" as const,
      ordem: 1,
    },
    {
      protocolNome: "Terapia Convencional",
      dominioId: "motricidade_fina",
      nome: "Convencional MF-1: Preensão adequada e controle visomotor",
      nivel: "nivel_1",
      tipoEstrutura: "marco_simples" as const,
      ordem: 1,
    },
    {
      protocolNome: "Terapia Convencional",
      dominioId: "articulacao_verbal",
      nome: "Convencional AV-1: Articulação correta de fonemas alvo",
      nivel: "nivel_1",
      tipoEstrutura: "marco_simples" as const,
      ordem: 1,
    },
  ];

  const marcosCadastrados: Record<string, string> = {};
  for (const mDef of marcosDefinidos) {
    const protId = protocolosCadastrados[mDef.protocolNome];
    if (!protId) continue;

    const [existente] = await ownerDb
      .select({ id: milestone.id })
      .from(milestone)
      .where(
        sql`${milestone.protocolId} = ${protId} AND ${milestone.dominioId} = ${mDef.dominioId} AND ${milestone.nivel} = ${mDef.nivel}`,
      )
      .limit(1);

    if (existente) {
      marcosCadastrados[`${mDef.protocolNome}::${mDef.dominioId}`] =
        existente.id;
    } else {
      const [novo] = await ownerDb
        .insert(milestone)
        .values({
          protocolId: protId,
          dominioId: mDef.dominioId,
          nome: mDef.nome,
          nivel: mDef.nivel,
          tipoEstrutura: mDef.tipoEstrutura,
          estrutura: {},
          ordem: mDef.ordem,
        })
        .returning();
      if (novo) {
        marcosCadastrados[`${mDef.protocolNome}::${mDef.dominioId}`] = novo.id;
      }
    }
  }

  // 4. Provisionamento dos Terapeutas e Recepção
  console.log("👩‍⚕️ Provisionando equipe clínica multidisciplinar...");
  const equipe = [
    {
      email: "mariana.costa@iris.test",
      nome: "Dra. Mariana Costa",
      papel: "terapeuta" as const,
      disciplina: "ABA",
    },
    {
      email: "bruno.fono@iris.test",
      nome: "Bruno Almeida",
      papel: "terapeuta" as const,
      disciplina: "Fonoaudiologia",
    },
    {
      email: "camila.to@iris.test",
      nome: "Camila Nogueira",
      papel: "terapeuta" as const,
      disciplina: "Terapia Ocupacional",
    },
    {
      email: "lucas.mendes@iris.test",
      nome: "Lucas Mendes",
      papel: "terapeuta" as const,
      disciplina: "Psicopedagogia",
    },
    {
      email: "paula.tcc@iris.test",
      nome: "Dra. Paula TCC",
      papel: "terapeuta" as const,
      disciplina: "TCC",
    },
    {
      email: "rodrigo.convencional@iris.test",
      nome: "Rodrigo Silva",
      papel: "terapeuta" as const,
      disciplina: "Convencional",
    },
    {
      email: "fernanda.ribeiro@iris.test",
      nome: "Fernanda Ribeiro",
      papel: "terapeuta" as const,
      disciplina: "ABA",
    },
    {
      email: "patricia.recepcao@iris.test",
      nome: "Patrícia Lima",
      papel: "admin_recepcao" as const,
    },
    {
      email: "juliana.recepcao@iris.test",
      nome: "Juliana Santos",
      papel: "admin_recepcao" as const,
    },
  ];

  const usuariosEquipe: Record<string, string> = {};
  for (const membro of equipe) {
    const { userId } = await provisionUser({
      email: membro.email,
      nome: membro.nome,
      senha: senhaPadrao,
      clinicId,
      papel: membro.papel,
      emailVerificado: true,
      db: ownerDb,
    });
    usuariosEquipe[membro.email] = userId;
  }

  // 5. Definição e Cadastro dos Pacientes com Metas Abrangendo ABA, Denver, PROC, TCC e Convencional
  console.log("🧒 Cadastrando 6 pacientes com metas multidisciplinares...");

  type MetaDef = {
    descricao: string;
    disciplina: string;
    protocolo: string;
    dominioId: string;
    estado: "dominada" | "ativa";
    criterio: Record<string, any>;
    temRegressao?: boolean;
    temEstagnacao?: boolean;
  };

  type PacienteDef = {
    chave: string;
    nome: string;
    nascimento: string;
    responsavelContato: string;
    responsavelNome: string;
    responsavelCpf: string;
    escola: string;
    convenio: string;
    diagnostico: string;
    medicacoes: string;
    alergias: string;
    convulsoes: string;
    contatosEmergencia: string;
    protocolos: string[];
    terapeutas: { email: string; disciplina: string; horas: string }[];
    metas: MetaDef[];
  };

  const dadosPacientes: PacienteDef[] = [
    {
      chave: "alice",
      nome: "Alice Beatriz Lima",
      nascimento: "2021-09-05",
      responsavelContato: "Renata Lima (Mãe) - (11) 95432-1098",
      responsavelNome: "Renata Lima",
      responsavelCpf: "567.890.123-44",
      escola: "Colégio São Lucas",
      convenio: "SulAmérica",
      diagnostico: "F80.1 - Transtorno Expressivo da Linguagem + TEA Nível 1",
      medicacoes: "Sem medicação",
      alergias: "Sem alergias",
      convulsoes: "Sem histórico",
      contatosEmergencia: "Renata (Mãe): (11) 95432-1098",
      protocolos: [
        "VB-MAPP",
        "Denver (ESDM)",
        "PROC",
        "TCC",
        "Terapia Convencional",
        "Perfil Sensorial 2",
      ],
      terapeutas: [
        { email: "mariana.costa@iris.test", disciplina: "ABA", horas: "3.0" },
        {
          email: "bruno.fono@iris.test",
          disciplina: "Fonoaudiologia",
          horas: "3.0",
        },
        { email: "paula.tcc@iris.test", disciplina: "TCC", horas: "2.0" },
        {
          email: "rodrigo.convencional@iris.test",
          disciplina: "Convencional",
          horas: "2.0",
        },
      ],
      metas: [
        {
          descricao:
            "Emitir mandos vocais de 2 a 3 palavras para solicitar itens desejados",
          disciplina: "ABA",
          protocolo: "VB-MAPP",
          dominioId: "mando",
          estado: "dominada" as const,
          criterio: { tipo: "acerto_consecutivo", valor: 85, sessoes: 3 },
        },
        {
          descricao:
            "Manter atenção compartilhada e contato visual durante interação interpessoal",
          disciplina: "Psicopedagogia",
          protocolo: "Denver (ESDM)",
          dominioId: "social",
          estado: "ativa" as const,
          criterio: { tipo: "frequencia", valor: 8 },
        },
        {
          descricao:
            "Produzir enunciados verbais estruturados de 3 a 4 palavras em situações de diálogo",
          disciplina: "Fonoaudiologia",
          protocolo: "PROC",
          dominioId: "comunicacao_verbal",
          estado: "ativa" as const,
          criterio: { tipo: "vocabulario_alvo", valor: 50 },
        },
        {
          descricao:
            "Identificar emoções básicas e aplicar estratégias de autorregulação emocional TCC",
          disciplina: "TCC",
          protocolo: "TCC",
          dominioId: "regulacao_emocional",
          estado: "ativa" as const,
          criterio: { tipo: "precisao", valor: 80 },
        },
        {
          descricao:
            "Desenvolver tolerância sensorial tátil e proprioceptiva nas AVDs convencionais",
          disciplina: "Convencional",
          protocolo: "Terapia Convencional",
          dominioId: "integracao_sensorial",
          estado: "ativa" as const,
          criterio: { tipo: "independencia", valor: 75 },
        },
      ],
    },
    {
      chave: "enzo",
      nome: "Enzo Gabriel Silva",
      nascimento: "2022-04-12",
      responsavelContato: "Juliana Silva (Mãe) - (11) 98765-4321",
      responsavelNome: "Juliana Silva",
      responsavelCpf: "234.567.890-11",
      escola: "Escola Infantil Aquarela",
      convenio: "Unimed",
      diagnostico:
        "F84.0 - Transtorno do Espectro Autista (Nível 2 de Suporte)",
      medicacoes: "Sem medicação contínua",
      alergias: "Alergia a amendoim",
      convulsoes: "Sem histórico",
      contatosEmergencia: "Mãe: (11) 98765-4321",
      protocolos: [
        "VB-MAPP",
        "Denver (ESDM)",
        "PROC",
        "TCC",
        "Terapia Convencional",
      ],
      terapeutas: [
        { email: "mariana.costa@iris.test", disciplina: "ABA", horas: "4.0" },
        {
          email: "bruno.fono@iris.test",
          disciplina: "Fonoaudiologia",
          horas: "2.0",
        },
        { email: "paula.tcc@iris.test", disciplina: "TCC", horas: "2.0" },
      ],
      metas: [
        {
          descricao: "Nomear objetos e figuras do ambiente sob comando tático",
          disciplina: "ABA",
          protocolo: "VB-MAPP",
          dominioId: "tato",
          estado: "dominada" as const,
          criterio: { tipo: "acertos", valor: 90 },
        },
        {
          descricao:
            "Realizar brincadeiras de faz-de-conta com miniaturas em sessões Denver",
          disciplina: "Psicopedagogia",
          protocolo: "Denver (ESDM)",
          dominioId: "jogo_simbolico",
          estado: "ativa" as const,
          criterio: { tipo: "tempo_min", valor: 10 },
        },
        {
          descricao:
            "Utilizar técnicas TCC de resolução de problemas para controlar comportamento disruptivo",
          disciplina: "TCC",
          protocolo: "TCC",
          dominioId: "resolucao_problemas",
          estado: "ativa" as const,
          criterio: { tipo: "latencia_tolerancia", valor: 90 },
          temRegressao: true,
        },
      ],
    },
    {
      chave: "sofia",
      nome: "Sofia Martins de Oliveira",
      nascimento: "2020-08-20",
      responsavelContato: "Carla Martins (Mãe) - (11) 97654-3210",
      responsavelNome: "Carla Martins",
      responsavelCpf: "345.678.901-22",
      escola: "Colégio Futuro Brilhante",
      convenio: "Bradesco Saúde",
      diagnostico: "F84.0 - TEA Nível 1 de Suporte + F90.0 - TDAH",
      medicacoes: "Metilfenidato 10mg",
      alergias: "Sem alergias",
      convulsoes: "Sem histórico",
      contatosEmergencia: "Carla (Mãe): (11) 97654-3210",
      protocolos: ["Denver (ESDM)", "TCC", "Terapia Convencional", "PROC"],
      terapeutas: [
        {
          email: "lucas.mendes@iris.test",
          disciplina: "Psicopedagogia",
          horas: "3.0",
        },
        { email: "paula.tcc@iris.test", disciplina: "TCC", horas: "3.0" },
      ],
      metas: [
        {
          descricao:
            "Identificar pensamentos automáticos e propor reestruturação cognitiva TCC",
          disciplina: "TCC",
          protocolo: "TCC",
          dominioId: "reestruturacao_cognitiva",
          estado: "ativa" as const,
          criterio: { tipo: "precisao", valor: 85 },
        },
        {
          descricao:
            "Atender ao chamado receptivo e manter engajamento em rotinas escolares",
          disciplina: "Psicopedagogia",
          protocolo: "Denver (ESDM)",
          dominioId: "comunicacao_receptiva",
          estado: "dominada" as const,
          criterio: { tipo: "turnos", valor: 5 },
        },
      ],
    },
    {
      chave: "theo",
      nome: "Theo Henrique Souza",
      nascimento: "2023-01-15",
      responsavelContato: "Marcos Souza (Pai) - (11) 96543-2109",
      responsavelNome: "Marcos Souza",
      responsavelCpf: "456.789.012-33",
      escola: "Espaço Criança Feliz",
      convenio: "Particular",
      diagnostico: "F84.0 - TEA Nível 3 de Suporte",
      medicacoes: "Risperidona 0.25mg",
      alergias: "Lactose",
      convulsoes: "Histórico febril prévio",
      contatosEmergencia: "Marcos (Pai): (11) 96543-2109",
      protocolos: ["VB-MAPP", "PROC", "Terapia Convencional"],
      terapeutas: [
        { email: "mariana.costa@iris.test", disciplina: "ABA", horas: "6.0" },
        {
          email: "bruno.fono@iris.test",
          disciplina: "Fonoaudiologia",
          horas: "2.0",
        },
      ],
      metas: [
        {
          descricao:
            "Responder a perguntas intraverbais simples com apoio de pistas sociais",
          disciplina: "ABA",
          protocolo: "VB-MAPP",
          dominioId: "intraverbal",
          estado: "ativa" as const,
          criterio: { tipo: "acertos", valor: 75 },
          temRegressao: true,
        },
        {
          descricao:
            "Expressar intenção comunicativa por meio de gestos não-verbais no PROC",
          disciplina: "Fonoaudiologia",
          protocolo: "PROC",
          dominioId: "comunicacao_nao_verbal",
          estado: "dominada" as const,
          criterio: { tipo: "acertos", valor: 90 },
        },
      ],
    },
    {
      chave: "bernardo",
      nome: "Bernardo Castilho",
      nascimento: "2019-11-18",
      responsavelContato: "Felipe Castilho (Pai) - (11) 94321-0987",
      responsavelNome: "Felipe Castilho",
      responsavelCpf: "678.901.234-55",
      escola: "Escola Municipal Monteiro Lobato",
      convenio: "Amil",
      diagnostico: "F84.0 - TEA Nível 2 + Dispraxia Motor",
      medicacoes: "Sem medicação contínua",
      alergias: "Sem alergias",
      convulsoes: "Sem histórico",
      contatosEmergencia: "Felipe (Pai): (11) 94321-0987",
      protocolos: [
        "Terapia Convencional",
        "Perfil Sensorial 2",
        "TCC",
        "VB-MAPP",
      ],
      terapeutas: [
        {
          email: "rodrigo.convencional@iris.test",
          disciplina: "Convencional",
          horas: "3.0",
        },
        { email: "paula.tcc@iris.test", disciplina: "TCC", horas: "2.0" },
      ],
      metas: [
        {
          descricao:
            "Desenvolver preensão motora fina e coordenação visomotora convencional",
          disciplina: "Convencional",
          protocolo: "Terapia Convencional",
          dominioId: "motricidade_fina",
          estado: "dominada" as const,
          criterio: { tipo: "independencia", valor: 90 },
        },
        {
          descricao:
            "Aplicar autorregulação e controle de frustração TCC durante tarefas motoras",
          disciplina: "TCC",
          protocolo: "TCC",
          dominioId: "regulacao_emocional",
          estado: "ativa" as const,
          criterio: { tipo: "acertos", valor: 80 },
          temRegressao: true,
        },
      ],
    },
    {
      chave: "helena",
      nome: "Helena Vasconcelos",
      nascimento: "2022-02-28",
      responsavelContato: "Patrícia Vasconcelos (Mãe) - (11) 93210-9876",
      responsavelNome: "Patrícia Vasconcelos",
      responsavelCpf: "789.012.345-66",
      escola: "Jardim dos Sonhos",
      convenio: "Particular",
      diagnostico: "F84.0 - Transtorno do Espectro Autista (Nível 1)",
      medicacoes: "Não utiliza",
      alergias: "Sem alergias",
      convulsoes: "Sem histórico",
      contatosEmergencia: "Patrícia (Mãe): (11) 93210-9876",
      protocolos: ["Denver (ESDM)", "PROC", "TCC"],
      terapeutas: [
        {
          email: "lucas.mendes@iris.test",
          disciplina: "Psicopedagogia",
          horas: "3.0",
        },
        {
          email: "bruno.fono@iris.test",
          disciplina: "Fonoaudiologia",
          horas: "2.0",
        },
      ],
      metas: [
        {
          descricao:
            "Aprimorar articulação verbal dos fonemas-alvo em fonoaudiologia convencional/PROC",
          disciplina: "Fonoaudiologia",
          protocolo: "PROC",
          dominioId: "comunicacao_verbal",
          estado: "ativa" as const,
          criterio: { tipo: "precisao", valor: 70 },
          temEstagnacao: true,
        },
      ],
    },
  ];

  // 5.5 Limpar pacientes demo existentes para garantir idempotência
  console.log(
    "🧹 Limpando dados anteriores dos 6 pacientes demo para idempotência...",
  );
  const nomesDemo = dadosPacientes.map((d) => d.nome);
  await ownerSql`DELETE FROM session_snapshot WHERE patient_id IN (SELECT id FROM patient WHERE clinic_id = ${clinicId} AND nome = ANY(${nomesDemo}))`;
  await ownerSql`DELETE FROM evidence WHERE patient_id IN (SELECT id FROM patient WHERE clinic_id = ${clinicId} AND nome = ANY(${nomesDemo}))`;
  await ownerSql`DELETE FROM extraction WHERE session_id IN (SELECT id FROM session WHERE clinic_id = ${clinicId} AND patient_id IN (SELECT id FROM patient WHERE clinic_id = ${clinicId} AND nome = ANY(${nomesDemo})))`;
  await ownerSql`DELETE FROM session_note WHERE clinic_id = ${clinicId} AND session_id IN (SELECT id FROM session WHERE clinic_id = ${clinicId} AND patient_id IN (SELECT id FROM patient WHERE clinic_id = ${clinicId} AND nome = ANY(${nomesDemo})))`;
  await ownerSql`DELETE FROM alerta_risco_clinico WHERE clinic_id = ${clinicId} AND patient_id IN (SELECT id FROM patient WHERE clinic_id = ${clinicId} AND nome = ANY(${nomesDemo}))`;
  await ownerSql`DELETE FROM alerta WHERE clinic_id = ${clinicId} AND patient_id IN (SELECT id FROM patient WHERE clinic_id = ${clinicId} AND nome = ANY(${nomesDemo}))`;
  await ownerSql`DELETE FROM session WHERE clinic_id = ${clinicId} AND patient_id IN (SELECT id FROM patient WHERE clinic_id = ${clinicId} AND nome = ANY(${nomesDemo}))`;
  await ownerSql`DELETE FROM goal_milestone_mapping WHERE goal_id IN (SELECT id FROM goal WHERE clinic_id = ${clinicId} AND patient_id IN (SELECT id FROM patient WHERE clinic_id = ${clinicId} AND nome = ANY(${nomesDemo})))`;
  await ownerSql`DELETE FROM goal WHERE clinic_id = ${clinicId} AND patient_id IN (SELECT id FROM patient WHERE clinic_id = ${clinicId} AND nome = ANY(${nomesDemo}))`;
  await ownerSql`DELETE FROM patient_protocol WHERE patient_id IN (SELECT id FROM patient WHERE clinic_id = ${clinicId} AND nome = ANY(${nomesDemo}))`;
  await ownerSql`DELETE FROM care_team_membership WHERE patient_id IN (SELECT id FROM patient WHERE clinic_id = ${clinicId} AND nome = ANY(${nomesDemo}))`;
  await ownerSql`DELETE FROM consent WHERE patient_id IN (SELECT id FROM patient WHERE clinic_id = ${clinicId} AND nome = ANY(${nomesDemo}))`;
  await ownerSql`DELETE FROM patient_clinical_profile WHERE patient_id IN (SELECT id FROM patient WHERE clinic_id = ${clinicId} AND nome = ANY(${nomesDemo}))`;
  await ownerSql`DELETE FROM patient WHERE clinic_id = ${clinicId} AND nome = ANY(${nomesDemo})`;

  // 6. Cadastrar os pacientes no banco
  const agora = new Date();
  const tresMesesAtras = new Date(agora.getTime() - 90 * 24 * 60 * 60 * 1000);

  for (const pData of dadosPacientes) {
    let patientId: string;
    const [novoP] = await ownerDb
      .insert(patient)
      .values({
        clinicId,
        nome: pData.nome,
        nascimento: pData.nascimento,
        responsavelContato: pData.responsavelContato,
        responsavelCpf: pData.responsavelCpf,
        escola: pData.escola,
        convenio: pData.convenio,
        clinicalModality: "protocol_driven",
        criadoEm: tresMesesAtras,
      })
      .returning();
    if (!novoP) throw new Error(`Falha ao criar paciente ${pData.nome}`);
    patientId = novoP.id;
    console.log(`  + Criado paciente: ${pData.nome}`);

    // Consentimentos LGPD
    const tiposConsentimento = [
      "tratamento_dados_menor" as const,
      "uso_ia_processamento" as const,
      "exportacao_relatorios" as const,
    ];
    for (const tipoC of tiposConsentimento) {
      await ownerDb
        .insert(consent)
        .values({
          patientId,
          tipo: tipoC,
          responsavelSignatario: pData.responsavelNome,
          versaoTermo: "termo-v1",
          assinadoEm: tresMesesAtras,
        })
        .onConflictDoNothing();
    }

    // Perfil Clínico
    await ownerDb
      .insert(patientClinicalProfile)
      .values({
        patientId,
        diagnostico: pData.diagnostico,
        medicacoes: pData.medicacoes,
        alergias: pData.alergias,
        convulsoes: pData.convulsoes,
        contatosEmergencia: pData.contatosEmergencia,
        criadoEm: tresMesesAtras,
      })
      .onConflictDoNothing();

    // Protocolos Ativos
    for (const protNome of pData.protocolos) {
      const protId = protocolosCadastrados[protNome];
      if (protId) {
        await ownerDb
          .insert(patientProtocol)
          .values({
            patientId,
            protocolId: protId,
            ativadoEm: tresMesesAtras.toISOString().slice(0, 10),
            ativadoPor: coordenador.id,
          })
          .onConflictDoNothing();
      }
    }

    // Equipe de Referência (Care Team)
    for (const t of pData.terapeutas) {
      const terapeutaUserId = usuariosEquipe[t.email];
      if (terapeutaUserId) {
        await ownerDb
          .insert(careTeamMembership)
          .values({
            patientId,
            userId: terapeutaUserId,
            disciplina: t.disciplina,
            papelNaEquipe: "terapeuta_referencia",
            horasSemana: t.horas,
            vigenciaInicio: tresMesesAtras.toISOString().slice(0, 10),
          })
          .onConflictDoNothing();
      }
    }

    // Metas PEI + Vínculo com Marcos (Milestones)
    const metasCadastradas: {
      id: string;
      descricao: string;
      disciplina: string;
      protocolo: string;
      dominioId: string;
      milestoneId: string | null;
      estado: "dominada" | "ativa";
      temRegressao?: boolean;
      temEstagnacao?: boolean;
    }[] = [];

    for (const metaData of pData.metas) {
      const [novaMeta] = await ownerDb
        .insert(goal)
        .values({
          patientId,
          clinicId,
          descricao: metaData.descricao,
          disciplina: metaData.disciplina,
          estado: metaData.estado,
          criterioDominio: metaData.criterio,
          cicloRevisaoSemanas: 10,
          proximaRevisaoEm: new Date(agora.getTime() + 14 * 86400000)
            .toISOString()
            .slice(0, 10),
          criadoPor: coordenador.id,
          criadoEm: tresMesesAtras,
        })
        .returning();

      if (!novaMeta) continue;
      const goalId = novaMeta.id;

      // Vincular com milestone cadastrado
      const mId =
        marcosCadastrados[`${metaData.protocolo}::${metaData.dominioId}`] ||
        null;
      if (mId) {
        await ownerDb
          .insert(goalMilestoneMapping)
          .values({ goalId, milestoneId: mId })
          .onConflictDoNothing();
      }

      metasCadastradas.push({
        id: goalId,
        descricao: metaData.descricao,
        disciplina: metaData.disciplina,
        protocolo: metaData.protocolo,
        dominioId: metaData.dominioId,
        milestoneId: mId,
        estado: metaData.estado,
        temRegressao: metaData.temRegressao,
        temEstagnacao: metaData.temEstagnacao,
      });
    }

    // 7. Gerar 3 Meses de Sessões (~12 semanas) com Notas e Evidências
    console.log(
      `  📅 Gerando sessões e evolução de 3 meses para ${pData.nome}...`,
    );
    const totalSemanas = 12;
    let seqPaciente = 1;

    for (let sem = 0; sem < totalSemanas; sem++) {
      const dataSemana = new Date(
        tresMesesAtras.getTime() + sem * 7 * 86400000 + 2 * 86400000,
      );

      for (const t of pData.terapeutas) {
        const terapeutaUserId = usuariosEquipe[t.email];
        if (!terapeutaUserId) continue;

        const dataSessao = new Date(dataSemana.getTime() + 14 * 3600000);
        const isPassado = dataSessao < agora;

        // Cria a sessão
        const [sessaoCriada] = await ownerDb
          .insert(session)
          .values({
            clinicId,
            patientId,
            terapeutaId: terapeutaUserId,
            agendadaPara: dataSessao,
            estado: isPassado ? "realizada" : "agendada",
            checkInEm: isPassado ? dataSessao : null,
            numeroSequencialPaciente: isPassado ? seqPaciente++ : null,
            disciplina: t.disciplina,
            duracaoMin: 50,
            modalidade: "presencial",
            tipo: "terapia",
            criadoEm: dataSessao,
          })
          .returning();

        if (!sessaoCriada || !isPassado) continue;

        // Nota rica da sessão (Diário)
        let textoDiario = "";
        let tipoEvolucao = "avanco";

        if (sem < 4) {
          textoDiario = `Sessão #${sessaoCriada.numeroSequencialPaciente} de ${t.disciplina}. Paciente apresentou boa receptividade ao protocolo de ${t.disciplina}. Foram trabalhadas 10 tentativas para metas de comunicação, regulação e engajamento. Respondeu com nível de ajuda moderado (suporte do terapeuta).`;
        } else if (sem >= 4 && sem < 8) {
          textoDiario = `Sessão #${sessaoCriada.numeroSequencialPaciente} de ${t.disciplina}. Paciente demonstrou autonomia crescente nas atividades propostas. Atingiu 8 de 10 tentativas corretas com dicas leves. Boa generalização e resposta positiva aos reforçadores.`;
        } else {
          const temRegressaoNoCaso = pData.metas.some((m) => m.temRegressao);
          if (temRegressaoNoCaso && sem >= 9) {
            tipoEvolucao = "regressao";
            textoDiario = `Sessão #${sessaoCriada.numeroSequencialPaciente} de ${t.disciplina}. Paciente apresentou oscilação de desempenho e menor tolerância à frustração. Necessitou de maior suporte de autorregulação e ajuste temporário nas demandas.`;
          } else {
            textoDiario = `Sessão #${sessaoCriada.numeroSequencialPaciente} de ${t.disciplina}. Excelente sessão! Paciente atingiu independência total nas metas trabalhadas em 90% das oportunidades. Avanço consolidado no protocolo.`;
          }
        }

        // Salva a nota consolidada
        await ownerDb
          .insert(sessionNote)
          .values({
            sessionId: sessaoCriada.id,
            clinicId,
            tipo: "nota_consolidada",
            texto: textoDiario,
            autorId: terapeutaUserId,
            criadoEm: dataSessao,
            atualizadoEm: dataSessao,
          })
          .onConflictDoNothing();

        // Evidências e Extrações para TODAS as metas do paciente compatíveis com a disciplina
        const metasDaDisciplina = metasCadastradas.filter(
          (m) => m.disciplina === t.disciplina || metasCadastradas.length <= 2,
        );
        const metasAlvo =
          metasDaDisciplina.length > 0 ? metasDaDisciplina : metasCadastradas;

        for (let idx = 0; idx < metasAlvo.length; idx++) {
          const meta = metasAlvo[idx]!;

          // Nível de ajuda evolutivo (Semana 0..3: ajuda física/dica verbal | 4..7: dica gestual/modelo | 8..11: independente)
          let nivelAjuda = "independente";
          if (sem < 4) nivelAjuda = "dica_verbal";
          else if (sem < 8) nivelAjuda = "dica_gestual";

          if (tipoEvolucao === "regressao" && sem >= 9) {
            nivelAjuda = "ajuda_fisica";
          }

          const [ext] = await ownerDb
            .insert(extraction)
            .values({
              sessionId: sessaoCriada.id,
              clinicId,
              estado: "aprovada",
              subtipo: "evidencia",
              trechoFonte: textoDiario,
              confianca: "alta",
              justificativaConfianca:
                "Evidência observada diretamente na sessão clínica.",
              payload: {
                alvos: [
                  {
                    goalRef: meta.descricao,
                    resultado:
                      tipoEvolucao === "regressao" && sem >= 9
                        ? "erro"
                        : "acerto",
                    independencia:
                      tipoEvolucao === "regressao" && sem >= 9
                        ? 35
                        : sem >= 8
                          ? 90
                          : 70,
                    tentativas: 10,
                  },
                ],
              },
              payloadEditado: null,
              revisadoPor: terapeutaUserId,
              revisadoEm: new Date(dataSessao.getTime() + 1800000),
            })
            .returning();

          if (ext) {
            const protId = protocolosCadastrados[meta.protocolo] || null;
            await ownerDb
              .insert(evidence)
              .values({
                extractionId: ext.id,
                patientId,
                sessionId: sessaoCriada.id,
                sessionNumero: sessaoCriada.numeroSequencialPaciente!,
                alvoOrdinal: idx,
                goalId: meta.id,
                protocolId: protId,
                milestoneId: meta.milestoneId,
                protocolSlug: meta.protocolo
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "_"),
                dominioId: meta.dominioId,
                goalRef: meta.descricao,
                classificacaoOriginal: {
                  descricao: meta.descricao,
                  polaridade:
                    tipoEvolucao === "regressao" && sem >= 9
                      ? "negativa"
                      : "positiva",
                  nivel_ajuda: nivelAjuda,
                  resultado:
                    tipoEvolucao === "regressao" && sem >= 9
                      ? "erro"
                      : "acerto",
                },
                aprovadoPor: terapeutaUserId,
                aprovadoEm: new Date(dataSessao.getTime() + 1800000),
              })
              .onConflictDoNothing();
          }
        }
      }
    }

    // 7.5 MATERIALIZAÇÃO DOS SNAPSHOTS (Fase 4 · 4B)
    console.log(
      `  📊 Materializando snapshots de evolução clínica para ${pData.nome}...`,
    );
    await ownerSql`SELECT set_config('app.clinic_id', ${clinicId}, false), set_config('app.user_id', ${coordenador.id}, false), set_config('app.user_role', 'coordenador', false)`;
    await materializarSnapshot(
      drizzleMaterializarQueries(ownerDb),
      patientId,
      1,
    );

    // 8. Alertas de Supervisão
    for (const m of metasCadastradas) {
      if (m.temRegressao) {
        const protId = protocolosCadastrados[m.protocolo];
        if (protId) {
          await ownerDb
            .insert(alerta)
            .values({
              clinicId,
              patientId,
              tipo: "regressao",
              status: "reconhecido",
              chaveNatural: `regressao-${patientId}-${m.id}`,
              goalId: m.id,
              protocolId: protId,
              detalhe: {
                mensagem:
                  "Queda de 35% no percentual de acertos nas últimas 4 sessões.",
                taxaAnterior: "85%",
                taxaAtual: "50%",
                sessoesAnalisadas: 4,
              },
              criadoPor: coordenador.id,
              atualizadoPor: coordenador.id,
            })
            .onConflictDoNothing();
        }
      } else if (m.temEstagnacao) {
        const protId = protocolosCadastrados[m.protocolo];
        if (protId) {
          await ownerDb
            .insert(alerta)
            .values({
              clinicId,
              patientId,
              tipo: "estagnacao",
              status: "reconhecido",
              chaveNatural: `estagnacao-${patientId}-${m.id}`,
              goalId: m.id,
              protocolId: protId,
              detalhe: {
                mensagem:
                  "Meta ativa sem variação de ganho ou domínio há mais de 6 semanas.",
                semanasEstagnado: 6,
                sugestao:
                  "Avaliar ajuste no nível de ajuda ou fracionamento da meta.",
              },
              criadoPor: coordenador.id,
              atualizadoPor: coordenador.id,
            })
            .onConflictDoNothing();
        }
      }
    }
  }

  // 9. Alerta de risco clínico para teste da fila de risco
  console.log("🚨 Inserindo caso de alerta de risco clínico para teste...");
  const [sessaoRisco] = await ownerDb
    .select({ id: session.id, patientId: session.patientId })
    .from(session)
    .where(sql`${session.clinicId} = ${clinicId}`)
    .limit(1);

  if (sessaoRisco) {
    await ownerDb
      .insert(alertaRiscoClinico)
      .values({
        clinicId,
        patientId: sessaoRisco.patientId,
        sessionId: sessaoRisco.id,
        origem: "diario_sessao",
        categoria: "autolesao",
        severidade: "autolesao_recente",
        certeza: "explicito",
        prazoMinutos: 240,
        prazoReconhecimento: new Date(Date.now() + 4 * 3600000),
        trechoFonte:
          "Relato clínico de comportamento autolesivo leve em sessão com necessidade de suporte de autorregulação.",
        detalhe:
          "Acompanhamento preventivo de autorregulação emocional em sessão.",
      })
      .onConflictDoNothing();
  }

  await ownerSql.end();

  console.log("\n==================================================");
  console.log("🎉 SEED COMPLETO COM SNAPSHOTS CLINICOS CONCLUÍDO!");
  console.log("==================================================");
  console.log(`Conta Coordenador: Rômulo Sutil Corrêa (${targetEmail})`);
  console.log(`Clínica:           "${clinicNome}" (${clinicId})`);
  console.log(
    "Terapeutas:        7 multidisciplinares (senha: SenhaLocal123!)",
  );
  console.log("Pacientes:         6 cadastrados com perfis, PEI e diários");
  console.log(
    "Histórico:         3 meses de sessões + SNAPSHOTS MATERIALIZADOS",
  );
  console.log("==================================================\n");
}

main().catch(async (err) => {
  console.error("❌ Erro ao executar seed customizado:", err);
  process.exit(1);
});
