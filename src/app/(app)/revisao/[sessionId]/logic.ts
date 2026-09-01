import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireRole, RoleError } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { evidence, extraction, reinforcerProfile, session } from "@/db/schema";
import { comEscrita, type BloqueioConta } from "@/lib/billing/guard-escrita";
import { desarquivarPacienteSeArquivado } from "@/lib/patient/desarquivamento";
import {
  drizzleMaterializarQueries,
  materializarSnapshot,
} from "@/lib/evidence/materializar";
import {
  type Alvo,
  drizzleResolverQueries,
  resolverAlvoParaFks,
} from "@/lib/evidence/resolver";
import { podeAutoValidar } from "@/lib/sessao/aprovacao";
import { avaliarFriccao } from "@/lib/extraction/review-policy";

// ─── Colapso da aprovação (T07, spec R-07/R-10/R-11, §3.5) ─────────────────
// Quando `podeAutoValidar(ctx, sessão)` é true (coordenador === terapeuta da
// sessão), a MESMA aprovação da extração já grava o carimbo de
// `evidence_revision` que hoje só nasceria numa segunda visita a /validacao.
// Fricção alta continua exigindo justificativa escrita (R-10) — sem ela a
// aprovação inteira é recusada ANTES de qualquer escrita (checagem faz uma
// leitura própria, fora da transação de mutação, para poder barrar cedo sem
// deixar a extração transicionada e a evidência travada sem carimbo).
type ColapsoAprovacao = {
  colapsa: boolean;
  friccaoExige: boolean;
  justificativa: string | undefined;
};

async function resolverColapso(
  ctx: TenantContext,
  extractionId: string,
  justificativaColapso: string | undefined,
): Promise<{ error: string } | ColapsoAprovacao> {
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .select({
        confianca: extraction.confianca,
        inconsistenteComHistorico: extraction.inconsistenteComHistorico,
        terapeutaId: session.terapeutaId,
      })
      .from(extraction)
      .innerJoin(session, eq(session.id, extraction.sessionId))
      .where(eq(extraction.id, extractionId)),
  );
  if (!row) {
    // Extração não encontrada — segue para `transicionar`, que devolve o erro
    // de concorrência/CAS padrão sem que a checagem de colapso precise repetir
    // essa lógica.
    return { colapsa: false, friccaoExige: false, justificativa: undefined };
  }
  const colapsa = podeAutoValidar(ctx, { terapeutaId: row.terapeutaId });
  if (!colapsa) {
    return { colapsa: false, friccaoExige: false, justificativa: undefined };
  }
  const friccao = avaliarFriccao({
    confianca: row.confianca,
    inconsistenteComHistorico: row.inconsistenteComHistorico,
  });
  const justificativa = justificativaColapso?.trim();
  if (friccao.exigeFriccao && !justificativa) {
    return {
      error:
        "Fricção alta exige justificativa escrita antes de aprovar — mesmo aprovando a própria sessão.",
    };
  }
  return { colapsa: true, friccaoExige: friccao.exigeFriccao, justificativa };
}

// ─── Inserção de `evidence` on-approve (Fase 4 · §4 da spec de resolução
// slug→UUID) ───────────────────────────────────────────────────────────────
// Até a Fase 4, só `scripts/backfill-evidence.ts` gravava `evidence`. Agora a
// própria aprovação/edição grava — 1 linha por alvo de `alvos[]`, no grão de
// alvo (`alvo_ordinal` = posição no array), reaproveitando o resolvedor
// compartilhado. Roda DENTRO da mesma transação da revisão (RLS de
// `evidence_insert` já libera terapeuta dono + coordenador da equipe — ver
// db/migrations/0016_fase4_session_snapshot_rls.sql).

type EvidenciaConteudo = {
  alvos?: Alvo[];
  [key: string]: unknown;
};

type ExtracaoAprovadaRow = {
  id: string;
  sessionId: string;
  subtipo: string;
  payload: unknown;
  payloadEditado: unknown;
};

// ─── Inserção de `reinforcer_profile` on-approve (Fase 4 · 4C.1) ───────────
// Perfil vivo de reforçadores (modelo-de-dados.md §1.4): 1 linha por
// OBSERVAÇÃO (append-per-observation), nunca upsert-por-item — preserva
// recência + valência como série, para que `saciado` possa demover um item
// visto antes como reforçador forte. O Briefing lê most-recent-per-item
// depois. Mesmo padrão de idempotência de `evidence` (chave estável,
// discriminador de re-aprovação), aqui `(extraction_id, item_atividade)`.
type ReinforcerValencia = "alta" | "baixa" | "saciado";
const REINFORCER_VALENCIAS: readonly ReinforcerValencia[] = [
  "alta",
  "baixa",
  "saciado",
];
type PreferenciaReforcadorConteudo =
  { item_atividade?: string; valencia?: string } | null | undefined;

async function inserirReforcadoresOnApprove(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  ctx: TenantContext,
  row: ExtracaoAprovadaRow,
  sess: { patientId: string; numero: number | null },
): Promise<void> {
  if (row.subtipo !== "preferencia_reforcador") return;
  if (sess.numero == null) return; // mesma trava de session ainda não consolidada (ver evidence acima)

  const conteudo = (row.payloadEditado ?? row.payload) as {
    preferencia_reforcador?: PreferenciaReforcadorConteudo;
  };
  const pref = conteudo?.preferencia_reforcador;
  const itemAtividade = pref?.item_atividade?.trim();
  const valenciaBruta = pref?.valencia;
  if (!itemAtividade || !valenciaBruta) return;
  if (!REINFORCER_VALENCIAS.includes(valenciaBruta as ReinforcerValencia))
    return;
  const valencia = valenciaBruta as ReinforcerValencia;

  await tx
    .insert(reinforcerProfile)
    .values({
      extractionId: row.id,
      patientId: sess.patientId,
      sessionId: row.sessionId,
      sessionNumero: sess.numero,
      itemAtividade,
      valencia,
    })
    // idempotente: (extraction_id, item_atividade) é a chave — re-aprovar (ou
    // reprocessar) não duplica.
    .onConflictDoNothing({
      target: [reinforcerProfile.extractionId, reinforcerProfile.itemAtividade],
    });
}

async function inserirEvidenciasOnApprove(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  ctx: TenantContext,
  row: ExtracaoAprovadaRow,
  colapso: ColapsoAprovacao,
): Promise<void> {
  const [sess] = await tx
    .select({
      patientId: session.patientId,
      numero: session.numeroSequencialPaciente,
    })
    .from(session)
    .where(eq(session.id, row.sessionId));
  if (!sess) return;

  // #174 regra 6: aprovar evidência clínica desarquiva o paciente se arquivado
  await desarquivarPacienteSeArquivado(
    tx,
    ctx,
    sess.patientId,
    "aprovacao_evidencia",
  );

  // ⚠️ BLINDAGEM DE ADVISORY LOCK: Lock por paciente para serializar recomputações concorrentes de snapshot.
  // Nenhuma chamada externa lenta (como APIs de IA ou rede) pode ocorrer após a aquisição deste lock.
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${sess.patientId}::text, 0))`,
  );

  if (sess.numero == null) {
    // TODO(Fase 4): sessão ainda não consolidada (numero_sequencial_paciente
    // nulo) — `evidence.session_numero` é NOT NULL, não dá pra inserir agora.
    // A aprovação pode acontecer antes da consolidação da sessão (revisão
    // assíncrona); quando a sessão for consolidada depois, o backfill
    // (scripts/backfill-evidence.ts) cobre a lacuna retroativamente. Não
    // falha a aprovação por causa disso — só registra e segue.
    console.warn(
      `evidence: extração ${row.id} aprovada, mas sessão ${row.sessionId} ainda sem numero_sequencial_paciente — evidence/reinforcer_profile NÃO inseridos agora (backfill cobre evidence depois).`,
    );
    return;
  }

  await inserirReforcadoresOnApprove(tx, ctx, row, sess);

  if (row.subtipo !== "evidencia") return;

  const conteudo = (row.payloadEditado ?? row.payload) as {
    evidencia?: EvidenciaConteudo | null;
  };
  const evidenciaObj = conteudo?.evidencia;
  const alvos = Array.isArray(evidenciaObj?.alvos) ? evidenciaObj!.alvos! : [];
  if (alvos.length === 0) return;

  const resolverQueries = drizzleResolverQueries(tx);
  const { alvos: _omit, ...evidenciaSemAlvos } = evidenciaObj ?? {};

  for (let ordinal = 0; ordinal < alvos.length; ordinal++) {
    const alvo = alvos[ordinal]!;
    const {
      protocolId,
      goalId,
      milestoneId,
      protocolSlug,
      dominioId,
      goalRef,
    } = await resolverAlvoParaFks(
      resolverQueries,
      { clinicId: ctx.clinicId, patientId: sess.patientId },
      alvo,
    );
    // classificacao_original: cópia congelada do alvo aprovado, mesclada com o
    // conteúdo clínico de `evidencia` (sem o array `alvos` completo, que não é
    // escopo desta linha) — mesmo padrão do backfill.
    const classificacaoOriginal = { ...evidenciaSemAlvos, alvo };

    const [inserida] = await tx
      .insert(evidence)
      .values({
        extractionId: row.id,
        patientId: sess.patientId,
        sessionId: row.sessionId,
        sessionNumero: sess.numero,
        alvoOrdinal: ordinal,
        protocolSlug,
        dominioId,
        goalRef,
        protocolId,
        goalId,
        milestoneId,
        classificacaoOriginal,
        aprovadoPor: ctx.userId,
      })
      // idempotente: (extraction_id, alvo_ordinal) é a chave — re-aprovar (ou
      // reprocessar) não duplica.
      .onConflictDoNothing({
        target: [evidence.extractionId, evidence.alvoOrdinal],
      })
      .returning({ id: evidence.id });

    // Colapso da aprovação (R-07/R-10/R-11, §3.5): coordenador === terapeuta
    // da sessão → o mesmo gesto já grava o carimbo de `evidence_revision`
    // ("confirmar") que hoje só nasceria numa segunda visita a /validacao.
    // Só roda quando `evidence` foi de fato inserida agora (sem `inserida`,
    // ou é reaprovação idempotente, ou a linha nem chegou a existir — nos
    // dois casos não há evidência nova para carimbar, e carimbar de novo
    // violaria R-11: "não registrar duas vezes o mesmo julgamento").
    if (inserida && colapso.colapsa) {
      await tx.execute(sql`
        INSERT INTO evidence_revision (evidence_id, acao, classificacao_anterior, classificacao_nova, justificativa, autor_id)
        VALUES (${inserida.id}, 'confirmar', ${JSON.stringify(classificacaoOriginal)}::jsonb, NULL, ${
          colapso.justificativa ??
          "Aprovado e confirmado pelo mesmo profissional (terapeuta e coordenador da sessão) — carimbo único."
        }, ${ctx.userId}::uuid)
      `);
    }
  }

  // Materialização real (4B — segmentação/repertório em TS puro, ver
  // src/lib/evidence/materializar.ts). Recompute a partir de `sess.numero`
  // (a sessão recém-aprovada) em diante, na mesma transação da inserção de
  // evidence acima.
  await materializarSnapshot(
    drizzleMaterializarQueries(tx),
    sess.patientId,
    sess.numero,
  );
}

// Revisão humana das extrações sugeridas pela IA (Fase 3 Plano 2). Cada ação
// transiciona uma extração `sugerida` ou `erro_validacao` para um desfecho de revisão. RLS
// (extraction_update, 0006) restringe ao terapeuta dono da sessão; requireRole
// barra recepção/coordenação (quem revisa é o terapeuta que conduziu).
// A sugestão ORIGINAL da IA (payload) nunca é sobrescrita — edições vão em
// payload_editado (auditoria Camada 1). Contadores de candidatura (Fase 4)
// deliberadamente NÃO são tocados aqui (máquina dormente até a Fase 4).

const idSchema = z.object({ extractionId: z.string().uuid() });

// `bloqueioConta` viaja junto de `error` (e não no lugar dele) porque a tela de
// revisão já sabe renderizar `error`; sem o campo estruturado ela não teria como
// distinguir "conta em somente-leitura" (CTA de ativação) de erro de validação.
export type ReviewResult = {
  error?: string;
  ok?: boolean;
  bloqueioConta?: BloqueioConta;
};

async function transicionar(
  ctx: TenantContext,
  extractionId: string,
  versaoCliente: number,
  set: Record<string, unknown>,
  colapso: ColapsoAprovacao = {
    colapsa: false,
    friccaoExige: false,
    justificativa: undefined,
  },
): Promise<ReviewResult> {
  requireRole(ctx, "terapeuta", "coordenador");
  let success = false;
  let errorMsg = "";

  try {
    const rows = await withTenant(ctx, async (tx) => {
      // ⚠️ OCC: A query de mutação incrementa a versão de forma atômica e confere com a versão vista pelo cliente
      const updated = await tx
        .update(extraction)
        .set({
          ...set,
          revisadoPor: ctx.userId,
          revisadoEm: new Date(),
          versao: sql`${extraction.versao} + 1`,
        })
        .where(
          and(
            eq(extraction.id, extractionId),
            eq(extraction.versao, versaoCliente),
            sql`${extraction.estado} IN ('sugerida', 'erro_validacao')`,
          ),
        )
        .returning({
          id: extraction.id,
          sessionId: extraction.sessionId,
          subtipo: extraction.subtipo,
          payload: extraction.payload,
          payloadEditado: extraction.payloadEditado,
        });

      if (updated.length === 0) {
        return [];
      }

      const novoEstado = set.estado;
      if (novoEstado === "aprovada" || novoEstado === "editada") {
        await inserirEvidenciasOnApprove(tx, ctx, updated[0]!, colapso);
      }
      success = true;
      return updated;
    });

    if (!success) {
      return { ok: false, error: "CONCURRENCY_ERROR" };
    }
    return { ok: true };
  } catch (err: any) {
    console.error("Erro na transição da extração:", err);
    errorMsg = err instanceof Error ? err.message : String(err);

    // DLQ / Dead-Letter State: Se o pipeline quebrar, movemos a extração para 'erro_validacao' de forma autônoma
    try {
      await withTenant(ctx, async (tx) => {
        await tx
          .update(extraction)
          .set({
            estado: "erro_validacao",
            payloadEditado: { error: errorMsg },
            versao: sql`${extraction.versao} + 1`,
          })
          .where(eq(extraction.id, extractionId));
      });
    } catch (dbErr) {
      console.error("Falha ao persistir erro de validação (DLQ):", dbErr);
    }

    return { error: `Erro de validação clínica: ${errorMsg}` };
  }
}

// ─── Guard de escrita por situação da conta (#163+#159) ────────────────────
// Revisar extração é escrita clínica comum, então entra na regra geral: conta
// em somente-leitura não avança a máquina de estados. O wrap fica aqui, na
// exportação do core, e não no `actions.ts`, para que os testes de integração
// — que chamam o core direto com `ctx` — exercitem o guard de verdade.

async function aprovarExtracaoCore(
  ctx: TenantContext,
  input: {
    extractionId: string;
    versao: number;
    justificativaColapso?: string;
  },
): Promise<ReviewResult> {
  const p = z
    .object({
      extractionId: z.string().uuid(),
      versao: z.number(),
      justificativaColapso: z.string().optional(),
    })
    .safeParse(input);
  if (!p.success) return { error: p.error.issues[0]!.message };
  const colapso = await resolverColapso(
    ctx,
    p.data.extractionId,
    p.data.justificativaColapso,
  );
  if ("error" in colapso) return { error: colapso.error };
  return transicionar(
    ctx,
    p.data.extractionId,
    p.data.versao,
    { estado: "aprovada" },
    colapso,
  );
}

export const aprovarExtracao = comEscrita(aprovarExtracaoCore);

async function descartarExtracaoCore(
  ctx: TenantContext,
  input: { extractionId: string; versao: number },
): Promise<ReviewResult> {
  const p = z
    .object({ extractionId: z.string().uuid(), versao: z.number() })
    .safeParse(input);
  if (!p.success) return { error: p.error.issues[0]!.message };
  return transicionar(ctx, p.data.extractionId, p.data.versao, {
    estado: "descartada",
  });
}

// Descartar também escreve (transição + `revisado_por`/`revisado_em`), então
// não é isento por ser "a ação negativa" — o que conta é tocar o banco.
export const descartarExtracao = comEscrita(descartarExtracaoCore);

const editarSchema = z.object({
  extractionId: z.string().uuid(),
  payloadEditado: z.record(z.unknown()),
  versao: z.number(),
  justificativaColapso: z.string().optional(),
});

async function editarExtracaoCore(
  ctx: TenantContext,
  input: {
    extractionId: string;
    payloadEditado: Record<string, unknown>;
    versao: number;
    justificativaColapso?: string;
  },
): Promise<ReviewResult> {
  const p = editarSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]!.message };
  const colapso = await resolverColapso(
    ctx,
    p.data.extractionId,
    p.data.justificativaColapso,
  );
  if ("error" in colapso) return { error: colapso.error };
  return transicionar(
    ctx,
    p.data.extractionId,
    p.data.versao,
    {
      estado: "editada",
      payloadEditado: p.data.payloadEditado,
    },
    colapso,
  );
}

export const editarExtracao = comEscrita(editarExtracaoCore);
