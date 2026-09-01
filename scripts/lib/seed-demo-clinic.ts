/**
 * Seed da Clínica Demo (E2E)
 *
 * Cria uma clínica `is_demo = true` com terapeuta, paciente e protocolo
 * ativo, e uma sessão de hoje — o cenário que `e2e/diario-demo.spec.ts` e
 * `e2e/revisao.spec.ts` exercitam. `is_demo = true` faz `resolveProvider`
 * (`src/lib/extraction/provider.ts`) usar o `DemoStubProvider`, que gera
 * sugestões determinísticas a partir das frases da nota consolidada, sem LLM.
 *
 * Não trunca nada — quem chama já limpou o banco antes. Idempotente por
 * `ON CONFLICT DO NOTHING` / delete-then-insert onde não há UNIQUE natural.
 */
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type postgres from "postgres";
import * as schema from "@/db/schema";
import {
  clinic,
  protocol,
  patient,
  consent,
  patientProtocol,
  session,
} from "@/db/schema";
import { provisionUser } from "@/auth/provisioning";
import { FUSO_CLINICA, FUSO_CLINICA_OFFSET } from "@/app/(app)/agenda/fuso";

export const TERAPEUTA_DEMO_EMAIL = "terapeuta.demo@iris.test";
export const TERAPEUTA_DEMO_SENHA = "Senha Demo 123";

export async function seedDemoClinic(
  ownerDb: PostgresJsDatabase<typeof schema>,
  ownerSql: ReturnType<typeof postgres>,
): Promise<void> {
  console.log('🏥 Criando clínica demo ("is_demo = true")...');
  const [demoClinic] = await ownerDb
    .insert(clinic)
    .values({ nome: "Clínica Demo E2E", isDemo: true })
    .returning();
  if (!demoClinic) throw new Error("Falha ao criar clínica demo.");
  const clinicId = demoClinic.id;

  console.log("📦 Cadastrando catálogo e protocolo da clínica demo...");
  await ownerDb.execute(sql`
    INSERT INTO protocol_familia_catalogo (id, nome, descricao) VALUES
      ('aba_marcos_desenvolvimento', 'ABA — marcos de desenvolvimento', 'Protocolos de marcos (ex.: VB-MAPP, ABLLS-R)')
    ON CONFLICT (id) DO NOTHING;
  `);
  const [protocoloDemo] = await ownerDb
    .insert(protocol)
    .values({
      clinicId,
      nome: "VB-MAPP",
      disciplina: "ABA",
      familia: "aba_marcos_desenvolvimento",
    })
    .returning();
  if (!protocoloDemo) throw new Error("Falha ao criar protocolo demo.");

  console.log(`👤 Provisionando coordenador e terapeuta demo...`);
  const { userId: coordenadorId } = await provisionUser({
    email: "coordenador.demo@iris.test",
    nome: "Coordenador Demo",
    senha: "Senha Demo 123",
    clinicId,
    papel: "coordenador",
    emailVerificado: true,
    db: ownerDb,
  });
  const { userId: terapeutaId } = await provisionUser({
    email: TERAPEUTA_DEMO_EMAIL,
    nome: "Terapeuta Demo",
    senha: TERAPEUTA_DEMO_SENHA,
    clinicId,
    papel: "terapeuta",
    emailVerificado: true,
    db: ownerDb,
  });

  console.log("🧒 Cadastrando pacientes demo com protocolo ativo...");
  // UM paciente (e uma sessão) POR SPEC. Consolidar é irreversível do ponto de
  // vista do passo em foco: `/sessoes/[id]` sai de "documentar" assim que a
  // nota é gravada (R-05). Com uma sessão só, o primeiro spec a consolidar
  // deixava os seguintes esperando por um formulário que a página não
  // renderiza mais — `revisao`/`ditado-voz` estouravam em `getByLabel(...)`.
  // Cada spec abre a sessão do SEU paciente pelo `aria-label` do card da
  // agenda ("Abrir agendamento de <nome> às <hora>"), nunca por `.first()`.
  const PACIENTES_DEMO = [
    { nome: "Paciente Demo E2E", hora: 9, spec: "diario-demo" },
    { nome: "Paciente Revisão E2E", hora: 10, spec: "revisao" },
    { nome: "Paciente Ditado E2E", hora: 11, spec: "ditado-voz" },
  ] as const;

  console.log("📅 Agendando sessões de hoje para o terapeuta demo...");
  // "Hoje" tem que ser o dia NO FUSO DA CLÍNICA, não no fuso do processo. O
  // `new Date()` + `setHours(9, …)` gravava 09:00 do fuso do runner: em CI (UTC)
  // isso vira 06:00 de America/Sao_Paulo do MESMO dia UTC, que já é o dia
  // SEGUINTE em BRT sempre que o job roda entre 00:00 e 03:00 UTC (21:00–00:00
  // BRT). A agenda resolve o dia com `Intl` em `FUSO_CLINICA` (agenda/page.tsx),
  // não encontrava a sessão, e `diario-demo`/`revisao` estouravam esperando o
  // botão "Abrir agendamento de …". Falha só nessa janela de 3h — por isso a
  // suíte passava na maioria das execuções.
  const diaNaClinica = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_CLINICA,
  }).format(new Date());
  for (const { nome, hora, spec } of PACIENTES_DEMO) {
    const agendadaPara = new Date(
      `${diaNaClinica}T${String(hora).padStart(2, "0")}:00:00${FUSO_CLINICA_OFFSET}`,
    );

    const [paciente] = await ownerDb
      .insert(patient)
      .values({
        clinicId,
        nome,
        nascimento: "2020-01-01",
        responsavelContato: "Responsável Demo (Mãe) - (11) 90000-0000",
        clinicalModality: "protocol_driven",
      })
      .returning();
    if (!paciente) throw new Error(`Falha ao criar paciente demo "${nome}".`);

    await ownerDb.insert(consent).values({
      patientId: paciente.id,
      tipo: "tratamento_dados_menor",
      responsavelSignatario: "Responsável Demo",
      versaoTermo: "termo-v1",
    });

    await ownerDb.insert(patientProtocol).values({
      patientId: paciente.id,
      protocolId: protocoloDemo.id,
      ativadoPor: coordenadorId,
    });

    await ownerDb.insert(session).values({
      clinicId,
      patientId: paciente.id,
      terapeutaId,
      agendadaPara,
      // #512 · deriveEstadoSessao (estado.ts): gesto "documentar" só existe a
      // partir de "realizada" — "agendada" resolve para "registrar_sessao" (o
      // check-in precisa acontecer antes). Os specs documentam direto, sem
      // passar pelo check-in, então a sessão já nasce checada.
      estado: "realizada",
      checkInEm: agendadaPara,
      disciplina: "ABA",
      duracaoMin: 50,
      modalidade: "presencial",
      tipo: "terapia",
    });
    console.log(`   • ${nome} às ${hora}h (spec ${spec})`);
  }

  console.log("✅ Clínica demo pronta.");
}
