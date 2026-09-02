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
  milestone,
  goal,
  patient,
  consent,
  patientProtocol,
  careTeamMembership,
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

  // #533 — UM marco, num único domínio, para o e2e do coordenador
  // (`validacao-coordenador.spec.ts`) ter um alvo de reclassificação:
  // `alvosValidosDoPaciente` lista goals do paciente + marcos dos protocolos
  // ativos, e o paciente demo não tem goal. Um só por domínio de propósito —
  // `resolverAlvoParaFks` devolve `null` (e `validarAlvo` recusa) quando o
  // domínio tem mais de um marco. O `DemoStubProvider` não usa marcos
  // (só `goal_id`), então nada muda para `diario-demo`/`revisao`.
  await ownerDb.insert(milestone).values({
    protocolId: protocoloDemo.id,
    dominioId: "mando",
    nome: "Mando — pede item desejado",
    nivel: "1",
    tipoEstrutura: "marco_simples",
    estrutura: {},
  });

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
    // #533 — o terapeuta consolida e decide as 6 sugestões; as 2 de baixa
    // confiança sobem para a fila do coordenador (`/validacao`).
    {
      nome: "Paciente Validação E2E",
      hora: 12,
      spec: "validacao-coordenador",
    },
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

    // #533 — SÓ o paciente do e2e do coordenador tem meta ativa. O
    // `DemoStubProvider` só põe alvo na sugestão quando `metasAtivas[0]`
    // existe, e `evidence` nasce POR ALVO (`revisao/logic.ts`, `alvo_ordinal`):
    // sem meta, aprovar a sugestão não gera evidência nenhuma e nada entra
    // na fila de `/validacao`. Os outros pacientes ficam sem meta de
    // propósito — `diario-demo`/`revisao` contam cartões, não evidências, e
    // não devem mudar de comportamento.
    //
    // A meta só é VISÍVEL ao terapeuta com vínculo vigente na equipe do
    // paciente (`goal_select` exige `app_is_on_team` para quem não é
    // coordenador; a extração lê as metas sob o `withTenant` do terapeuta).
    // Sem o vínculo, `metasAtivas` chega vazia e o efeito é o mesmo de não
    // ter meta.
    if (spec === "validacao-coordenador") {
      await ownerDb.insert(careTeamMembership).values({
        patientId: paciente.id,
        userId: terapeutaId,
        disciplina: "ABA",
        papelNaEquipe: "terapeuta_referencia",
      });
      await ownerDb.insert(goal).values({
        patientId: paciente.id,
        clinicId,
        descricao: "Pedir o item desejado com palavra ou gesto",
        disciplina: "ABA",
        estado: "ativa",
        criterioDominio: { tipo: "acertos_consecutivos", valor: 3 },
        criadoPor: coordenadorId,
      });
    }

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
