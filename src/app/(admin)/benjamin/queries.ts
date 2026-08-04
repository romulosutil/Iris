import "server-only";
import { authDb } from "@/db/client";
import {
  clinic,
  appUser,
  patient,
  subscription,
  asaasWebhookEvent,
  alertaRiscoClinico,
} from "@/db/schema";
import { eq, sql, ilike, or, desc, count } from "drizzle-orm";
import { calcularMensalidadeCentavos } from "@/lib/billing/calculator";

export interface SuperAdminKpis {
  mrrEstimadoCentavos: number;
  clinicasAtivas: number;
  pacientesCobraveisTotais: number;
  clinicasEmTrial: number;
  clinicasIsentas: number;
}

export interface SuperAdminClinicaItem {
  id: string;
  nome: string;
  donoNome: string | null;
  donoEmail: string | null;
  criadoEm: Date;
  status: "isenta" | "trial" | "ativa" | "inadimplente";
  pacientesAtivosCount: number;
  valorEstimadoCentavos: number;
  diasTrialRestantes: number | null;
}

export interface SuperAdminSaude {
  webhooksAsaas: {
    totalRecebidos: number;
    ultimosEventos: {
      id: string;
      asaasEventId: string;
      evento: string;
      processadoEm: Date;
    }[];
  };
  alertasRisco: {
    totalAlertas: number;
    ultimosAlertas: {
      id: string;
      clinicId: string;
      nivel: string;
      criadoEm: Date;
    }[];
  };
}

/**
 * Calcula o status de trial/billing da clínica e os dias restantes.
 */
function calcularStatusTrial(
  isentoTrial: boolean,
  trialComecoEm: Date | null,
  trialDias: number,
  criadoEm: Date,
  subStatus: string | null,
): { status: "isenta" | "trial" | "ativa" | "inadimplente"; diasRestantes: number | null } {
  if (isentoTrial) {
    return { status: "isenta", diasRestantes: null };
  }

  if (subStatus === "past_due") {
    return { status: "inadimplente", diasRestantes: null };
  }

  if (subStatus === "active") {
    return { status: "ativa", diasRestantes: null };
  }

  const agora = new Date();
  const inicioRelogio = trialComecoEm ? new Date(trialComecoEm) : new Date(criadoEm);
  const diasPassados = Math.floor((agora.getTime() - inicioRelogio.getTime()) / (1000 * 60 * 60 * 24));
  const limiteDias = trialComecoEm ? trialDias : 14;
  const diasRestantes = Math.max(0, limiteDias - diasPassados);

  if (diasPassados <= limiteDias) {
    return { status: "trial", diasRestantes };
  }

  return { status: "inadimplente", diasRestantes: 0 };
}

/**
 * Retorna os KPIs da plataforma para a visão geral do Super Admin.
 */
export async function getSuperAdminKpis(): Promise<SuperAdminKpis> {
  const rows = await authDb
    .select({
      clinicId: clinic.id,
      isentoTrial: clinic.isentoTrial,
      trialComecoEm: clinic.trialComecoEm,
      trialDias: clinic.trialDias,
      criadoEm: clinic.criadoEm,
      subStatus: subscription.status,
      pacientesAtivosCount: sql<number>`count(${patient.id}) filter (where ${patient.arquivadoEm} is null)::int`,
    })
    .from(clinic)
    .leftJoin(subscription, eq(subscription.clinicId, clinic.id))
    .leftJoin(patient, eq(patient.clinicId, clinic.id))
    .groupBy(clinic.id, subscription.status);

  let mrrEstimadoCentavos = 0;
  let clinicasAtivas = 0;
  let pacientesCobraveisTotais = 0;
  let clinicasEmTrial = 0;
  let clinicasIsentas = 0;

  for (const row of rows) {
    const { status } = calcularStatusTrial(
      row.isentoTrial,
      row.trialComecoEm,
      row.trialDias,
      row.criadoEm,
      row.subStatus,
    );

    pacientesCobraveisTotais += row.pacientesAtivosCount;

    if (status === "isenta") {
      clinicasIsentas += 1;
      clinicasAtivas += 1;
    } else if (status === "ativa") {
      clinicasAtivas += 1;
      mrrEstimadoCentavos += calcularMensalidadeCentavos(row.pacientesAtivosCount);
    } else if (status === "trial") {
      clinicasEmTrial += 1;
      mrrEstimadoCentavos += calcularMensalidadeCentavos(row.pacientesAtivosCount);
    }
  }

  return {
    mrrEstimadoCentavos,
    clinicasAtivas,
    pacientesCobraveisTotais,
    clinicasEmTrial,
    clinicasIsentas,
  };
}

/**
 * Retorna a listagem de clínicas com metadados e faturamento estimado.
 */
export async function getSuperAdminClinicas(opcoes?: {
  busca?: string;
  ordenacao?: "receita_desc" | "criado_em_desc" | "pacientes_desc";
}): Promise<SuperAdminClinicaItem[]> {
  const busca = opcoes?.busca?.trim();

  let query = authDb
    .select({
      id: clinic.id,
      nome: clinic.nome,
      criadoEm: clinic.criadoEm,
      isentoTrial: clinic.isentoTrial,
      trialComecoEm: clinic.trialComecoEm,
      trialDias: clinic.trialDias,
      donoNome: appUser.name,
      donoEmail: appUser.email,
      subStatus: subscription.status,
      pacientesAtivosCount: sql<number>`count(${patient.id}) filter (where ${patient.arquivadoEm} is null)::int`,
    })
    .from(clinic)
    .leftJoin(appUser, eq(appUser.id, clinic.responsavelContaId))
    .leftJoin(subscription, eq(subscription.clinicId, clinic.id))
    .leftJoin(patient, eq(patient.clinicId, clinic.id))
    .groupBy(clinic.id, appUser.id, subscription.status);

  if (busca) {
    query = query.where(
      or(ilike(clinic.nome, `%${busca}%`), ilike(appUser.email, `%${busca}%`)),
    ) as typeof query;
  }

  const rows = await query;

  const resultado: SuperAdminClinicaItem[] = rows.map((row) => {
    const { status, diasRestantes } = calcularStatusTrial(
      row.isentoTrial,
      row.trialComecoEm,
      row.trialDias,
      row.criadoEm,
      row.subStatus,
    );

    const valorEstimadoCentavos = status === "isenta" ? 0 : calcularMensalidadeCentavos(row.pacientesAtivosCount);

    return {
      id: row.id,
      nome: row.nome,
      donoNome: row.donoNome,
      donoEmail: row.donoEmail,
      criadoEm: row.criadoEm,
      status,
      pacientesAtivosCount: row.pacientesAtivosCount,
      valorEstimadoCentavos,
      diasTrialRestantes: diasRestantes,
    };
  });

  const ordenacao = opcoes?.ordenacao || "criado_em_desc";
  if (ordenacao === "receita_desc") {
    resultado.sort((a, b) => b.valorEstimadoCentavos - a.valorEstimadoCentavos);
  } else if (ordenacao === "pacientes_desc") {
    resultado.sort((a, b) => b.pacientesAtivosCount - a.pacientesAtivosCount);
  } else {
    resultado.sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());
  }

  return resultado;
}

/**
 * Retorna dados de saúde das integrações (webhooks Asaas e alertas de risco).
 */
export async function getSuperAdminSaude(): Promise<SuperAdminSaude> {
  const [webhookCountRow] = await authDb
    .select({ total: count() })
    .from(asaasWebhookEvent);

  const ultimosWebhooks = await authDb
    .select({
      id: asaasWebhookEvent.id,
      asaasEventId: asaasWebhookEvent.asaasEventId,
      evento: asaasWebhookEvent.evento,
      processadoEm: asaasWebhookEvent.processadoEm,
    })
    .from(asaasWebhookEvent)
    .orderBy(desc(asaasWebhookEvent.processadoEm))
    .limit(10);

  const [alertaCountRow] = await authDb
    .select({ total: count() })
    .from(alertaRiscoClinico);

  const ultimosAlertas = await authDb
    .select({
      id: alertaRiscoClinico.id,
      clinicId: alertaRiscoClinico.clinicId,
      nivel: alertaRiscoClinico.severidade,
      criadoEm: alertaRiscoClinico.criadoEm,
    })
    .from(alertaRiscoClinico)
    .orderBy(desc(alertaRiscoClinico.criadoEm))
    .limit(10);

  return {
    webhooksAsaas: {
      totalRecebidos: Number(webhookCountRow?.total || 0),
      ultimosEventos: ultimosWebhooks,
    },
    alertasRisco: {
      totalAlertas: Number(alertaCountRow?.total || 0),
      ultimosAlertas,
    },
  };
}
