import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { withTenant } from "@/db/rls";
import {
  patient,
  patientClinicalProfile,
  protocol,
  patientProtocol,
} from "@/db/schema";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { FichaClinicaForm } from "./ficha-clinica-form";
import { ProtocolosSecao } from "./protocolos-secao";
import { obterOuInicializarProtocolosDaClinica } from "./protocolo-logic";
import { PrescricaoDisciplinasSecao } from "./prescricao-disciplinas-secao";
import { listarPrescricoesVigentes } from "./prescricao-logic";

export default async function CadastroClinicoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getTenantContext();
  try {
    requireRole(ctx, "coordenador");
  } catch {
    notFound();
  }

  // A prescrição é carregada FORA do `withTenant` das demais leituras porque o
  // núcleo abre a própria transação (é o mesmo caminho usado pela action, e
  // duplicar a query aqui deixaria as duas versões divergirem quanto ao filtro
  // de vigência — o bug mais provável desta feature, plano §4.5).
  const prescricoes = await listarPrescricoesVigentes(ctx, id);

  const [pacienteRow, perfilRow, catalogo, vinculos] = await withTenant(
    ctx,
    async (tx) => [
      await tx.select().from(patient).where(eq(patient.id, id)),
      await tx
        .select()
        .from(patientClinicalProfile)
        .where(eq(patientClinicalProfile.patientId, id)),
      await obterOuInicializarProtocolosDaClinica(tx, ctx.clinicId),
      await tx
        .select()
        .from(patientProtocol)
        .where(eq(patientProtocol.patientId, id)),
    ],
  );
  if (!pacienteRow[0]) notFound();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumb={
          <Breadcrumb
            itens={[
              { rotulo: "Pacientes", href: "/pacientes" },
              { rotulo: pacienteRow[0].nome, href: `/pacientes/${id}` },
              { rotulo: "Cadastro clínico", atual: true },
            ]}
          />
        }
        title={`Cadastro clínico — ${pacienteRow[0].nome}`}
        description="Ficha de acompanhamento clínico e protocolos do paciente"
      />
      {/* Primeira seção da página de propósito: é para cá que o cadastro
          redireciona (`#prescricao`), e sem prescrição o paciente não tem teto
          para montar equipe. Protocolo vem depois porque é encaixe opcional. */}
      <PrescricaoDisciplinasSecao patientId={id} prescricoes={prescricoes} />
      <ProtocolosSecao patientId={id} catalogo={catalogo} vinculos={vinculos} />
      <FichaClinicaForm patientId={id} perfil={perfilRow[0]} />
    </div>
  );
}
