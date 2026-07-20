/**
 * Seed de DEMONSTRAÇÃO ROBUSTO (Fase 5).
 * Simula 30 dias de operação de uma clínica com:
 *   - 3 coordenadores
 *   - 1 recepção (admin_recepcao)
 *   - 20 terapeutas
 *   - 40 crianças (20 no turno da manhã, 20 no turno da tarde)
 *   - Agendamentos recorrentes estruturados
 *   - Sessões materializadas (passadas, hoje e futuras)
 *   - Notas e extrações realistas de ABA
 *   - Sinais de supervisão (faltas excessivas, estagnação e regressão)
 *
 * Idempotente: limpa dados da clínica demo antes de reinserir.
 * Roda com: pnpm seed:demo
 */
import { eq, inArray } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import crypto from "crypto";
import { authDb, authSql } from "@/db/client";
import * as schema from "@/db/schema";
import { provisionUser } from "@/auth/provisioning";

// Import individual table objects for direct usage
const {
  alerta,
  auditLog,
  careTeamMembership,
  clinic,
  extraction,
  goal,
  janelaTrabalho,
  agendamentoRecorrente,
  patient,
  patientAlvoDisciplina,
  patientClinicalProfile,
  patientProtocol,
  protocol,
  session,
  sessionNote,
  sessionSnapshot,
  evidence,
  milestoneCandidacy,
} = schema;

const FUSO_CLINICA = "America/Sao_Paulo";
const FUSO_CLINICA_OFFSET = "-03:00";
const fmtFuso = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_CLINICA,
});

const NOME_CLINICA = "Clínica Demo Iris";
const COORD_EMAIL = "coordenador.demo@iris.test";
const COORD_SENHA = "Senha Demo 123";
const TERAPEUTA_EMAIL = "terapeuta.demo@iris.test";
const TERAPEUTA_SENHA = "Senha Demo 123";
const DISCIPLINA = "aba";
const FAMILIA = "aba_marcos_desenvolvimento";

const PACIENTES = [
  "Ana Beatriz (demo)",      // 0: Principal/E2E
  "Bruno Carvalho (demo)",   // 1: Faltas excessivas (4 faltas)
  "Clara Dias (demo)",       // 2: Estagnação
  "Davi Esteves (demo)",     // 3: Regressão
  "Enzo Santos (demo)",
  "Felipe Oliveira (demo)",
  "Gabriela Costa (demo)",
  "Heitor Rodrigues (demo)",
  "Isabela Almeida (demo)",
  "João Lucas (demo)",
  "Kauan Lima (demo)",
  "Lara Martins (demo)",
  "Manuela Rocha (demo)",
  "Nicolas Gomes (demo)",
  "Olivia Sousa (demo)",
  "Pedro Henrique (demo)",
  "Rafaela Vieira (demo)",
  "Samuel Silva (demo)",
  "Valentina Barbosa (demo)",
  "Yasmin Cardoso (demo)",
  "Arthur Souza (demo)",
  "Beatriz Ribeiro (demo)",
  "Daniel Fernandes (demo)",
  "Eduarda Teixeira (demo)",
  "Gabriel Nascimento (demo)",
  "Helena Cunha (demo)",
  "Igor Carvalho (demo)",
  "Julia Pinto (demo)",
  "Lucas Castro (demo)",
  "Mariana Costa (demo)",
  "Matheus Moreira (demo)",
  "Sophia Dias (demo)",
  "Thiago Rocha (demo)",
  "Alice Alves (demo)",
  "Bernardo Ramos (demo)",
  "Cecilia Melo (demo)",
  "Gustavo Freire (demo)",
  "Laura Lima (demo)",
  "Lorenzo Santos (demo)",
  "Melissa Gomes (demo)"
];

const NOTAS_POOL = [
  {
    captura: "Pareamento de objetos idênticos com independência. Foco mantido.",
    consolidada: "Paciente realizou atividade de pareamento de blocos de montar coloridos com total independência. Demonstrou excelente atenção sustentada e permaneceu sentado durante toda a tarefa.",
    polaridade: "positiva" as const,
    subtipo: "evidencia" as const,
    trecho: "pareamento de blocos de montar coloridos com total independência"
  },
  {
    captura: "Dificuldade em manter contato visual no treino de mando do brinquedo.",
    consolidada: "Durante o treino de mando para solicitar o carrinho de bombeiros, o paciente evitou o contato visual direto. Foi necessária dica física leve para direcionar o olhar antes de entregar o item.",
    polaridade: "negativa" as const,
    subtipo: "evidencia" as const,
    trecho: "paciente evitou o contato visual direto"
  },
  {
    captura: "Vocalizou som aproximado de 'água' espontaneamente.",
    consolidada: "Paciente vocalizou de forma aproximada o som 'á-a' ao apontar para o filtro de água. O pedido foi atendido prontamente, reforçando a comunicação funcional espontânea.",
    polaridade: "positiva" as const,
    subtipo: "evidencia" as const,
    trecho: "vocalizou de forma aproximada o som 'á-a'"
  },
  {
    captura: "Montagem de torre de 5 blocos com dica gestual.",
    consolidada: "Realizou atividade de empilhamento de blocos. Conseguiu montar uma torre com 5 blocos após dica gestual do aplicador (apontar para o topo da torre).",
    polaridade: "positiva" as const,
    subtipo: "evidencia" as const,
    trecho: "conseguiu montar uma torre com 5 blocos após dica gestual"
  },
  {
    captura: "Gritos e choro após fim do tempo livre com tablet.",
    consolidada: "Ao sinalizar o término do tempo livre e retirar o tablet, o paciente apresentou comportamento disruptivo de gritar e chorar. Foi aplicado procedimento de extinção e redirecionamento.",
    polaridade: "negativa" as const,
    subtipo: "evidencia" as const,
    trecho: "apresentou comportamento disruptivo de gritar e chorar"
  },
  {
    captura: "Seguiu instrução de dois passos ('pegue a bola e coloque na caixa').",
    consolidada: "Paciente respondeu com sucesso à instrução receptiva de dois passos: 'pegue a bola vermelha e coloque dentro da caixa azul'. Demonstrou boa compreensão de comandos verbais complexos.",
    polaridade: "positiva" as const,
    subtipo: "evidencia" as const,
    trecho: "respondeu com sucesso à instrução receptiva de dois passos"
  },
  {
    captura: "Fez contato visual espontâneo ao ouvir o próprio nome.",
    consolidada: "Ao ser chamado pelo nome no início da sessão, o paciente fez contato visual de forma espontânea por aproximadamente 3 segundos. Resposta imediata sem necessidade de dicas adicionais.",
    polaridade: "positiva" as const,
    subtipo: "evidencia" as const,
    trecho: "fez contato visual de forma espontânea por aproximadamente 3 segundos"
  },
  {
    captura: "Demonstrou preferência pelo dinossauro de pelúcia.",
    consolidada: "Identificada forte preferência pelo dinossauro de pelúcia verde hoje. O item foi utilizado como reforçador principal nas tarefas de imitação motora grossa.",
    polaridade: "positiva" as const,
    subtipo: "preferencia_reforcador" as const,
    trecho: "forte preferência pelo dinossauro de pelúcia verde"
  },
  {
    captura: "Recusa em sentar e fuga da mesa durante treino de imitação.",
    consolidada: "Durante o treino de imitação de movimentos motores finos, o paciente recusou-se a sentar e tentou fuga da mesa por três vezes. Foi redirecionado com dica física e concluímos a tarefa.",
    polaridade: "negativa" as const,
    subtipo: "evidencia" as const,
    trecho: "recusou-se a sentar e tentou fuga da mesa por três vezes"
  },
  {
    captura: "Apontou para o biscoito de forma independente para pedir.",
    consolidada: "Paciente utilizou o gesto de apontar de forma independente direcionado ao pote de biscoitos na prateleira para solicitar o alimento. O mando foi atendido imediatamente.",
    polaridade: "positiva" as const,
    subtipo: "evidencia" as const,
    trecho: "apontou de forma independente direcionado ao pote de biscoitos"
  }
];

async function main() {
  const migrationUrl = process.env.MIGRATION_DATABASE_URL;
  if (!migrationUrl) {
    throw new Error("MIGRATION_DATABASE_URL não está definida nas variáveis de ambiente.");
  }

  console.log("Iniciando conexão de owner (bypassa RLS) para o seed...");
  const ownerSql = postgres(migrationUrl, { max: 5 });
  const ownerDb = drizzle(ownerSql, { schema, casing: "snake_case" });

  // 1) Clínica demo (garante existência e is_demo = true).
  let c = (
    await authDb
      .select()
      .from(clinic)
      .where(eq(clinic.nome, NOME_CLINICA))
      .limit(1)
  )[0];

  if (!c) {
    c = (
      await authDb
        .insert(clinic)
        .values({
          nome: NOME_CLINICA,
          isDemo: true,
          faltasLimiar: 3,
          faltasJanelaSemanas: 4,
        })
        .returning()
    )[0]!;
  } else {
    // Garante configurações do demo
    await authDb
      .update(clinic)
      .set({ isDemo: true, faltasLimiar: 3, faltasJanelaSemanas: 4 })
      .where(eq(clinic.id, c.id));
  }

  console.log(`Clínica "${NOME_CLINICA}" (${c.id}) identificada. Iniciando limpeza de dados demo antigos...`);

  // 2) Deletions to clean up old demo data in the clinic (making it idempotent)
  await ownerDb.delete(alerta).where(eq(alerta.clinicId, c.id));
  await ownerDb.delete(auditLog).where(eq(auditLog.clinicId, c.id));
  await ownerDb.delete(extraction).where(eq(extraction.clinicId, c.id));
  await ownerDb.delete(sessionNote).where(eq(sessionNote.clinicId, c.id));
  await ownerDb.delete(session).where(eq(session.clinicId, c.id));
  await ownerDb.delete(agendamentoRecorrente).where(eq(agendamentoRecorrente.clinicId, c.id));
  await ownerDb.delete(janelaTrabalho).where(eq(janelaTrabalho.clinicId, c.id));

  const oldPatientIds = (
    await ownerDb
      .select({ id: patient.id })
      .from(patient)
      .where(eq(patient.clinicId, c.id))
  ).map((p) => p.id);

  if (oldPatientIds.length > 0) {
    await ownerDb.delete(sessionSnapshot).where(inArray(sessionSnapshot.patientId, oldPatientIds));
    await ownerDb.delete(milestoneCandidacy).where(inArray(milestoneCandidacy.patientId, oldPatientIds));
    await ownerDb.delete(careTeamMembership).where(inArray(careTeamMembership.patientId, oldPatientIds));
    await ownerDb.delete(patientProtocol).where(inArray(patientProtocol.patientId, oldPatientIds));
    await ownerDb.delete(patientClinicalProfile).where(inArray(patientClinicalProfile.patientId, oldPatientIds));
  }

  await ownerDb.delete(goal).where(eq(goal.clinicId, c.id));
  await ownerDb.delete(patientAlvoDisciplina).where(eq(patientAlvoDisciplina.clinicId, c.id));
  await ownerDb.delete(patient).where(eq(patient.clinicId, c.id));
  await ownerDb.delete(protocol).where(eq(protocol.clinicId, c.id));

  console.log("Limpeza concluída. Provisionando usuários...");

  // 3) Provisionamento de Usuários
  // 3 Coordenadores
  const coordEmails = [COORD_EMAIL, "coordenador2.demo@iris.test", "coordenador3.demo@iris.test"];
  const coordIds: string[] = [];
  for (let i = 0; i < coordEmails.length; i++) {
    const email = coordEmails[i]!;
    const name = i === 0 ? "Coordenador(a) Principal Demo" : `Coordenador(a) Auxiliar ${i} Demo`;
    const { userId } = await provisionUser({
      email,
      nome: name,
      senha: COORD_SENHA,
      clinicId: c.id,
      papel: "coordenador",
    });
    coordIds.push(userId);
  }
  const mainCoordinatorId = coordIds[0]!;

  // 1 Recepção
  const { userId: recepcaoId } = await provisionUser({
    email: "recepcao.demo@iris.test",
    nome: "Recepção Demo",
    senha: COORD_SENHA,
    clinicId: c.id,
    papel: "admin_recepcao",
  });

  // 20 Terapeutas
  const therapistEmails = [TERAPEUTA_EMAIL];
  for (let i = 2; i <= 20; i++) {
    therapistEmails.push(`terapeuta${i}.demo@iris.test`);
  }
  const therapistIds: string[] = [];
  for (let i = 0; i < therapistEmails.length; i++) {
    const email = therapistEmails[i]!;
    const name = i === 0 ? "Terapeuta Principal Demo" : `Terapeuta ${i + 1} Demo`;
    const { userId } = await provisionUser({
      email,
      nome: name,
      senha: TERAPEUTA_SENHA,
      clinicId: c.id,
      papel: "terapeuta",
    });
    therapistIds.push(userId);
  }

  console.log(`Usuários provisionados. Coordenadores: ${coordIds.length}, Recepção: 1, Terapeutas: ${therapistIds.length}.`);

  // 4) Janela de Trabalho dos Terapeutas (Mon-Fri, 08h-12h e 13h-17h)
  const janelas: any[] = [];
  for (const tId of therapistIds) {
    for (let dia = 1; dia <= 5; dia++) {
      janelas.push({
        clinicId: c.id,
        terapeutaId: tId,
        diaSemana: dia,
        horaInicio: "08:00:00",
        horaFim: "12:00:00",
      });
      janelas.push({
        clinicId: c.id,
        terapeutaId: tId,
        diaSemana: dia,
        horaInicio: "13:00:00",
        horaFim: "17:00:00",
      });
    }
  }
  await ownerDb.insert(janelaTrabalho).values(janelas);
  console.log("Janelas de trabalho dos terapeutas cadastradas.");

  // 5) Protocolos
  const pMarcosId = (
    await ownerDb.insert(protocol).values({
      clinicId: c.id,
      nome: "ABA — Marcos (demo)",
      disciplina: DISCIPLINA,
      familia: FAMILIA,
    }).returning({ id: protocol.id })
  )[0]!.id;

  const pGeralId = (
    await ownerDb.insert(protocol).values({
      clinicId: c.id,
      nome: "ABA — Geral (demo)",
      disciplina: DISCIPLINA,
      familia: FAMILIA,
    }).returning({ id: protocol.id })
  )[0]!.id;

  console.log("Protocolos criados.");

  // 6) Pacientes (40 crianças)
  const patientsToInsert = PACIENTES.map((nome, index) => {
    const ageYears = 4 + (index % 5);
    const nascimento = new Date();
    nascimento.setFullYear(nascimento.getFullYear() - ageYears);
    nascimento.setMonth(index % 12);
    nascimento.setDate((index % 28) + 1);

    return {
      clinicId: c.id,
      nome,
      nascimento: fmtFuso.format(nascimento),
      responsavelContato: `Responsável de ${nome.split(" ")[0]}`,
      escola: index % 2 === 0 ? "Escola Municipal Pequeno Príncipe" : "Colégio Saber",
      convenio: index % 3 === 0 ? "Unimed" : index % 3 === 1 ? "Bradesco" : "SulAmérica",
    };
  });

  const insertedPatients = await ownerDb.insert(patient).values(patientsToInsert).returning();
  console.log(`${insertedPatients.length} pacientes inseridos.`);

  // Cadastra protocolos, alvos, equipes e metas em lote
  const patientProtocols: any[] = [];
  const patientAlvos: any[] = [];
  const careTeamMemberships: any[] = [];
  const goalsToInsert: any[] = [];

  for (let i = 0; i < insertedPatients.length; i++) {
    const p = insertedPatients[i]!;
    const pId = p.id;
    const protoId = i === 0 ? pMarcosId : pGeralId;
    const terapeutaId = therapistIds[i % 20]!;

    patientProtocols.push({
      patientId: pId,
      protocolId: protoId,
      ativadoPor: mainCoordinatorId,
    });

    patientAlvos.push({
      clinicId: c.id,
      patientId: pId,
      disciplina: DISCIPLINA,
      horasAlvoSemana: "10.0",
      vigenciaInicio: "2025-01-01",
    });

    careTeamMemberships.push({
      patientId: pId,
      userId: terapeutaId,
      disciplina: DISCIPLINA,
      papelNaEquipe: "terapeuta_referencia",
      vigenciaInicio: "2025-01-01",
    });

    // 2 metas por paciente
    goalsToInsert.push({
      patientId: pId,
      clinicId: c.id,
      descricao: `Desenvolver imitação motora e seguimento de instruções (${p.nome.split(" ")[0]})`,
      disciplina: DISCIPLINA,
      estado: "ativa",
      criterioDominio: { tipo: "porcentagem", valor: 80 },
      criadoPor: mainCoordinatorId,
    });

    goalsToInsert.push({
      patientId: pId,
      clinicId: c.id,
      descricao: `Expressar necessidades através de mandos verbais (${p.nome.split(" ")[0]})`,
      disciplina: DISCIPLINA,
      estado: "ativa",
      criterioDominio: { tipo: "porcentagem", valor: 80 },
      criadoPor: mainCoordinatorId,
    });
  }

  await ownerDb.insert(patientProtocol).values(patientProtocols);
  await ownerDb.insert(patientAlvoDisciplina).values(patientAlvos);
  await ownerDb.insert(careTeamMembership).values(careTeamMemberships);
  const insertedGoals = await ownerDb.insert(goal).values(goalsToInsert).returning();
  console.log("Mapeamentos clínicos (protocolos, equipes, alvos, metas) criados.");

  // 7) Agendamentos Recorrentes (Standing Schedules)
  const schedules: any[] = [];
  for (let i = 0; i < insertedPatients.length; i++) {
    const pId = insertedPatients[i]!.id;
    let terapeutaId: string;
    let horaInicio: string;

    if (i < 20) {
      // Turno da Manhã (0-19)
      if (i < 10) {
        terapeutaId = therapistIds[i]!;
        horaInicio = "08:30:00";
      } else {
        terapeutaId = therapistIds[i]!;
        horaInicio = "10:30:00";
      }
    } else {
      // Turno da Tarde (20-39)
      if (i < 30) {
        terapeutaId = therapistIds[i - 20]!; // terapeutas 0-9
        horaInicio = "13:30:00";
      } else {
        terapeutaId = therapistIds[i - 20]!; // terapeutas 10-19
        horaInicio = "15:30:00";
      }
    }

    // Regras recorrentes Mon-Fri (1 a 5)
    for (let dia = 1; dia <= 5; dia++) {
      schedules.push({
        clinicId: c.id,
        patientId: pId,
        terapeutaId,
        disciplina: DISCIPLINA,
        diaSemana: dia,
        horaInicio,
        duracaoMin: 90,
        vigenciaInicio: "2025-01-01",
        status: "ativo",
      });
    }
  }

  const insertedSchedules = await ownerDb.insert(agendamentoRecorrente).values(schedules).returning();
  console.log(`${insertedSchedules.length} agendamentos recorrentes (regrasstanding) criados.`);

  // 8) Materialização de Sessões (Janela de 30 dias centrada no hoje)
  const hojeStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_CLINICA,
  }).format(new Date());

  const todayDate = new Date(`${hojeStr}T00:00:00`);
  const dateList: { dateStr: string; dayIndex: number; isPast: boolean; isToday: boolean }[] = [];

  for (let i = -15; i <= 14; i++) {
    const d = new Date(todayDate.getTime() + i * 24 * 60 * 60 * 1000);
    const dateStr = fmtFuso.format(d);
    const dayOfWeek = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      dateList.push({
        dateStr,
        dayIndex: i,
        isPast: i < 0,
        isToday: i === 0,
      });
    }
  }

  console.log(`Janela de materialização: ${dateList[0]!.dateStr} a ${dateList[dateList.length - 1]!.dateStr} (${dateList.length} dias úteis).`);

  const patientMap = new Map(insertedPatients.map((p, idx) => [p.nome, { id: p.id, index: idx }]));
  const getPatientIndex = (name: string) => patientMap.get(name)!.index;

  const sessionValues: any[] = [];
  const patientSessionCounter = new Map<string, number>();

  for (const dt of dateList) {
    const dObj = new Date(`${dt.dateStr}T00:00:00`);
    const dayOfWeek = dObj.getDay();

    // Filtra regras recorrentes para o dia da semana correspondente
    const matchingSchedules = insertedSchedules.filter((s) => s.diaSemana === dayOfWeek);

    for (const sched of matchingSchedules) {
      const patientNome = insertedPatients.find((p) => p.id === sched.patientId)!.nome;
      const pIdx = getPatientIndex(patientNome);
      const isTherapist1 = sched.terapeutaId === therapistIds[0]!;

      let estado: "agendada" | "realizada" | "falta_paciente" | "falta_terapeuta" | "cancelada" = "agendada";
      let checkInEm: Date | null = null;
      let justificada: boolean | null = null;

      if (dt.isPast) {
        if (pIdx === 1) {
          // Paciente 2 (Bruno Carvalho): Força exatamente 4 faltas para alertar faltas excessivas.
          // Vamos colocar faltas nos primeiros 4 dias úteis passados.
          if (dt.dayIndex === -15 || dt.dayIndex === -14 || dt.dayIndex === -13 || dt.dayIndex === -12) {
            estado = "falta_paciente";
            justificada = false;
          } else {
            estado = "realizada";
          }
        } else {
          // Distribuição determinística baseada em hash
          const val = Math.abs(pIdx * 13 + dt.dayIndex * 19) % 100;
          if (val < 85) {
            estado = "realizada";
          } else if (val < 93) {
            estado = "falta_paciente";
            justificada = val % 2 === 0;
          } else if (val < 97) {
            estado = "falta_terapeuta";
            justificada = true;
          } else {
            estado = "cancelada";
          }
        }
      } else if (dt.isToday) {
        // Hoje (E2E requer que a sessão do terapeuta demo com a Ana Beatriz esteja como 'agendada')
        estado = "agendada";
      } else {
        // Futuro
        estado = "agendada";
      }

      const agendadaPara = new Date(`${dt.dateStr}T${sched.horaInicio}${FUSO_CLINICA_OFFSET}`);

      if (estado === "realizada") {
        checkInEm = new Date(agendadaPara.getTime() - 5 * 60 * 1000); // 5 min antes
      }

      let numeroSequencialPaciente: number | null = null;
      if (estado === "realizada") {
        const currentCount = (patientSessionCounter.get(sched.patientId) ?? 0) + 1;
        patientSessionCounter.set(sched.patientId, currentCount);
        numeroSequencialPaciente = currentCount;
      }

      sessionValues.push({
        clinicId: c.id,
        patientId: sched.patientId,
        terapeutaId: sched.terapeutaId,
        agendadaPara,
        estado,
        checkInEm,
        numeroSequencialPaciente,
        disciplina: sched.disciplina,
        duracaoMin: sched.duracaoMin,
        justificada,
        modalidade: "presencial",
        tipo: "terapia",
        recorrenteId: sched.id, // associa com a regra
      });
    }
  }

  const insertedSessions = await ownerDb.insert(session).values(sessionValues).returning();
  console.log(`${insertedSessions.length} sessões materializadas.`);

  // 9) Notas Clínicas, Extrações e Evidências para Sessões Realizadas
  const notesValues: any[] = [];
  const extractionsValues: any[] = [];
  const evidenceValues: any[] = [];

  const patientGoalsMap = new Map<string, string[]>();
  for (const g of insertedGoals) {
    const list = patientGoalsMap.get(g.patientId) ?? [];
    list.push(g.id);
    patientGoalsMap.set(g.patientId, list);
  }

  const patientProtocolMap = new Map<string, string>();
  for (let i = 0; i < insertedPatients.length; i++) {
    const p = insertedPatients[i]!;
    const protoId = i === 0 ? pMarcosId : pGeralId;
    patientProtocolMap.set(p.id, protoId);
  }

  const realizedSessions = insertedSessions.filter((s) => s.estado === "realizada");

  for (let sIdx = 0; sIdx < realizedSessions.length; sIdx++) {
    const sess = realizedSessions[sIdx]!;
    const patientNome = insertedPatients.find((p) => p.id === sess.patientId)!.nome;
    const pIdx = getPatientIndex(patientNome);
    const noteTemplate = NOTAS_POOL[(pIdx + sIdx) % NOTAS_POOL.length]!;

    // Captura Rápida
    notesValues.push({
      sessionId: sess.id,
      clinicId: c.id,
      tipo: "captura_rapida",
      texto: noteTemplate.captura,
      autorId: sess.terapeutaId,
    });

    // Nota Consolidada
    notesValues.push({
      sessionId: sess.id,
      clinicId: c.id,
      tipo: "nota_consolidada",
      texto: noteTemplate.consolidada,
      autorId: sess.terapeutaId,
    });

    // Extração Aprovada
    const pGoals = patientGoalsMap.get(sess.patientId) ?? [];
    const targetGoalId = pGoals[sIdx % pGoals.length] ?? null;

    const extractionId = crypto.randomUUID();
    const extractionPayload = {
      alvos: targetGoalId ? [{ goal_id: targetGoalId }] : [],
      polaridade: noteTemplate.polaridade,
    };

    extractionsValues.push({
      id: extractionId,
      sessionId: sess.id,
      clinicId: c.id,
      estado: "aprovada",
      subtipo: noteTemplate.subtipo,
      trechoFonte: noteTemplate.trecho,
      confianca: "alta",
      justificativaConfianca: "Sugestão de demonstração aprovada automaticamente.",
      inconsistenteComHistorico: false,
      payload: extractionPayload,
      revisadoPor: sess.terapeutaId,
      revisadoEm: new Date(sess.agendadaPara.getTime() + 60 * 60 * 1000),
    });

    // Evidência
    evidenceValues.push({
      id: crypto.randomUUID(),
      extractionId: extractionId,
      patientId: sess.patientId,
      sessionId: sess.id,
      sessionNumero: sess.numeroSequencialPaciente!,
      alvoOrdinal: 0,
      protocolSlug: "aba_marcos_desenvolvimento",
      dominioId: "mando",
      goalRef: "meta_1",
      protocolId: patientProtocolMap.get(sess.patientId)!,
      goalId: targetGoalId,
      milestoneId: null,
      classificacaoOriginal: extractionPayload,
      aprovadoPor: sess.terapeutaId,
      aprovadoEm: new Date(sess.agendadaPara.getTime() + 60 * 60 * 1000),
    });
  }

  if (notesValues.length > 0) {
    await ownerDb.insert(sessionNote).values(notesValues);
  }
  if (extractionsValues.length > 0) {
    await ownerDb.insert(extraction).values(extractionsValues);
  }
  if (evidenceValues.length > 0) {
    await ownerDb.insert(evidence).values(evidenceValues);
  }
  console.log(`${realizedSessions.length} sessões preenchidas com notas, extrações e evidências históricas.`);

  // 10) Snapshots de Supervisão e Alertas
  // Paciente 3 (Clara Dias): Estagnação
  const claraId = insertedPatients.find((p) => p.nome === "Clara Dias (demo)")!.id;
  const claraGoalId = (patientGoalsMap.get(claraId) ?? [])[0]!;

  // Paciente 4 (Davi Esteves): Regressão
  const daviId = insertedPatients.find((p) => p.nome === "Davi Esteves (demo)")!.id;
  const daviGoalId = (patientGoalsMap.get(daviId) ?? [])[0]!;

  const snapshots: any[] = [];
  snapshots.push({
    patientId: claraId,
    sessionNumero: 10,
    repertorioState: {},
    segmentacao: {
      [claraGoalId]: {
        [pGeralId]: {
          tipo_estrutura: "marco_simples",
          metrica: "Dica gestual",
          rotulo: "estagnacao",
        }
      }
    },
  });

  snapshots.push({
    patientId: daviId,
    sessionNumero: 10,
    repertorioState: {},
    segmentacao: {
      [daviGoalId]: {
        [pGeralId]: {
          tipo_estrutura: "marco_simples",
          metrica: "Dica física",
          rotulo: "regressao",
        }
      }
    },
  });

  await ownerDb.insert(sessionSnapshot).values(snapshots);

  // Alerta Reconhecido para Clara Dias (Estagnação)
  const claraChaveNatural = `estagnacao:${claraId}:${claraGoalId}:${pGeralId}`;
  await ownerDb.insert(alerta).values({
    clinicId: c.id,
    patientId: claraId,
    tipo: "estagnacao",
    status: "reconhecido",
    chaveNatural: claraChaveNatural,
    goalId: claraGoalId,
    protocolId: pGeralId,
    detalhe: {
      metrica: "Dica gestual",
      tipoEstrutura: "marco_simples",
      sessionNumero: 10,
    },
    nota: "Supervisão agendada com terapeuta para ajustar dicas.",
    criadoPor: mainCoordinatorId,
    atualizadoPor: mainCoordinatorId,
  });

  // 11) Logs de Auditoria LGPD
  await ownerDb.insert(auditLog).values([
    {
      clinicId: c.id,
      atorId: mainCoordinatorId,
      acao: "aprovar_revisao",
      entidade: "evidence",
      entidadeId: crypto.randomUUID(),
      patientId: claraId,
      detalhe: { motivo: "Revisão de histórico clínica" },
    },
    {
      clinicId: c.id,
      atorId: mainCoordinatorId,
      acao: "reconhecer_alerta",
      entidade: "alerta",
      entidadeId: crypto.randomUUID(),
      patientId: claraId,
      detalhe: { tipo: "estagnacao" },
    }
  ]);

  console.log("Snapshots, alertas e logs de auditoria inseridos.");

  console.log(
    [
      `--------------------------------------------------`,
      `Clínica demo "${NOME_CLINICA}" (${c.id}) semeada!`,
      `  - Coordenadores:`,
      `      ${COORD_EMAIL}`,
      `      coordenador2.demo@iris.test`,
      `      coordenador3.demo@iris.test`,
      `  - Recepcionista: recepcao.demo@iris.test`,
      `  - Terapeutas: ${TERAPEUTA_EMAIL} + 19 outros (terapeuta2..20.demo@iris.test)`,
      `  - Clientes/Crianças: ${insertedPatients.length} divididos nos turnos Manhã e Tarde`,
      `  - Total de Sessões no Mês: ${insertedSessions.length} (${realizedSessions.length} realizadas)`,
      `  - Alertas triggados no painel /supervisao:`,
      `      - Faltas excessivas (Novo): Bruno Carvalho (demo)`,
      `      - Estagnação (Reconhecido): Clara Dias (demo)`,
      `      - Regressão (Novo): Davi Esteves (demo)`,
      `--------------------------------------------------`,
    ].join("\n"),
  );

  console.log("Encerrando pools de conexão...");
  await Promise.all([authSql.end(), ownerSql.end()]);
  console.log("Seed concluído com sucesso!");
}

main().catch((e) => {
  console.error("Erro fatal no seed:", e);
  process.exit(1);
});
