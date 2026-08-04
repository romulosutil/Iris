import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { listarBloqueios } from "@/app/(app)/agenda/bloqueio-queries";
import { horasDisponiveisSemana } from "@/lib/agenda/janela";
import { faixasParaCelulas } from "@/lib/agenda/grade";
import { withTenant } from "@/db/rls";
import { and, eq } from "drizzle-orm";
import { appUser, clinic, userRole } from "@/db/schema";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { carregarHorasTerapeuta } from "@/app/(app)/agenda/horas-queries";
import { carregarDisponibilidade } from "./queries";
import { DisponibilidadeEditor } from "./disponibilidade-editor";
import { BloqueiosTerapeuta } from "./bloqueios-terapeuta";
import { HorasTerapeutaBloco } from "./horas-terapeuta";

interface Props { params: Promise<{ id: string }>; }

export default async function TerapeutaPage({ params }: Props) {
  const { id } = await params;
  const ctx = await getTenantContext();
  try {
    requireRole(ctx, "coordenador");
  } catch {
    notFound();
  }

  const dados = await withTenant(ctx, async (tx) => {
    const [terapeuta] = await tx
      .select({ id: appUser.id, name: appUser.name })
      .from(userRole)
      .innerJoin(appUser, eq(appUser.id, userRole.userId))
      .where(and(eq(userRole.userId, id), eq(userRole.clinicId, ctx.clinicId), eq(userRole.papel, "terapeuta")))
      .limit(1);
    const [c] = await tx.select({ passoGradeMin: clinic.passoGradeMin }).from(clinic).where(eq(clinic.id, ctx.clinicId)).limit(1);
    return { terapeuta: terapeuta ?? null, passoGradeMin: c?.passoGradeMin ?? 30 };
  });
  if (!dados.terapeuta) notFound();

  const faixas = await carregarDisponibilidade(ctx, id);
  const bloqueios = await listarBloqueios(ctx, { escopo: "terapeuta", terapeutaId: id });
  const celulasIniciais = faixasParaCelulas(faixas, dados.passoGradeMin);
  const horas = horasDisponiveisSemana(faixas);
  const horasTerapeuta = await carregarHorasTerapeuta(ctx, id);

  return (
    <main className="flex flex-col gap-8">
      <PageHeader
        breadcrumb={
          <Breadcrumb
            itens={[
              { rotulo: "Equipe", href: "/equipe" },
              { rotulo: dados.terapeuta.name, atual: true },
            ]}
          />
        }
        title={dados.terapeuta.name}
        description={
          <span>
            Disponibilidade oferecida: <strong>{horas.toLocaleString("pt-BR")}h/semana</strong>
          </span>
        }
      />
      <HorasTerapeutaBloco horas={horasTerapeuta} />
      <DisponibilidadeEditor terapeutaId={id} passoMin={dados.passoGradeMin} celulasIniciais={celulasIniciais} />
      <BloqueiosTerapeuta terapeutaId={id} bloqueios={bloqueios} />
    </main>
  );
}
