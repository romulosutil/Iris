import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { listarTerapeutas } from "@/app/(app)/equipe/[id]/queries";
import { carregarConfigClinica } from "@/app/(app)/agenda/queries";
import { segundaDaSemana } from "@/lib/agenda/semana";
import { SemanaCliente } from "./semana-cliente";

export default async function Page() {
  const ctx = await getTenantContext();
  requireRole(ctx, "coordenador");
  const [terapeutas, config] = await Promise.all([
    listarTerapeutas(ctx),
    carregarConfigClinica(ctx),
  ]);
  const hojeISO = new Date().toISOString().slice(0, 10);
  return (
    <SemanaCliente
      terapeutas={terapeutas.map((t) => ({ id: t.id, nome: t.name ?? "—" }))}
      semanaInicialISO={segundaDaSemana(hojeISO)}
      hojeISO={hojeISO}
      disciplinas={config.disciplinas}
      duracaoPadrao={config.duracaoDisciplina}
    />
  );
}
