import "server-only";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireRole, RoleError } from "@/auth/require-role";
import { codigoPg } from "@/db/pg-error";
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
import { conteudoDoSubtipo } from "@/lib/extraction/conteudo-subtipo";
import { avaliarFriccao } from "@/lib/extraction/review-policy";
import {
  CAMPO_EDITAVEL,
  camposEditaveisDe,
} from "@/lib/extraction/campos-editaveis";
import { logarErroSemPII } from "@/lib/observabilidade/logar-erro";
import { textoErroInterno } from "@/lib/copy/erros";

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
  /** Conteúdo EFETIVO já resolvido por `transicionar` (ver `conteudoEfetivo`). */
  conteudo: unknown;
  /** A transição saiu de `erro_validacao` (reaprovação depois do DLQ, #532). */
  reaprovacaoDeErro: boolean;
};

// ─── Recusas explícitas da transição (#532, Q-01/Q-03) ─────────────────────
// Lançadas DENTRO da transação: desfazem tudo (a extração volta ao estado e à
// versão de antes) e chegam ao cliente como código, sem passar pelo DLQ —
// não são quebra de pipeline, são pré-condição de negócio não atendida.
// Diferente da falha genérica (que vira `erro_validacao`), aqui o terapeuta
// tem o que fazer: consolidar a sessão, ou editar a extração com o alvo.
export type CodigoRecusa = "EVIDENCIA_VAZIA" | "SESSAO_SEM_NUMERO";

class TransicaoRecusada extends Error {
  constructor(readonly codigo: CodigoRecusa) {
    super(codigo);
    this.name = "TransicaoRecusada";
  }
}

// A leitura tolerante das duas formas do payload (flat/aninhada) mora em
// `@/lib/extraction/conteudo-subtipo` — FONTE ÚNICA, compartilhada com
// `scripts/backfill-evidence.ts`. Foi a cópia divergente entre este leitor e o
// backfill que produziu a deriva da #553.

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

  const pref = conteudoDoSubtipo(
    row.conteudo,
    "preferencia_reforcador",
  ) as PreferenciaReforcadorConteudo;
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
    // Sessão ainda não consolidada (numero_sequencial_paciente nulo) —
    // `evidence.session_numero` é NOT NULL. Até #532 (Q-03) isto só avisava
    // no log e a extração virava `aprovada` sem evidence, contando com um
    // backfill futuro — o mesmo silêncio que a auditoria apontou. Agora a
    // aprovação é RECUSADA e desfeita: consolidar a nota primeiro.
    throw new TransicaoRecusada("SESSAO_SEM_NUMERO");
  }

  await inserirReforcadoresOnApprove(tx, ctx, row, sess);

  if (row.subtipo !== "evidencia") return;

  const evidenciaObj = conteudoDoSubtipo(
    row.conteudo,
    "evidencia",
  ) as EvidenciaConteudo | null;
  const alvos = Array.isArray(evidenciaObj?.alvos) ? evidenciaObj!.alvos! : [];
  if (alvos.length === 0) {
    // Reaprovação depois de um `erro_validacao` (#532, Q-01): uma `evidencia`
    // que passou pelo DLQ e não tem alvo NÃO pode virar `aprovada` em
    // silêncio — era exatamente assim que o `{error}` no `payload_editado`
    // apagava a evidência. Aprovação direta de `sugerida` sem alvo segue
    // permitida (o schema do agente deixa `alvos` opcional; R8 pode não
    // mapear) — decisão registrada na PR, a validar com o Rômulo.
    if (row.reaprovacaoDeErro) throw new TransicaoRecusada("EVIDENCIA_VAZIA");
    return;
  }

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

  try {
    await withTenant(ctx, async (tx) => {
      // Estado de ONDE a transição parte. A leitura não precisa de lock: a
      // versão anda a cada transição, então se o estado mudar entre este
      // SELECT e o UPDATE abaixo, o CAS de `versao` devolve 0 linhas de
      // qualquer forma (a escolha de conteúdo nunca é aplicada a uma linha
      // que não seja exatamente a que o cliente viu).
      const [atual] = await tx
        .select({ estado: extraction.estado })
        .from(extraction)
        .where(eq(extraction.id, extractionId));
      const reaprovacaoDeErro = atual?.estado === "erro_validacao";

      // ⚠️ OCC: A query de mutação incrementa a versão de forma atômica e confere com a versão vista pelo cliente
      const updated = await tx
        .update(extraction)
        .set({
          ...set,
          revisadoPor: ctx.userId,
          revisadoEm: new Date(),
          versao: sql`${extraction.versao} + 1`,
          // sair de `erro_validacao` limpa o diagnóstico do DLQ (#532)
          erroValidacaoDetalhe: null,
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
        return;
      }
      const row = updated[0]!;

      // Conteúdo EFETIVO da aprovação (#532, Q-01):
      //  - edição (`set.payloadEditado`) → o que acabou de ser gravado;
      //  - reaprovação a partir de `erro_validacao` → o `payload` ORIGINAL da
      //    IA. O `payload_editado` de uma linha que passou pelo DLQ nunca é
      //    edição humana (a edição que falhou foi desfeita junto com a
      //    transação) — no máximo é o `{error}` que o DLQ antigo deixou;
      //  - demais → `payloadEditado ?? payload`, a regra do resto do produto.
      const conteudo =
        set.payloadEditado !== undefined
          ? set.payloadEditado
          : reaprovacaoDeErro
            ? row.payload
            : (row.payloadEditado ?? row.payload);

      const novoEstado = set.estado;
      if (novoEstado === "aprovada" || novoEstado === "editada") {
        await inserirEvidenciasOnApprove(
          tx,
          ctx,
          {
            id: row.id,
            sessionId: row.sessionId,
            subtipo: row.subtipo,
            conteudo,
            reaprovacaoDeErro,
          },
          colapso,
        );
      }
      success = true;
    });

    if (!success) {
      return { ok: false, error: "CONCURRENCY_ERROR" };
    }
    return { ok: true };
  } catch (err: unknown) {
    // Recusa explícita: a transação já foi desfeita (extração intacta, mesma
    // versão). Não é quebra de pipeline — não vai para o DLQ.
    if (err instanceof TransicaoRecusada) {
      return { ok: false, error: err.codigo };
    }

    // Nunca logar o erro inteiro: `DrizzleQueryError.message` carrega o SQL
    // com os params (= dado clínico). Só nome + SQLSTATE + hash da message,
    // que é o mesmo hash gravado no DLQ abaixo — correlação sem PHI.
    const detalhe = detalheDoErro(err);
    // S-10 (#531): nem no `erro_validacao_detalhe` nem na tela entra
    // `err.message` — é aqui que o `DrizzleQueryError` carrega o INSERT de
    // `evidence` com o conteúdo clínico nos params. O helper reduz o erro a
    // nome + SQLSTATE + hash; `detalhe` já é conjunto fechado de primitivos.
    logarErroSemPII("Erro na transição da extração:", err, {
      extractionId,
      ...detalhe,
    });

    // DLQ / Dead-Letter State (#532, Q-01): a extração vai para
    // `erro_validacao` com o diagnóstico em coluna PRÓPRIA — `payload_editado`
    // (conteúdo clínico efetivo) fica intacto, senão a reaprovação leria
    // `{error}` e viraria `aprovada` sem `evidence`. Guard de `versao`: a
    // transação que falhou foi desfeita, logo a linha ainda está na versão
    // que o cliente viu — se não estiver, outra transição venceu a corrida e
    // NÃO pode ser sobrescrita (uma `descartada` voltaria a `erro_validacao`).
    try {
      await withTenant(ctx, async (tx) => {
        const dlq = await tx
          .update(extraction)
          .set({
            estado: "erro_validacao",
            erroValidacaoDetalhe: detalhe,
            versao: sql`${extraction.versao} + 1`,
          })
          .where(
            and(
              eq(extraction.id, extractionId),
              eq(extraction.versao, versaoCliente),
            ),
          )
          .returning({ id: extraction.id });
        if (dlq.length === 0) {
          console.warn(
            `DLQ não gravado: extração ${extractionId} já saiu da versão ${versaoCliente} (transição concorrente venceu).`,
          );
        }
      });
    } catch (dbErr) {
      logarErroSemPII("Falha ao persistir erro de validação (DLQ):", dbErr, {
        extractionId,
      });
    }

    // Só a referência (hash) chega à tela: o SQLSTATE fica no log — o
    // terapeuta não tem o que fazer com um código do driver.
    return {
      error: `Erro de validação clínica (ref ${detalhe.hash}). A extração foi marcada como erro de validação; a equipe pode reaprovar depois de corrigida a causa.`,
    };
  }
}

/**
 * Diagnóstico gravado em `extraction.erro_validacao_detalhe` (#532):
 * `codigo` = SQLSTATE do driver quando houver (é o que diz "grant faltando",
 * "NOT NULL violada"…), senão o `name` do erro; `hash` = sha256 curto da
 * message, para casar com o log sem copiar a message (SQL + params = PHI).
 */
function detalheDoErro(err: unknown): {
  codigo: string;
  hash: string;
  quando: string;
} {
  // `codigoPg` lê `.code` na raiz OU em `.cause`: o Drizzle embrulha o
  // `PostgresError` em `DrizzleQueryError` e o SQLSTATE fica em `cause` —
  // ler só a raiz gravaria "DrizzleQueryError" em toda falha de produção
  // (achado da revisão pós-PR de #532).
  const e = err as { name?: unknown; message?: unknown };
  const codigo =
    codigoPg(err) ??
    (typeof e?.name === "string" && e.name ? e.name : "ERRO_DESCONHECIDO");
  const message =
    typeof e?.message === "string" ? e.message : String(err ?? "");
  const hash = createHash("sha256").update(message).digest("hex").slice(0, 12);
  return { codigo, hash, quando: new Date().toISOString() };
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

  // Merge autoritativo (#582 review): `payload_editado` é gravado INTEIRO (o
  // `set` de `transicionar` substitui a coluna, e é ele que vira o `conteudo`
  // efetivo lido por `inserirEvidenciasOnApprove`). O chamador só conhece as
  // chaves que ele mesmo edita — o form manda três campos, o caminho direto de
  // `preferencia_reforcador` manda item_atividade/valencia. Se o core gravasse
  // esse objeto parcial, todo o resto do conteúdo clínico (alvos, descricao,
  // etapas…) sumiria da versão efetiva — inclusive `alvos`, deixando a
  // inserção em `evidence` sem alvo nenhum. A base do merge é sempre o estado
  // do BANCO (`payload_editado ?? payload`), nunca nada vindo do cliente.
  //
  // Guard de subtipo: o subtipo de VERDADE também só existe no banco — um POST
  // forjado pode alegar "evidencia" numa extração `cadeia` e escrever
  // funcao/nivel_ajuda/resultado na raiz do payload errado. Os três campos de
  // `CAMPO_EDITAVEL` só passam se `camposEditaveisDe(subtipo real)` os permite.
  // Chaves fora desses três não são filtradas: o core também serve edições
  // diretas fora do diálogo genérico (`preferencia_reforcador`) — a recusa por
  // "subtipo sem campo editável" é responsabilidade do `actions.ts` (que sabe
  // que a requisição veio do diálogo dos três campos), não deste core.
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .select({
        subtipo: extraction.subtipo,
        payload: extraction.payload,
        payloadEditado: extraction.payloadEditado,
      })
      .from(extraction)
      .where(eq(extraction.id, p.data.extractionId)),
  );

  const base = row?.payloadEditado ?? row?.payload;
  const payloadEditado: Record<string, unknown> =
    base && typeof base === "object" && !Array.isArray(base)
      ? { ...(base as Record<string, unknown>) }
      : {};
  const camposPermitidos = row
    ? camposEditaveisDe(row.subtipo)
    : CAMPO_EDITAVEL;
  for (const [chave, valor] of Object.entries(p.data.payloadEditado)) {
    const ehCampoDoDialogo = (CAMPO_EDITAVEL as readonly string[]).includes(
      chave,
    );
    if (
      ehCampoDoDialogo &&
      !camposPermitidos.includes(chave as (typeof CAMPO_EDITAVEL)[number])
    ) {
      continue;
    }
    payloadEditado[chave] = valor;
  }

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
      payloadEditado,
    },
    colapso,
  );
}

export const editarExtracao = comEscrita(editarExtracaoCore);
