import { notFound } from "next/navigation";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { withTenant } from "@/db/rls";
import {
  anamnese,
  anamneseAlvo,
  appUser,
  milestone,
  patient,
  patientProtocol,
  protocol,
} from "@/db/schema";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import {
  AnamneseForm,
  type AnamneseDados,
  type MilestoneOpcao,
  type AnamneseAlvoItem,
} from "./anamnese-form";
import type { EixoEspectro } from "@/lib/evidence/espectro";
import type { Procedencia } from "./schemas";

export default async function AnamnesePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getTenantContext();

  try {
    requireRole(ctx, "coordenador", "terapeuta");
  } catch {
    notFound();
  }

  const isCoordenador = ctx.role === "coordenador";

  const dados = await withTenant(ctx, async (tx) => {
    // 1. Paciente
    const [pacienteRow] = await tx
      .select({
        id: patient.id,
        nome: patient.nome,
        clinicalModality: patient.clinicalModality,
      })
      .from(patient)
      .where(eq(patient.id, id));

    if (!pacienteRow) return null;

    // Rota inacessível para paciente que não é protocol_driven (T33 / ANAM-01)
    if (pacienteRow.clinicalModality !== "protocol_driven") {
      return { inativoOuModalidadeInvalida: true };
    }

    // 2. Protocolos ativos e taxonomia
    const ativos = await tx
      .select({
        protocolId: patientProtocol.protocolId,
        taxonomiaAjuda: protocol.taxonomiaAjuda,
      })
      .from(patientProtocol)
      .innerJoin(protocol, eq(patientProtocol.protocolId, protocol.id))
      .where(
        and(
          eq(patientProtocol.patientId, id),
          isNull(patientProtocol.desativadoEm),
        ),
      );

    const protocolIds = ativos.map((a) => a.protocolId);
    const taxonomiaAjuda = (ativos[0]?.taxonomiaAjuda as string[] | null) ?? [
      "Independente",
      "Dica Verbal",
      "Dica Gestual",
      "Modelação",
      "Dica Física",
    ];

    // 3. Marcos catalogados dos protocolos ativos
    const marcos = protocolIds.length
      ? await tx
          .select({
            id: milestone.id,
            nome: milestone.nome,
            nivel: milestone.nivel,
          })
          .from(milestone)
          .where(inArray(milestone.protocolId, protocolIds))
          .orderBy(asc(milestone.nome))
      : [];

    // 4. Anamnese existente (rascunho ou validada)
    const [anamneseRow] = await tx
      .select({
        id: anamnese.id,
        estado: anamnese.estado,
        validadaEm: anamnese.validadaEm,
        validadaPor: anamnese.validadaPor,
        criadoEm: anamnese.criadoEm,
      })
      .from(anamnese)
      .where(eq(anamnese.patientId, id))
      .orderBy(asc(anamnese.criadoEm));

    let anamneseDados: AnamneseDados | null = null;

    if (anamneseRow) {
      let validadaPorNome: string | null = null;
      if (anamneseRow.validadaPor) {
        const [userRow] = await tx
          .select({ name: appUser.name })
          .from(appUser)
          .where(eq(appUser.id, anamneseRow.validadaPor));
        validadaPorNome = userRow?.name ?? null;
      }

      const alvosRows = await tx
        .select()
        .from(anamneseAlvo)
        .where(eq(anamneseAlvo.anamneseId, anamneseRow.id))
        .orderBy(asc(anamneseAlvo.criadoEm));

      const alvos: AnamneseAlvoItem[] = alvosRows.map((r) => ({
        id: r.id,
        eixo: r.eixo as EixoEspectro,
        descricao: r.descricao,
        disciplina: r.disciplina as "ABA" | "Fono" | "TO" | null,
        milestone_id: r.milestoneId,
        nivel_ajuda_inicial: r.nivelAjudaInicial,
        procedencia: r.procedencia as Procedencia,
        criterio_n: r.criterioN ?? 3,
        criterio_m: r.criterioM ?? 4,
        ciclo_revisao_semanas: r.cicloRevisaoSemanas ?? 8,
      }));

      anamneseDados = {
        id: anamneseRow.id,
        estado: anamneseRow.estado as "rascunho" | "validada",
        validadaEm: anamneseRow.validadaEm
          ? anamneseRow.validadaEm.toISOString()
          : null,
        validadaPorNome,
        criadoEm: anamneseRow.criadoEm.toISOString(),
        alvos,
      };
    }

    return {
      paciente: pacienteRow,
      marcos,
      taxonomiaAjuda,
      anamnese: anamneseDados,
    };
  });

  if (!dados || "inativoOuModalidadeInvalida" in dados) {
    notFound();
  }

  const { paciente, marcos, taxonomiaAjuda, anamnese: anamneseDados } = dados;

  const opcoesMarco: MilestoneOpcao[] = marcos.map((m) => ({
    id: m.id,
    rotulo: m.nivel ? `${m.nome} · ${m.nivel}` : m.nome,
  }));

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb
        itens={[
          { rotulo: "Pacientes", href: "/pacientes" },
          { rotulo: paciente.nome, href: `/pacientes/${id}` },
          { rotulo: "Anamnese & Marco Zero", atual: true },
        ]}
      />

      <PageHeader
        title="Anamnese Clínica e Marco Zero"
        description={`Registro de habilidades basais e entrevista de entrada para ${paciente.nome}.`}
      />

      <AnamneseForm
        patientId={id}
        patientNome={paciente.nome}
        isCoordenador={isCoordenador}
        anamnese={anamneseDados}
        milestones={opcoesMarco}
        taxonomiaAjuda={taxonomiaAjuda}
      />
    </div>
  );
}
