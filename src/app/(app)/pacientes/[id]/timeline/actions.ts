"use server";

import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import {
  carregarDeltaSessao,
  carregarComparacao,
  carregarEvidenciasPorTrecho,
} from "./queries";

export async function carregarDeltaSessaoAction(patientId: string, sessionNumero: number) {
  const ctx = await getTenantContext();
  requireRole(ctx, "terapeuta", "coordenador");
  return carregarDeltaSessao(ctx, patientId, sessionNumero);
}

export async function carregarComparacaoAction(patientId: string, sessaoN: number, sessaoM: number) {
  const ctx = await getTenantContext();
  requireRole(ctx, "terapeuta", "coordenador");
  return carregarComparacao(ctx, patientId, sessaoN, sessaoM);
}

export async function carregarEvidenciasAction(
  patientId: string,
  goalOrMilestoneId: string,
  sessaoInicio: number,
  sessaoFim: number
) {
  const ctx = await getTenantContext();
  requireRole(ctx, "terapeuta", "coordenador");
  return carregarEvidenciasPorTrecho(ctx, patientId, goalOrMilestoneId, sessaoInicio, sessaoFim);
}
