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
  patientAlvoDisciplina,
  patientClinicalProfile,
  anamnese,
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
    // #567-família — o ÚNICO paciente demo que nasce com a escada de
    // prontidão ABERTA. Todos os outros recebem protocolo e meta aqui embaixo,
    // e por isso nenhum deles pode provar o cartão de prontidão: para eles
    // `montarProntidao` já devolve os dois degraus bloqueantes concluídos.
    // Este nasce com ficha clínica e anamnese prontas (senão `proximo` seria
    // um degrau ANTERIOR e o cartão apontaria outro gesto) e com a disciplina
    // ABA prescrita (o protocolo é ENCAIXE de disciplina prescrita —
    // `protocolos-secao.tsx`; sem prescrição a seção nem oferece o botão).
    // Faltam, de propósito, exatamente os dois degraus que o e2e faz o
    // coordenador fechar pela UI: protocolo vigente e meta ativa.
    {
      nome: "Paciente Prontidão E2E",
      hora: 13,
      spec: "prontidao-do-prontuario",
    },
  ] as const;

  // Specs cujo paciente NÃO recebe protocolo/meta no seed.
  const ESCADA_ABERTA = new Set<string>(["prontidao-do-prontuario"]);

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

    // Paciente da escada aberta: os pré-requisitos dos degraus ANTERIORES aos
    // bloqueantes ficam prontos no seed, para que o `proximo` do cartão seja
    // "Prescrever um protocolo" — que é o gesto sob teste. Ficha e anamnese
    // são degraus de coordenação também, mas o e2e não pode exercitar todos
    // sem virar um teste de cinco telas: o valor está na costura
    // cartão → lista → passo Documentar, não em repetir o cadastro clínico.
    if (ESCADA_ABERTA.has(spec)) {
      await ownerDb.insert(patientClinicalProfile).values({
        patientId: paciente.id,
        diagnostico: "TEA — hipótese diagnóstica (dados fictícios)",
      });
      await ownerDb.insert(anamnese).values({
        clinicId,
        patientId: paciente.id,
        estado: "validada",
        observacoes: "Anamnese de demonstração (dados fictícios).",
        criadoPor: coordenadorId,
        validadaPor: coordenadorId,
        validadaEm: new Date(),
      });
      // Prescrição vigente de ABA: é ela que faz `ProtocolosSecao` oferecer o
      // VB-MAPP do catálogo ("+ Encaixar protocolo"). Sem ela a seção só
      // mostra o alerta "Prescreva uma disciplina primeiro".
      await ownerDb.insert(patientAlvoDisciplina).values({
        clinicId,
        patientId: paciente.id,
        disciplina: "ABA",
        horasAlvoSemana: "4.0",
        vigenciaInicio: diaNaClinica,
      });
    } else {
      await ownerDb.insert(patientProtocol).values({
        patientId: paciente.id,
        protocolId: protocoloDemo.id,
        ativadoPor: coordenadorId,
      });
    }

    // Escada de prontidão: para `protocol_driven` os degraus bloqueantes são
    // Protocolo E Meta ativa (spec da jornada de admissão, §3.1). O protocolo
    // acima sozinho não destrava — sem meta `ativa`, `assertPodeDocumentar`
    // recusa e a rota da sessão renderiza o cartão de bloqueio no lugar do
    // formulário, e não existe campo "Anotação rápida" para o spec preencher.
    // Uma clínica demo que não consegue documentar não demonstra o produto.
    //
    // A meta é de TODOS os pacientes demo porque `app_fatos_prontidao`
    // (`0149`) é `SECURITY DEFINER` e lê `goal` sem exigir vínculo: a régua
    // vale para qualquer spec. Já a VISIBILIDADE da meta ao terapeuta segue
    // exigindo `app_is_on_team` (`goal_select`) — é o `careTeamMembership`
    // abaixo, e não esta linha, que faz `metasAtivas` deixar de vir vazia.
    if (!ESCADA_ABERTA.has(spec)) {
      await ownerDb.insert(goal).values({
        clinicId,
        patientId: paciente.id,
        descricao: "Pedir o item desejado com palavra ou gesto",
        disciplina: "ABA",
        estado: "ativa",
        criterioDominio: { tipo: "acertos_consecutivos", valor: 3 },
        criadoPor: coordenadorId,
      });
    }

    // #533 — SÓ o paciente do e2e do coordenador enxerga a meta pelo
    // terapeuta. O `DemoStubProvider` só põe alvo na sugestão quando
    // `metasAtivas[0]` existe, e `evidence` nasce POR ALVO
    // (`revisao/logic.ts`, `alvo_ordinal`): sem meta visível, aprovar a
    // sugestão não gera evidência nenhuma e nada entra na fila de
    // `/validacao`. Os outros pacientes ficam sem o vínculo de propósito —
    // `diario-demo`/`revisao` contam cartões, não evidências, e não devem
    // mudar de comportamento.
    // `prontidao-do-prontuario` também precisa do vínculo: a meta que o
    // coordenador cria DURANTE o teste só vira alvo de sugestão se o terapeuta
    // conseguir lê-la (`goal_select` exige `app_is_on_team`), e sem alvo a
    // evidência aprovada não materializa `session_snapshot` — o degrau
    // "Documentar a primeira sessão" nunca fecharia e o cartão nunca sumiria.
    if (spec === "validacao-coordenador" || ESCADA_ABERTA.has(spec)) {
      await ownerDb.insert(careTeamMembership).values({
        patientId: paciente.id,
        userId: terapeutaId,
        disciplina: "ABA",
        papelNaEquipe: "terapeuta_referencia",
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
