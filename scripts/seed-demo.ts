/**
 * Seed de DEMONSTRAÇÃO (Fase 2 · Plano 4). Cria uma clínica `is_demo = true`
 * com dados fictícios suficientes para o fluxo demo do diário rodar de ponta a
 * ponta (e destravar o E2E `e2e/diario-demo.spec.ts`):
 *
 *   - 1 coordenador  (ator dos inserts clínicos, exigido pelo RLS)
 *   - 1 terapeuta    (login do E2E: terapeuta.demo@iris.test / "Senha Demo 123")
 *   - 4 pacientes ("famílias") com equipe (terapeuta de referência) e protocolo
 *   - 1 sessão de HOJE do terapeuta demo (aparece na grade do dia da agenda)
 *
 * `is_demo = true` faz `resolveProvider` usar o `DemoStubProvider` — a
 * consolidação gera sugestões fictícias (sem LLM, guardrail #6).
 *
 * Idempotente: pode rodar de novo sem duplicar (guarda por chave natural onde
 * não há unique). Rodar com:  pnpm seed:demo
 *
 * ATENÇÃO: só rodar contra banco LOCAL de desenvolvimento — nunca contra dado
 * real de paciente (é dado fictício de demonstração).
 */
import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { authDb, authSql, sql } from "@/db/client";
import {
  careTeamMembership,
  clinic,
  patient,
  patientProtocol,
  protocol,
  session,
} from "@/db/schema";
import { provisionUser } from "@/auth/provisioning";
import { withTenant } from "@/db/rls";

// Fuso da clínica. Brasil não tem horário de verão desde 2019 → offset fixo.
// (Espelha src/app/(app)/agenda/fuso.ts; inlined para não importar um módulo de
// rota dentro de um script de infra.)
const FUSO_CLINICA = "America/Sao_Paulo";
const FUSO_CLINICA_OFFSET = "-03:00";

const NOME_CLINICA = "Clínica Demo Iris";
const COORD_EMAIL = "coordenador.demo@iris.test";
const COORD_SENHA = "Senha Demo 123";
const TERAPEUTA_EMAIL = "terapeuta.demo@iris.test";
const TERAPEUTA_SENHA = "Senha Demo 123";
const DISCIPLINA = "aba";
const FAMILIA = "aba_marcos_desenvolvimento"; // semeado em 0001_rls.sql
const PACIENTES = [
  "Ana Beatriz (demo)",
  "Bruno Carvalho (demo)",
  "Clara Dias (demo)",
  "Davi Esteves (demo)",
];

async function main() {
  // 1) Clínica demo (idempotente por nome; garante is_demo = true). Via authDb
  //    (iris_auth) — a clínica não é dado clínico de paciente.
  const existente = await authDb
    .select()
    .from(clinic)
    .where(eq(clinic.nome, NOME_CLINICA))
    .limit(1);
  const c =
    existente.length > 0
      ? existente[0]!
      : (
          await authDb
            .insert(clinic)
            .values({ nome: NOME_CLINICA, isDemo: true })
            .returning()
        )[0]!;
  if (existente.length > 0 && !c.isDemo) {
    await authDb.update(clinic).set({ isDemo: true }).where(eq(clinic.id, c.id));
  }

  // 2) Usuários + papéis (via Better-Auth; hash compatível com o login).
  const { userId: coordenadorId } = await provisionUser({
    email: COORD_EMAIL,
    nome: "Coordenador(a) Demo",
    senha: COORD_SENHA,
    clinicId: c.id,
    papel: "coordenador",
  });
  const { userId: terapeutaId } = await provisionUser({
    email: TERAPEUTA_EMAIL,
    nome: "Terapeuta Demo",
    senha: TERAPEUTA_SENHA,
    clinicId: c.id,
    papel: "terapeuta",
  });

  // 3) Dados clínicos: RLS exige que os inserts passem pelo `withTenant` com um
  //    ator `coordenador` (patient/protocol/patient_protocol/care_team/session
  //    são gated por papel). O terapeuta já tem user_role na clínica (passo 2),
  //    satisfazendo o WITH CHECK `app_user_in_clinic(terapeuta_id)` da sessão.
  const ctx = { clinicId: c.id, userId: coordenadorId, role: "coordenador" as const };

  await withTenant(ctx, async (tx) => {
    // Protocolo demo (idempotente por clínica + nome).
    const nomeProtocolo = "ABA — Marcos (demo)";
    const [protoExistente] = await tx
      .select({ id: protocol.id })
      .from(protocol)
      .where(and(eq(protocol.clinicId, c.id), eq(protocol.nome, nomeProtocolo)))
      .limit(1);
    const protocolId =
      protoExistente?.id ??
      (
        await tx
          .insert(protocol)
          .values({
            clinicId: c.id,
            nome: nomeProtocolo,
            disciplina: DISCIPLINA,
            familia: FAMILIA,
          })
          .returning({ id: protocol.id })
      )[0]!.id;

    const pacienteIds: string[] = [];
    for (const nome of PACIENTES) {
      // Paciente (sem chave natural única → guarda por clínica + nome).
      const [pacExistente] = await tx
        .select({ id: patient.id })
        .from(patient)
        .where(and(eq(patient.clinicId, c.id), eq(patient.nome, nome)))
        .limit(1);
      const patientId =
        pacExistente?.id ??
        (
          await tx
            .insert(patient)
            .values({ clinicId: c.id, nome })
            .returning({ id: patient.id })
        )[0]!.id;
      pacienteIds.push(patientId);

      // Equipe: terapeuta demo como referência (vigente). Guarda por
      // paciente + usuário + vigente.
      const [membroExistente] = await tx
        .select({ id: careTeamMembership.id })
        .from(careTeamMembership)
        .where(
          and(
            eq(careTeamMembership.patientId, patientId),
            eq(careTeamMembership.userId, terapeutaId),
            isNull(careTeamMembership.vigenciaFim),
          ),
        )
        .limit(1);
      if (!membroExistente) {
        await tx.insert(careTeamMembership).values({
          patientId,
          userId: terapeutaId,
          disciplina: DISCIPLINA,
          papelNaEquipe: "terapeuta_referencia",
        });
      }

      // Protocolo ativo do paciente. Guarda por paciente + protocolo + ativo.
      const [ppExistente] = await tx
        .select({ id: patientProtocol.id })
        .from(patientProtocol)
        .where(
          and(
            eq(patientProtocol.patientId, patientId),
            eq(patientProtocol.protocolId, protocolId),
            isNull(patientProtocol.desativadoEm),
          ),
        )
        .limit(1);
      if (!ppExistente) {
        await tx.insert(patientProtocol).values({
          patientId,
          protocolId,
          ativadoPor: coordenadorId,
        });
      }
    }

    // Sessão de HOJE (09:00 no fuso da clínica) do terapeuta demo com o 1º
    // paciente — é a que o E2E abre pela agenda. Guarda por paciente +
    // terapeuta dentro da janela do dia (mesma lógica de `listarSessoesDoDia`).
    const hoje = new Intl.DateTimeFormat("en-CA", {
      timeZone: FUSO_CLINICA,
    }).format(new Date());
    const inicioDia = new Date(`${hoje}T00:00:00${FUSO_CLINICA_OFFSET}`);
    const fimDia = new Date(inicioDia.getTime() + 24 * 60 * 60 * 1000);
    const agendadaPara = new Date(`${hoje}T09:00:00${FUSO_CLINICA_OFFSET}`);

    const [sessaoHoje] = await tx
      .select({ id: session.id })
      .from(session)
      .where(
        and(
          eq(session.patientId, pacienteIds[0]!),
          eq(session.terapeutaId, terapeutaId),
          gte(session.agendadaPara, inicioDia),
          lt(session.agendadaPara, fimDia),
        ),
      )
      .limit(1);
    if (!sessaoHoje) {
      await tx.insert(session).values({
        clinicId: c.id,
        patientId: pacienteIds[0]!,
        terapeutaId,
        agendadaPara,
        disciplina: DISCIPLINA,
      });
    }
  });

  console.log(
    [
      `Clínica demo "${NOME_CLINICA}" (${c.id}, is_demo) pronta.`,
      `  Coordenador: ${COORD_EMAIL} (${coordenadorId})`,
      `  Terapeuta:   ${TERAPEUTA_EMAIL} / "${TERAPEUTA_SENHA}" (${terapeutaId})`,
      `  ${PACIENTES.length} pacientes + protocolo + sessão de hoje semeados.`,
    ].join("\n"),
  );
  // Fecha os dois pools (auth + app/withTenant) — sem isso o event loop fica
  // vivo pelas conexões idle e o script pendura.
  await Promise.all([authSql.end(), sql.end()]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
