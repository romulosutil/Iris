"use server";

import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { RoleError } from "@/auth/require-role";
import {
  carregarSemana,
  ConflitoError,
  conflitosDaRegra,
  contarFuturasDaRegra,
  criarAvulsa,
  criarRegra,
  encerrarRegra,
  listarDisciplinasEquipe,
  listarPacientes,
  materializarRegra,
  proximaSessaoDaRegra,
  type CarregarSemanaParams,
  type NovaAvulsa,
  type NovaRegra,
  type SemanaCarregada,
} from "@/app/(app)/agenda/queries";
import { horizontePadrao } from "@/lib/agenda/materializar";
import {
  ContaSomenteLeituraError,
  type BloqueioConta,
} from "@/lib/billing/guard-escrita";

export type EstadoAcao = {
  error?: string;
  ok?: boolean;
  bloqueioConta?: BloqueioConta;
};

function trata(e: unknown): EstadoAcao {
  if (e instanceof ConflitoError) return { error: e.message };
  // Os cores da agenda guardam por exceção (retornam `{ id }`, não estado com
  // `error`), então a tradução para o formato que a UI entende acontece aqui —
  // é o único ponto por onde todas as escritas da semana passam.
  if (e instanceof ContaSomenteLeituraError) {
    return {
      error: e.message,
      bloqueioConta: { estado: e.estado, mensagem: e.message },
    };
  }
  if (e instanceof RoleError) return { error: "Sem permissão para alocar." };
  throw e;
}

export async function criarRegraAction(
  _prev: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  const ctx = await getTenantContext();
  const dados: NovaRegra = {
    patientId: String(formData.get("patientId")),
    terapeutaId: String(formData.get("terapeutaId")),
    disciplina: String(formData.get("disciplina")),
    diaSemana: Number(formData.get("diaSemana")),
    horaInicio: String(formData.get("horaInicio")),
    duracaoMin: Number(formData.get("duracaoMin")),
    semanaVisivelISO: String(formData.get("semanaVisivelISO")),
    hojeISO: String(formData.get("hojeISO")),
  };
  try {
    await criarRegra(ctx, dados);
  } catch (e) {
    return trata(e);
  }
  revalidatePath("/agenda/semana");
  return { ok: true };
}

/** Leitura reativa fina: o shell client dispara isto no `useEffect` sempre
 * que eixo/semana/entidade mudam. `carregarSemana` já valida tenant+papel
 * internamente — esta action só resolve o contexto e repassa. */
export async function carregarSemanaAction(
  params: CarregarSemanaParams,
): Promise<SemanaCarregada> {
  const ctx = await getTenantContext();
  return carregarSemana(ctx, params);
}

/** Leitura fina p/ busca do combobox de pacientes (debounce fica no client). */
export async function listarPacientesAction(
  termo: string,
): Promise<{ id: string; nome: string }[]> {
  const ctx = await getTenantContext();
  return listarPacientes(ctx, termo);
}

/** Leitura fina p/ disciplinas da equipe do paciente/terapeuta. */
export async function listarDisciplinasEquipeAction(
  patientId?: string | null,
  terapeutaId?: string | null,
): Promise<string[]> {
  const ctx = await getTenantContext();
  return listarDisciplinasEquipe(ctx, patientId, terapeutaId);
}

export async function criarAvulsaAction(
  _prev: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  const ctx = await getTenantContext();
  const dados: NovaAvulsa = {
    patientId: String(formData.get("patientId")),
    terapeutaId: String(formData.get("terapeutaId")),
    disciplina: String(formData.get("disciplina")),
    tipo: formData.get("tipo") as NovaAvulsa["tipo"],
    dataISO: String(formData.get("dataISO")),
    horaInicio: String(formData.get("horaInicio")),
    duracaoMin: Number(formData.get("duracaoMin")),
    modalidade:
      (formData.get("modalidade") as NovaAvulsa["modalidade"]) ?? "presencial",
    repostaDe: (() => {
      const v = String(formData.get("repostaDe") ?? "").trim();
      return v === "" ? undefined : v;
    })(),
  };
  try {
    await criarAvulsa(ctx, dados);
  } catch (e) {
    return trata(e);
  }
  revalidatePath("/agenda/semana");
  return { ok: true };
}

export type EstadoEstender = EstadoAcao & {
  geradas?: number;
  puladas?: number;
};

export async function estenderAction(
  _prev: EstadoEstender,
  formData: FormData,
): Promise<EstadoEstender> {
  const ctx = await getTenantContext();
  const regraId = String(formData.get("regraId"));
  const hojeISO = String(formData.get("hojeISO"));
  try {
    const { geradas, puladas } = await materializarRegra(
      ctx,
      regraId,
      horizontePadrao(hojeISO),
    );
    revalidatePath("/agenda/semana");
    return { ok: true, geradas, puladas: puladas.length };
  } catch (e) {
    return trata(e);
  }
}

export async function encerrarRegraAction(
  _prev: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  const ctx = await getTenantContext();
  try {
    await encerrarRegra(
      ctx,
      String(formData.get("regraId")),
      String(formData.get("ateFimISO")),
    );
  } catch (e) {
    return trata(e);
  }
  revalidatePath("/agenda/semana");
  return { ok: true };
}

/** Leitura fina p/ a confirmação de encerramento (F5): quantas futuras sairão. */
export async function contarFuturasAction(
  regraId: string,
  ateFimISO: string,
): Promise<number> {
  const ctx = await getTenantContext();
  return contarFuturasDaRegra(ctx, regraId, ateFimISO);
}

/** Leitura fina p/ o rótulo honesto "próxima sessão" no popover de regra (F4). */
export async function proximaSessaoAction(
  regraId: string,
): Promise<string | null> {
  const ctx = await getTenantContext();
  return proximaSessaoDaRegra(ctx, regraId);
}

/** Leitura fina p/ as datas de conflito (F2): re-derivadas do estado do banco. */
export async function conflitosAction(regraId: string): Promise<string[]> {
  const ctx = await getTenantContext();
  return conflitosDaRegra(ctx, regraId);
}
