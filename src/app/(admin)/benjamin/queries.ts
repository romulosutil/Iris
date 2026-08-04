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

/**
 * ## Por que o MRR daqui é ESTIMATIVA, e qual é exatamente a divergência
 *
 * O critério de faturamento real (migração 0075, função `billing_apurar_ciclo`)
 * é: fatura-se a ficha **(a)** cadastrada dentro do ciclo **OU (b)** com
 * interação registrada nele (sessão agendada, check-in, evolução em prontuário
 * ou evidência aprovada). O critério **(c)** "não arquivado" SAIU.
 *
 * As queries abaixo continuam usando **(c)**. Isso é deliberado, por dois
 * motivos que pesam mais que a precisão do número:
 *
 * 1. **(a)+(b) só existe dentro de um ciclo.** A apuração real é
 *    `billing_apurar_ciclo(cycle_id)` — recebe uma linha de `billing_cycle` e
 *    lê a janela `[inicio, fim)` dela. Clínica em trial, isenta ou recém-criada
 *    não tem ciclo nenhum aberto, e o backoffice precisa mostrar uma linha para
 *    todas elas. Não existe número (a)+(b) honesto para quem não tem ciclo.
 * 2. **Reimplementar o predicado em Drizzle criaria a QUARTA definição.** O que
 *    a 0075 foi consertar foi justamente haver três definições incompatíveis em
 *    produção (a função SQL, o FAQ público e esta query). Copiar o predicado
 *    para cá o deixaria livre para derivar do SQL na próxima mudança.
 *
 * **A divergência, nas duas direções** (não é um viés de mão única):
 * - **superestima** quando há ficha na base sem movimento no ciclo — ela conta
 *   aqui e não seria faturada. É o caso dominante e o de maior magnitude:
 *   clínica em recesso aparece com MRR cheio aqui e fatura R$ 0,00 de verdade.
 * - **subestima** quando uma ficha foi arquivada depois de ter tido movimento
 *   no ciclo — ela é faturada e não aparece aqui.
 *
 * Quem quiser o número exato de um período fechado deve ler `billing_cycle`
 * (`valor_centavos`) e `billing_cycle_patient`, que são o memorial auditável da
 * fatura efetivamente emitida. Esta tela é termômetro comercial, não fatura.
 */
export interface SuperAdminKpis {
  /**
   * Teto de MRR pelo critério (c). Ver o bloco acima: para clínica em recesso
   * este número é cheio e a fatura real é zero.
   */
  mrrEstimadoCentavos: number;
  clinicasAtivas: number;
  /** Fichas existentes na base e não arquivadas — NÃO é o que será faturado. */
  fichasNaBaseTotais: number;
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
  fichasNaBaseCount: number;
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
      fichasNaBaseCount: sql<number>`count(${patient.id}) filter (where ${patient.arquivadoEm} is null)::int`,
    })
    .from(clinic)
    .leftJoin(subscription, eq(subscription.clinicId, clinic.id))
    .leftJoin(patient, eq(patient.clinicId, clinic.id))
    .groupBy(clinic.id, subscription.status);

  let mrrEstimadoCentavos = 0;
  let clinicasAtivas = 0;
  let fichasNaBaseTotais = 0;
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

    fichasNaBaseTotais += row.fichasNaBaseCount;

    if (status === "isenta") {
      clinicasIsentas += 1;
      clinicasAtivas += 1;
    } else if (status === "ativa") {
      clinicasAtivas += 1;
      mrrEstimadoCentavos += calcularMensalidadeCentavos(row.fichasNaBaseCount);
    } else if (status === "trial") {
      clinicasEmTrial += 1;
      mrrEstimadoCentavos += calcularMensalidadeCentavos(row.fichasNaBaseCount);
    }
  }

  return {
    mrrEstimadoCentavos,
    clinicasAtivas,
    fichasNaBaseTotais,
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
      fichasNaBaseCount: sql<number>`count(${patient.id}) filter (where ${patient.arquivadoEm} is null)::int`,
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

    const valorEstimadoCentavos = status === "isenta" ? 0 : calcularMensalidadeCentavos(row.fichasNaBaseCount);

    return {
      id: row.id,
      nome: row.nome,
      donoNome: row.donoNome,
      donoEmail: row.donoEmail,
      criadoEm: row.criadoEm,
      status,
      fichasNaBaseCount: row.fichasNaBaseCount,
      valorEstimadoCentavos,
      diasTrialRestantes: diasRestantes,
    };
  });

  const ordenacao = opcoes?.ordenacao || "criado_em_desc";
  if (ordenacao === "receita_desc") {
    resultado.sort((a, b) => b.valorEstimadoCentavos - a.valorEstimadoCentavos);
  } else if (ordenacao === "pacientes_desc") {
    resultado.sort((a, b) => b.fichasNaBaseCount - a.fichasNaBaseCount);
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
