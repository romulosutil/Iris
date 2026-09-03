import "server-only";
import { desc, eq } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { clinic, tccRpdEntry } from "@/db/schema";
import { comEscrita, type BloqueioConta } from "@/lib/billing/guard-escrita";
import { desarquivarPacienteSeArquivado } from "@/lib/patient/desarquivamento";
import { registrarAlertaRiscoRPD } from "@/lib/risco/registrar";

import {
  DISTORCOES_COGNITIVAS_OPCOES,
  DISTORCOES_COGNITIVAS_SLUGS,
  salvarRpdSchema,
  type SalvarRpdInput,
} from "./constants";
import { detectarSinaisDeRiscoRPD } from "./deteccao-risco";
import { logarErroSemPII } from "@/lib/observabilidade/logar-erro";

export {
  DISTORCOES_COGNITIVAS_OPCOES,
  DISTORCOES_COGNITIVAS_SLUGS,
  salvarRpdSchema,
  type SalvarRpdInput,
};

type RpdState = {
  error?: string;
  bloqueioConta?: BloqueioConta;
  id?: string;
  /** #391 — erro ao REGISTRAR o alerta de risco (não ao salvar o RPD). O RPD
   * já foi salvo com sucesso quando este campo aparece; a UI precisa avisar
   * o terapeuta que o alerta não subiu, senão ele presume que a clínica foi
   * notificada e não foi. */
  alertaRiscoErro?: string;
};

export type TxDeTenant = Parameters<Parameters<typeof withTenant>[1]>[0];

/**
 * #389 — taxonomia de distorções é config por clínica (R19, não enum/CHECK
 * fixo). Rejeita slug fora da lista da clínica ANTES do insert: um erro de
 * validação não pode gravar linha parcial. Exportado para ser reusado por
 * `sugestoes.ts` (#392, `aprovarRPDSugestao`) — mesma regra, não duplicar a
 * checagem contra `clinic.taxonomia_distorcoes`.
 */
export async function validarTaxonomiaDistorcoes(
  tx: TxDeTenant,
  ctx: TenantContext,
  distorcoes: string[] | null,
): Promise<string | undefined> {
  if (!distorcoes) return undefined;
  const [clinicRow] = await tx
    .select({ taxonomiaDistorcoes: clinic.taxonomiaDistorcoes })
    .from(clinic)
    .where(eq(clinic.id, ctx.clinicId));
  const taxonomia = (clinicRow?.taxonomiaDistorcoes as string[]) ?? [];
  const slugInvalido = distorcoes.find((slug) => !taxonomia.includes(slug));
  if (slugInvalido) {
    return `Distorção "${slugInvalido}" não pertence à taxonomia da clínica.`;
  }
  return undefined;
}

async function salvarRPDCore(
  ctx: TenantContext,
  input: SalvarRpdInput,
): Promise<RpdState> {
  requireRole(ctx, "coordenador", "terapeuta");
  const parsed = salvarRpdSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]!.message };
  }
  const d = parsed.data;
  const distorcoes =
    d.distorcoesCognitivas && d.distorcoesCognitivas.length > 0
      ? d.distorcoesCognitivas
      : null;

  try {
    const resultado = await withTenant(ctx, async (tx) => {
      const erroTaxonomia = await validarTaxonomiaDistorcoes(
        tx,
        ctx,
        distorcoes,
      );
      if (erroTaxonomia) return { error: erroTaxonomia };

      const [row] = await tx
        .insert(tccRpdEntry)
        .values({
          clinicId: ctx.clinicId,
          patientId: d.patientId,
          sessionId: d.sessionId ?? null,
          situacao: d.situacao,
          pensamentoAutomatico: d.pensamentoAutomatico,
          emocao: d.emocao,
          intensidade: d.intensidade,
          credibilidadeInicial: d.credibilidadeInicial ?? null,
          evidenciasFavor: d.evidenciasFavor ?? null,
          evidenciasContra: d.evidenciasContra ?? null,
          respostaRacional: d.respostaRacional ?? null,
          credibilidadeAlternativa: d.credibilidadeAlternativa ?? null,
          distorcoesCognitivas: distorcoes,
          comportamentoResultante: d.comportamentoResultante ?? null,
          intensidadePos: d.intensidadePos ?? null,
          criadoPor: ctx.userId,
        })
        .returning({ id: tccRpdEntry.id });

      await desarquivarPacienteSeArquivado(
        tx,
        ctx,
        d.patientId,
        "registro_clinico",
      );

      return { id: row!.id };
    });

    if ("error" in resultado) {
      return resultado;
    }

    // #391 — varredura determinística de risco DEPOIS do INSERT commitar
    // (fora da transação de escrita do RPD), mesmo padrão usado em
    // `diario/[sessionId]/logic.ts` (Fase D, R20/R5-TC): o RPD já está
    // salvo, uma falha ao registrar o alerta não pode derrubar isso — só
    // aparece no retorno para a UI, para o terapeuta saber que precisa agir.
    // Idempotência garantida no banco: `app_criar_alerta_risco` deduplica por
    // `(origem, rpd_entry_id, trecho_fonte, categoria, severidade)`. Como RPD
    // é insert-only e gera id único imutável, re-execuções não duplicam alertas.
    const sinais = detectarSinaisDeRiscoRPD({
      situacao: d.situacao,
      pensamentoAutomatico: d.pensamentoAutomatico,
      evidenciasFavor: d.evidenciasFavor,
      evidenciasContra: d.evidenciasContra,
      respostaRacional: d.respostaRacional,
      comportamentoResultante: d.comportamentoResultante,
    });

    let alertaRiscoErro: string | undefined;
    for (const sinal of sinais) {
      const r = await registrarAlertaRiscoRPD(ctx, {
        patientId: d.patientId,
        rpdEntryId: resultado.id,
        responsavelId: ctx.userId,
        sinal: {
          categoria: sinal.categoria,
          severidade: sinal.severidade,
          certeza: sinal.certeza,
          trecho_fonte: sinal.trechoFonte,
          detalhe: sinal.detalhe,
        },
      });
      if ("erro" in r) {
        // Não interrompe o loop: se as duas categorias casaram, tenta
        // registrar as duas mesmo que uma falhe — mas guarda o último erro
        // para reportar.
        alertaRiscoErro = r.erro;
      }
    }

    return alertaRiscoErro
      ? { id: resultado.id, alertaRiscoErro }
      : { id: resultado.id };
  } catch (err) {
    logarErroSemPII("salvarRPD:", err);
    return { error: "Não foi possível salvar o RPD." };
  }
}

export const salvarRPD = comEscrita(salvarRPDCore);

export async function obterRPDEntries(ctx: TenantContext, patientId: string) {
  requireRole(ctx, "coordenador", "terapeuta", "admin_recepcao");
  return await withTenant(ctx, async (tx) => {
    return await tx
      .select()
      .from(tccRpdEntry)
      .where(eq(tccRpdEntry.patientId, patientId))
      .orderBy(desc(tccRpdEntry.criadoEm));
  });
}
