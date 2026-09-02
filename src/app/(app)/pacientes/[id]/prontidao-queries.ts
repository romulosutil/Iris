import "server-only";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import {
  anamnese,
  goal,
  instrumentoAplicacao,
  patientClinicalProfile,
  patientProtocol,
  sessionSnapshot,
} from "@/db/schema";
import type { FatosProntidao } from "@/lib/patient/prontidao";

/**
 * Fatos da prontidão, numa transação só e num bloco de `EXISTS`.
 *
 * Mesmo formato de `obterProgressoOnboarding` (`src/app/(app)/onboarding-queries.ts`):
 * os seis precisam enxergar a MESMA imagem do banco. Em seis idas, uma
 * prescrição concorrente apareceria para metade da resposta e a escada
 * piscaria entre dois estados.
 *
 * Toda leitura sai por `withTenant` (`app_role`, RLS ativa) — o isolamento é
 * do BANCO. Os subselects NÃO repetem filtro por clínica — quem filtra é a
 * policy. Acrescentá-lo aqui mascararia uma policy quebrada (mesma decisão,
 * com a mesma justificativa, de `onboarding-queries.ts`).
 *
 * D-A9: `goal`, `patient_protocol`, `anamnese`, `instrumento_aplicacao` e
 * `session_snapshot` têm policy de SELECT chaveada por papel e equipe
 * (`goal_select`, `db/migrations/0006_fase2_rls.sql:207` — `coordenador` OR
 * `app_is_on_team`). Chamar esta função com um papel fora de
 * {coordenador, terapeuta} — ou com um terapeuta fora da equipe do paciente —
 * devolve `false` para fatos que EXISTEM, não para fatos ausentes. Quem já
 * blinda isso é `montarProntidao` (`src/lib/patient/prontidao.ts`), que só
 * monta escada para {coordenador, terapeuta}; esta função nunca decide papel
 * sozinha.
 */
export async function obterFatosProntidao(
  ctx: TenantContext,
  patientId: string,
): Promise<FatosProntidao> {
  return withTenant(ctx, async (tx) => {
    const [linha] = await tx
      .select({
        temFichaClinica: sql<boolean>`EXISTS (
          SELECT 1 FROM ${patientClinicalProfile}
          WHERE ${patientClinicalProfile.patientId} = ${patientId}
        )`,
        temAnamnese: sql<boolean>`EXISTS (
          SELECT 1 FROM ${anamnese}
          WHERE ${anamnese.patientId} = ${patientId}
        )`,
        // Vigência aberta: protocolo desativado não tem marcos a pontuar.
        temProtocoloAtivo: sql<boolean>`EXISTS (
          SELECT 1 FROM ${patientProtocol}
          WHERE ${patientProtocol.patientId} = ${patientId}
            AND ${patientProtocol.desativadoEm} IS NULL
        )`,
        // Só 'ativa'. Rascunho não é alvo de resolução em `materializar.ts`, e
        // contá-lo destravaria o documentar sem destravar o dado.
        temMetaAtiva: sql<boolean>`EXISTS (
          SELECT 1 FROM ${goal}
          WHERE ${goal.patientId} = ${patientId}
            AND ${goal.estado} = 'ativa'
        )`,
        temInstrumentoAplicado: sql<boolean>`EXISTS (
          SELECT 1 FROM ${instrumentoAplicacao}
          WHERE ${instrumentoAplicacao.patientId} = ${patientId}
        )`,
        // Snapshot, não sessão: é ele que prova que a documentação virou dado
        // legível na evolução. Sessão consolidada sem snapshot é exatamente o
        // caso que esta feature existe para tornar impossível.
        temSessaoConsolidada: sql<boolean>`EXISTS (
          SELECT 1 FROM ${sessionSnapshot}
          WHERE ${sessionSnapshot.patientId} = ${patientId}
        )`,
      })
      .from(sql`(SELECT 1) AS uma_linha`);

    return {
      temFichaClinica: Boolean(linha?.temFichaClinica),
      temAnamnese: Boolean(linha?.temAnamnese),
      temProtocoloAtivo: Boolean(linha?.temProtocoloAtivo),
      temMetaAtiva: Boolean(linha?.temMetaAtiva),
      temInstrumentoAplicado: Boolean(linha?.temInstrumentoAplicado),
      temSessaoConsolidada: Boolean(linha?.temSessaoConsolidada),
    };
  });
}
