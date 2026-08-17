import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { listarTerapeutas } from "@/app/(app)/equipe/[id]/queries";
import {
  carregarConfigClinica,
  pacientePorId,
} from "@/app/(app)/agenda/queries";
import { segundaDaSemana } from "@/lib/agenda/semana";
import { SemanaCliente, type Prefill } from "./semana-cliente";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function primeiro(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Task 8: prefill de reposição vindo de `/agenda?...` → `gerir-sessao`
 * ("Repor" em faltas). Só monta o prefill se os 4 parâmetros estiverem
 * presentes — parcial é tratado como ausente. */
function paramsPrefill(
  sp: Record<string, string | string[] | undefined>,
):
  | {
      repostaDe: string;
      patientId: string;
      terapeutaId: string;
      disciplina: string;
    }
  | undefined {
  const repostaDe = primeiro(sp.repor);
  const patientId = primeiro(sp.patientId);
  const terapeutaId = primeiro(sp.terapeutaId);
  const disciplina = primeiro(sp.disciplina);
  if (!repostaDe || !patientId || !terapeutaId || !disciplina) return undefined;
  return { repostaDe, patientId, terapeutaId, disciplina };
}

export default async function Page({ searchParams }: PageProps) {
  const ctx = await getTenantContext();
  requireRole(ctx, "coordenador");
  const [terapeutas, config, sp] = await Promise.all([
    listarTerapeutas(ctx),
    carregarConfigClinica(ctx),
    searchParams,
  ]);
  const hojeISO = new Date().toISOString().slice(0, 10);
  const paramsP = paramsPrefill(sp);
  const paciente = paramsP ? await pacientePorId(ctx, paramsP.patientId) : null;
  const prefill: Prefill | undefined =
    paramsP && paciente
      ? { ...paramsP, patientNome: paciente.nome }
      : undefined;
  return (
    <SemanaCliente
      terapeutas={terapeutas.map((t) => ({ id: t.id, nome: t.name ?? "—" }))}
      semanaInicialISO={segundaDaSemana(hojeISO)}
      hojeISO={hojeISO}
      disciplinas={config.disciplinas}
      duracaoPadrao={config.duracaoDisciplina}
      prefill={prefill}
    />
  );
}
