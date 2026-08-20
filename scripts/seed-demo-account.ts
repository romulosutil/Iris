/**
 * Seed Rico de 3 Meses para Conta Específica
 *
 * Popula:
 * - 5 Terapeutas (com credenciais prontas para login)
 * - 2 Recepção
 * - 6 Pacientes pediátricos (com consentimentos, perfil clínico e care team)
 * - Catálogo de Protocolos & Protocolos da Clínica
 * - Metas PEI (dominadas, ativas e em regressão/estagnação)
 * - Histórico de 3 meses de sessões (realizadas com notas, extrações e evidências)
 * - Sessões futuras na agenda
 * - Alertas clínicos de supervisão (regressão, estagnação, faltas)
 * - Alerta de risco clínico para teste da fila de risco
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

  // 3. Catálogo e Protocolos da Clínica
  console.log("📦 Garantindo catálogo de famílias e protocolos...");
  await ownerDb.execute(sql`
    INSERT INTO protocol_familia_catalogo (id, nome, descricao) VALUES
      ('aba_marcos_desenvolvimento', 'ABA — marcos de desenvolvimento', 'Protocolos de marcos (ex.: VB-MAPP, ABLLS-R)'),
      ('intervencao_naturalista', 'Intervenção naturalista', 'Modelos naturalistas (ex.: Denver/ESDM)'),
      ('fonoaudiologia', 'Fonoaudiologia', 'Protocolos de linguagem e comunicação'),
      ('terapia_ocupacional', 'Terapia ocupacional', 'Protocolos de integração sensorial e AVDs')
    ON CONFLICT (id) DO NOTHING;
  `);

  const protocolosDesejados = [
    {
      nome: "VB-MAPP",
      disciplina: "ABA",
      familia: "aba_marcos_desenvolvimento",
    },
    {
      nome: "Denver (ESDM)",
      disciplina: "Psicopedagogia",
      familia: "intervencao_naturalista",
    },
    {
      nome: "Perfil Sensorial 2",
      disciplina: "Terapia Ocupacional",
      familia: "terapia_ocupacional",
    },
    {
      nome: "PROC",
      disciplina: "Fonoaudiologia",
      familia: "fonoaudiologia",
    },
    {
      nome: "ABLLS-R",
      disciplina: "ABA",
      familia: "aba_marcos_desenvolvimento",
    },
    {
      nome: "PEDI",
      disciplina: "Terapia Ocupacional",
      familia: "terapia_ocupacional",
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
          taxonomiaAjuda: [],
        })
        .returning();
      if (novo) protocolosCadastrados[p.nome] = novo.id;
    }
  }

  // 4. Provisionamento dos 5 Terapeutas e 2 Recepção
  console.log("👩‍⚕️ Provisionando equipe clínica (5 terapeutas, 2 recepção)...");
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

  // 5. Definição e Cadastro dos 6 Pacientes
  console.log("🧒 Cadastrando 6 pacientes com históricos clínicos...");

  type MetaDef = {
    descricao: string;
    disciplina: string;
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
      medicacoes: "Não faz uso de medicação contínua",
      alergias: "Alergia a amendoim",
      convulsoes: "Sem histórico",
      contatosEmergencia: "Mãe: (11) 98765-4321 | Pai: (11) 98765-4322",
      protocolos: ["VB-MAPP", "PROC", "Perfil Sensorial 2"],
      terapeutas: [
        {
          email: "mariana.costa@iris.test",
          disciplina: "ABA",
          horas: "4.0",
        },
        {
          email: "bruno.fono@iris.test",
          disciplina: "Fonoaudiologia",
          horas: "2.0",
        },
        {
          email: "camila.to@iris.test",
          disciplina: "Terapia Ocupacional",
          horas: "2.0",
        },
      ],
      metas: [
        {
          descricao:
            "Emitir mandos vocais de 2 palavras para solicitar itens desejados (ex: 'quero água')",
          disciplina: "ABA",
          estado: "dominada" as const,
          criterio: { tipo: "acerto_consecutivo", valor: 85, sessoes: 3 },
        },
        {
          descricao:
            "Manter contato visual compartilhado por 5 segundos durante brincadeira",
          disciplina: "ABA",
          estado: "ativa" as const,
          criterio: { tipo: "frequencia", valor: 8, sessoes: 2 },
        },
        {
          descricao:
            "Tolera transição de atividades de alta preferência para baixa sem comportamento disruptivo",
          disciplina: "ABA",
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
      medicacoes: "Metilfenidato 10mg pela manhã",
      alergias: "Sem alergias conhecidas",
      convulsoes: "Sem histórico",
      contatosEmergencia: "Carla (Mãe): (11) 97654-3210",
      protocolos: ["Denver (ESDM)", "Perfil Sensorial 2"],
      terapeutas: [
        {
          email: "lucas.mendes@iris.test",
          disciplina: "Psicopedagogia",
          horas: "3.0",
        },
        {
          email: "camila.to@iris.test",
          disciplina: "Terapia Ocupacional",
          horas: "2.0",
        },
      ],
      metas: [
        {
          descricao: "Participar de jogo de regras simples respeitando turnos",
          disciplina: "Psicopedagogia",
          estado: "dominada" as const,
          criterio: { tipo: "turnos_completos", valor: 5 },
        },
        {
          descricao:
            "Realizar preensão em pinça tripé para escrita de letras do nome",
          disciplina: "Terapia Ocupacional",
          estado: "ativa" as const,
          criterio: { tipo: "precisao", valor: 80 },
        },
        {
          descricao:
            "Auto-regulação sensorial em ambientes com estímulo sonoro elevado",
          disciplina: "Terapia Ocupacional",
          estado: "ativa" as const,
          criterio: { tipo: "tempo_permanencia_min", valor: 15 },
          temEstagnacao: true,
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
      diagnostico:
        "F84.0 - Transtorno do Espectro Autista (Nível 3 de Suporte)",
      medicacoes: "Risperidona 0.25mg 2x ao dia",
      alergias: "Lactose",
      convulsoes: "1 episódio febril aos 18 meses",
      contatosEmergencia: "Marcos (Pai): (11) 96543-2109",
      protocolos: ["VB-MAPP", "PROC", "PEDI"],
      terapeutas: [
        {
          email: "mariana.costa@iris.test",
          disciplina: "ABA",
          horas: "6.0",
        },
        {
          email: "bruno.fono@iris.test",
          disciplina: "Fonoaudiologia",
          horas: "2.0",
        },
        {
          email: "lucas.mendes@iris.test",
          disciplina: "Psicopedagogia",
          horas: "2.0",
        },
      ],
      metas: [
        {
          descricao:
            "Ecoar sons vocálicos simples (A, E, I, O, U) sob comando imediato",
          disciplina: "Fonoaudiologia",
          estado: "dominada" as const,
          criterio: { tipo: "acertos", valor: 90 },
        },
        {
          descricao:
            "Seguir apontar para objetos reforçadores no campo de visão",
          disciplina: "ABA",
          estado: "ativa" as const,
          criterio: { tipo: "acertos", valor: 75 },
        },
        {
          descricao: "Rotina de desfralde diurno com aviso prévio",
          disciplina: "ABA",
          estado: "ativa" as const,
          criterio: { tipo: "sucesso_dias", valor: 7 },
          temRegressao: true,
        },
      ],
    },
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
      protocolos: ["PROC", "Denver (ESDM)"],
      terapeutas: [
        {
          email: "bruno.fono@iris.test",
          disciplina: "Fonoaudiologia",
          horas: "3.0",
        },
        {
          email: "fernanda.ribeiro@iris.test",
          disciplina: "ABA",
          horas: "2.0",
        },
      ],
      metas: [
        {
          descricao:
            "Produzir frases de 3 a 4 palavras estruturadas com sujeito e predicado",
          disciplina: "Fonoaudiologia",
          estado: "dominada" as const,
          criterio: { tipo: "acertos", valor: 85 },
        },
        {
          descricao:
            "Nomear 50 figuras de objetos cotidianos sem modelo verbal",
          disciplina: "Fonoaudiologia",
          estado: "ativa" as const,
          criterio: { tipo: "vocabulario_alvo", valor: 50 },
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
      diagnostico:
        "F84.0 - TEA Nível 2 + F82 - Transtorno do Desenvolvimento Motor (Dispraxia)",
      medicacoes: "Sem medicação contínua",
      alergias: "Picada de insetos",
      convulsoes: "Sem histórico",
      contatosEmergencia: "Felipe (Pai): (11) 94321-0987",
      protocolos: ["Perfil Sensorial 2", "PEDI", "ABLLS-R"],
      terapeutas: [
        {
          email: "camila.to@iris.test",
          disciplina: "Terapia Ocupacional",
          horas: "3.0",
        },
        {
          email: "fernanda.ribeiro@iris.test",
          disciplina: "ABA",
          horas: "3.0",
        },
      ],
      metas: [
        {
          descricao: "Alimentar-se com talheres sem derramamento excessivo",
          disciplina: "Terapia Ocupacional",
          estado: "dominada" as const,
          criterio: { tipo: "independencia", valor: 90 },
        },
        {
          descricao:
            "Seguir sequência de 3 comandos motores (ex: pegar bola, correr e colocar na cesta)",
          disciplina: "ABA",
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
      diagnostico:
        "F84.0 - Transtorno do Espectro Autista (Nível 1 de Suporte)",
      medicacoes: "Não utiliza",
      alergias: "Sem alergias",
      convulsoes: "Sem histórico",
      contatosEmergencia: "Patrícia (Mãe): (11) 93210-9876",
      protocolos: ["Denver (ESDM)", "PROC"],
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
            "Imitar movimentos motores amplos (bater palmas, levantar braços)",
          disciplina: "Psicopedagogia",
          estado: "dominada" as const,
          criterio: { tipo: "acertos", valor: 95 },
        },
        {
          descricao:
            "Articular fonemas oclusivos /p/, /b/, /t/, /d/ em sílabas simples",
          disciplina: "Fonoaudiologia",
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

    // Consentimentos LGPD (tratamento_dados_menor exige responsavelSignatario)
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

    // Metas PEI
    const metasCadastradas: {
      id: string;
      descricao: string;
      disciplina: string;
      estado: "dominada" | "ativa";
      temRegressao?: boolean;
      temEstagnacao?: boolean;
    }[] = [];

    for (const metaData of pData.metas) {
      const [metaExistente] = await ownerDb
        .select({ id: goal.id })
        .from(goal)
        .where(
          sql`${goal.patientId} = ${patientId} AND ${goal.descricao} = ${metaData.descricao}`,
        )
        .limit(1);

      let goalId: string;
      if (metaExistente) {
        goalId = metaExistente.id;
      } else {
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
        goalId = novaMeta.id;
      }

      metasCadastradas.push({
        id: goalId,
        descricao: metaData.descricao,
        disciplina: metaData.disciplina,
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

        const dataSessao = new Date(dataSemana.getTime() + 14 * 3600000); // 14:00
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
          textoDiario = `Sessão #${sessaoCriada.numeroSequencialPaciente} de ${t.disciplina}. Paciente chegou tranquilo acompanhado pela mãe. Realizado pareamento com brinquedos de causa e efeito. Excelente engajamento com reforçadores primários e sociais. Foram trabalhadas 10 tentativas para metas de comunicação e engajamento. Respondeu bem à ajuda física leve e modelo verbal.`;
        } else if (sem >= 4 && sem < 8) {
          textoDiario = `Sessão #${sessaoCriada.numeroSequencialPaciente} de ${t.disciplina}. Paciente demonstrou excelente prontidão para o trabalho em mesa. Apresentou independência crescente nas metas de ${t.disciplina}, atingindo 8 de 10 tentativas corretas sem necessidade de prompt físico. Demonstrou iniciativa de contato visual espontâneo durante o reforço lúdico.`;
        } else {
          const temRegressaoNoCaso = pData.metas.some((m) => m.temRegressao);
          if (temRegressaoNoCaso && sem >= 9) {
            tipoEvolucao = "regressao";
            textoDiario = `Sessão #${sessaoCriada.numeroSequencialPaciente} de ${t.disciplina}. Paciente apresentou desregulação ao entrar na sala, com choro intenso e resistência a trocar de atividade. Houve recusa em responder aos comandos habituais e necessidade de bloqueio de comportamento autolesivo leve (bater a mão na cabeça). Foi necessário reduzir a demanda e retornar a passos anteriores do programa para restabelecer o controle instrucional. Orientada a família quanto à consistência da rotina em casa.`;
          } else {
            textoDiario = `Sessão #${sessaoCriada.numeroSequencialPaciente} de ${t.disciplina}. Paciente muito participativo. Meta dominada com êxito em 90% das oportunidades. Generalizou a habilidade para novos estímulos e diferentes terapeutas. Iniciado novo passo do programa com entusiasmo.`;
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

        // Extração de IA (Camada 1 - IA sugere)
        const metaAlvo = metasCadastradas[0];
        if (metaAlvo) {
          const [ext] = await ownerDb
            .insert(extraction)
            .values({
              sessionId: sessaoCriada.id,
              clinicId,
              estado: "aprovada",
              subtipo: "evidencia",
              trechoFonte:
                tipoEvolucao === "regressao"
                  ? "Houve recusa em responder aos comandos habituais e necessidade de bloqueio de comportamento"
                  : "Apresentou independência crescente nas metas, atingindo 8 de 10 tentativas corretas",
              confianca: "alta",
              justificativaConfianca:
                "Evidência observada diretamente no relato clínico estruturado.",
              payload: {
                alvos: [
                  {
                    goalRef: metaAlvo.descricao,
                    resultado: tipoEvolucao === "regressao" ? "erro" : "acerto",
                    independencia: tipoEvolucao === "regressao" ? 30 : 85,
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
            // Evidência materializada (Camada 2 - Terapeuta aprovou)
            await ownerDb
              .insert(evidence)
              .values({
                extractionId: ext.id,
                patientId,
                sessionId: sessaoCriada.id,
                sessionNumero: sessaoCriada.numeroSequencialPaciente!,
                alvoOrdinal: 0,
                goalId: metaAlvo.id,
                protocolId:
                  protocolosCadastrados[pData.protocolos[0] || ""] || null,
                classificacaoOriginal: ext.payload,
                aprovadoPor: terapeutaUserId,
                aprovadoEm: new Date(dataSessao.getTime() + 1800000),
              })
              .onConflictDoNothing();
          }
        }
      }
    }

    // 8. Alertas de Supervisão (Regressão / Estagnação / Risco)
    for (const m of metasCadastradas) {
      if (m.temRegressao) {
        const protId = protocolosCadastrados[pData.protocolos[0] || ""];
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
                  "Queda de 35% no percentual de acertos nas últimas 4 sessões consecutivas.",
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
        const protId = protocolosCadastrados[pData.protocolos[0] || ""];
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

    // Alerta de Faltas Excessivas para 1 paciente (Theo)
    if (pData.chave === "theo") {
      await ownerDb
        .insert(alerta)
        .values({
          clinicId,
          patientId,
          tipo: "faltas_excessivas",
          status: "reconhecido",
          chaveNatural: `faltas-${patientId}`,
          detalhe: {
            mensagem:
              "Paciente acumulou 3 faltas consecutivas sem justificativa médica.",
            totalFaltasMes: 3,
            frequenciaPercentual: "62%",
          },
          criadoPor: coordenador.id,
          atualizadoPor: coordenador.id,
        })
        .onConflictDoNothing();
    }
  }

  // 9. Criar 1 Alerta de Risco Clínico para teste da esteira de risco
  console.log("🚨 Inserindo caso de alerta de risco clínico para teste...");
  const [pacienteTheo] = await ownerDb
    .select({ id: patient.id })
    .from(patient)
    .where(
      sql`${patient.clinicId} = ${clinicId} AND ${patient.nome} = 'Theo Henrique Souza'`,
    )
    .limit(1);

  if (pacienteTheo) {
    const [ultimaSessaoTheo] = await ownerDb
      .select({ id: session.id })
      .from(session)
      .where(sql`${session.patientId} = ${pacienteTheo.id}`)
      .orderBy(sql`${session.agendadaPara} DESC`)
      .limit(1);

    if (ultimaSessaoTheo) {
      await ownerDb
        .insert(alertaRiscoClinico)
        .values({
          clinicId,
          patientId: pacienteTheo.id,
          sessionId: ultimaSessaoTheo.id,
          origem: "diario_sessao",
          categoria: "autolesao",
          severidade: "autolesao_recente",
          certeza: "explicito",
          trechoFonte:
            "necessidade de bloqueio de comportamento autolesivo leve (bater a mão na cabeça)",
          detalhe:
            "Episódio de autolesão durante momento de frustração e transição de atividade. Terapeuta realizou bloqueio e regulação.",
          status: "aberto",
          prazoMinutos: 120,
          prazoReconhecimento: new Date(Date.now() + 120 * 60 * 1000),
        })
        .onConflictDoNothing();
    }
  }

  console.log("\n==================================================");
  console.log("🎉 SEED DE 3 MESES CONCLUÍDO COM SUCESSO!");
  console.log("==================================================");
  console.log(`Conta Coordenador: ${coordenador.name} (${targetEmail})`);
  console.log(`Clínica:           "${clinicNome}" (${clinicId})`);
  console.log(`Terapeutas:        5 cadastrados (senha: ${senhaPadrao})`);
  console.log(`Recepção:          2 cadastradas (senha: ${senhaPadrao})`);
  console.log(`Pacientes:         6 cadastrados com perfis, PEI e diários`);
  console.log(`Histórico:         3 meses de sessões, evidências e alertas`);
  console.log("==================================================\n");

  await ownerSql.end();
}

main().catch((err) => {
  console.error("❌ Erro ao executar seed customizado:", err);
  process.exit(1);
});
