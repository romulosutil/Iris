import "server-only";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext, type Tx } from "@/db/rls";
import {
  audioCapture,
  clinic,
  extraction,
  goal,
  session,
  sessionNote,
  sessionProtocolScope,
} from "@/db/schema";
import { desarquivarPacienteSeArquivado } from "@/lib/patient/desarquivamento";
import { resolveProvider } from "@/lib/extraction/provider";
import type { ExtractionDraft } from "@/lib/extraction/provider";
import type { AlertaRiscoAgente } from "@/lib/extraction/agent-output-schema";
import {
  registrarAlertaRisco,
  registrarAlertaRiscoInstrumento,
  registrarAlertaRiscoRPDSugerido,
} from "@/lib/risco/registrar";
import { detectarSinaisDeRiscoRPD } from "@/app/(app)/pacientes/[id]/tcc/deteccao-risco";
import { loadCanonicalContext } from "@/lib/extraction/context-loader";
import { deveReextrair } from "@/lib/extraction/reextraction-policy";
import { traduzirErroDeConsentimento } from "@/lib/consent/erros";
import { diagnosticarBloqueioDeConsentimentoSeguro } from "@/lib/consent/diagnostico";
import { comEscrita, type BloqueioConta } from "@/lib/billing/guard-escrita";
import { asrHabilitado } from "@/lib/flags";
import { chaveClipe } from "@/lib/audio/local-store";
import { guardar } from "@/lib/asr/storage";

// ─── Guard de escrita por situação da conta (#163+#159) ────────────────────
// Todo o diário é escrita clínica: conta em somente-leitura (trial expirado,
// cancelada, pagamento em processamento) não grava nota, escopo, áudio nem
// consolida. O wrap fica na exportação deste core, e não no `actions.ts`,
// porque os testes de integração chamam o core direto com `ctx` — envolver na
// action deixaria a suíte inteira cega para o guard.
//
// Nada aqui é isento por segurança clínica: a isenção de `alertas-risco` e
// `clinica/emergencia` vale para a via de alerta, não para o registro de rotina.

/**
 * Traduz a recusa do banco em mensagem de consentimento, quando (e só quando)
 * o consentimento realmente a explica. Primeiro o tradutor puro (constraints e
 * RAISE EXCEPTION, que são inequívocos); depois, para a negação genérica de
 * RLS, o diagnóstico que PERGUNTA ao banco. `null` = ninguém explicou → o
 * chamador mantém o comportamento que tinha antes deste gate existir.
 */
async function mensagemDeConsentimento(
  ctx: TenantContext,
  err: unknown,
  alvo: { sessionId?: string },
): Promise<string | null> {
  return (
    traduzirErroDeConsentimento(err) ??
    (await diagnosticarBloqueioDeConsentimentoSeguro(ctx, alvo))
  );
}

// Draft de fallback quando a extração (LLM) falha: mantém a nota salva e marca
// pendente de reprocessamento (flow 2.4 dos wireframes) — nunca perde o diário.
const PENDENTE_DRAFT: ExtractionDraft = {
  subtipo: "pendente",
  trechoFonte: "",
  confianca: "baixa",
  inconsistenteComHistorico: false,
  parContrasteId: null,
  payload: { motivo: "extracao_falhou_retry" },
  estado: "pendente_reprocessamento",
};

const capturaSchema = z.object({
  sessionId: z.string().uuid(),
  texto: z.string().trim().min(1, "Escreva algo antes de salvar."),
  visibilityLevel: z.enum(["multidisciplinary", "discipline_only"]).optional(),
});

/**
 * Captura rápida de diário — texto livre do terapeuta durante/após a sessão.
 * O RLS (`session_note_insert`) exige que `ctx.userId` seja o terapeuta dono
 * da sessão; um terapeuta que não é dono cai no catch e recebe mensagem
 * genérica (RLS não deixa distinguir "não existe" de "sem permissão").
 */
async function capturarDiarioCore(
  ctx: TenantContext,
  input: {
    sessionId: string;
    texto: string;
    visibilityLevel?: "multidisciplinary" | "discipline_only";
  },
): Promise<{ error?: string; id?: string; bloqueioConta?: BloqueioConta }> {
  requireRole(ctx, "terapeuta");
  const parsed = capturaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  try {
    const row = await withTenant(ctx, async (tx) => {
      const [nota] = await tx
        .insert(sessionNote)
        .values({
          sessionId: parsed.data.sessionId,
          clinicId: ctx.clinicId,
          tipo: "captura_rapida",
          texto: parsed.data.texto,
          autorId: ctx.userId,
          visibilityLevel: parsed.data.visibilityLevel ?? "multidisciplinary",
        })
        .onConflictDoUpdate({
          target: [sessionNote.sessionId, sessionNote.tipo],
          set: {
            texto: parsed.data.texto,
            atualizadoEm: new Date(),
            ...(parsed.data.visibilityLevel
              ? { visibilityLevel: parsed.data.visibilityLevel }
              : {}),
          },
        })
        .returning({ id: sessionNote.id });

      // #174 regra 6, na MESMA transação da nota: ou o registro clínico e o
      // desarquivamento existem juntos, ou nenhum dos dois existe.
      const [sess] = await tx
        .select({ patientId: session.patientId })
        .from(session)
        .where(eq(session.id, parsed.data.sessionId));
      if (sess) {
        await desarquivarPacienteSeArquivado(
          tx,
          ctx,
          sess.patientId,
          "registro_clinico",
        );
      }

      return nota;
    });
    return { id: row!.id };
  } catch (err) {
    const msg = await mensagemDeConsentimento(ctx, err, {
      sessionId: parsed.data.sessionId,
    });
    if (msg) return { error: msg };
    console.error("capturarDiario:", err);
    return { error: "Não foi possível salvar a captura." };
  }
}

export const capturarDiario = comEscrita(capturarDiarioCore);

const escopoSchema = z.object({
  sessionId: z.string().uuid(),
  protocolIds: z.array(z.string().uuid()).min(1),
});

/**
 * Ajuste manual do escopo de protocolos de uma sessão — o terapeuta corrige
 * quando a inferência automática por disciplina errou. Marca `origem =
 * "ajustado_manualmente"` e `ajustadoPor = ctx.userId` para auditoria; o RLS
 * (`sps_insert`/`sps_update`) barra forjar `ajustadoPor` de outro usuário.
 */
async function corrigirEscopoProtocoloCore(
  ctx: TenantContext,
  input: { sessionId: string; protocolIds: string[] },
): Promise<{ error?: string; bloqueioConta?: BloqueioConta }> {
  requireRole(ctx, "terapeuta");
  const parsed = escopoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  try {
    await withTenant(ctx, async (tx) => {
      for (const protocolId of parsed.data.protocolIds) {
        await tx
          .insert(sessionProtocolScope)
          .values({
            sessionId: parsed.data.sessionId,
            protocolId,
            origem: "ajustado_manualmente",
            ajustadoPor: ctx.userId,
          })
          .onConflictDoUpdate({
            target: [
              sessionProtocolScope.sessionId,
              sessionProtocolScope.protocolId,
            ],
            set: { origem: "ajustado_manualmente", ajustadoPor: ctx.userId },
          });
      }

      const [sess] = await tx
        .select({ patientId: session.patientId })
        .from(session)
        .where(eq(session.id, parsed.data.sessionId));
      if (sess) {
        await desarquivarPacienteSeArquivado(
          tx,
          ctx,
          sess.patientId,
          "escopo_protocolo",
        );
      }
    });
    return {};
  } catch (err) {
    const msg = await mensagemDeConsentimento(ctx, err, {
      sessionId: parsed.data.sessionId,
    });
    if (msg) return { error: msg };
    console.error("corrigirEscopoProtocolo:", err);
    return { error: "Não foi possível ajustar os protocolos." };
  }
}

export const corrigirEscopoProtocolo = comEscrita(corrigirEscopoProtocoloCore);

const audioSchema = z.object({
  sessionId: z.string().uuid(),
  duracaoSegundos: z.number().int().positive().optional(),
});

/**
 * Registra que um áudio foi capturado localmente (IndexedDB) e ainda não foi
 * enviado. O `id` retornado é a chave usada pelo cliente para encontrar o
 * blob local — o upload real do objeto é de fase posterior.
 */
async function registrarAudioLocalCore(
  ctx: TenantContext,
  input: { sessionId: string; duracaoSegundos?: number },
): Promise<{ error?: string; id?: string; bloqueioConta?: BloqueioConta }> {
  requireRole(ctx, "terapeuta");
  const parsed = audioSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  try {
    const row = await withTenant(ctx, async (tx) => {
      const [audioRow] = await tx
        .insert(audioCapture)
        .values({
          sessionId: parsed.data.sessionId,
          clinicId: ctx.clinicId,
          statusUpload: "rascunho_local",
          duracaoSegundos: parsed.data.duracaoSegundos,
        })
        .returning({ id: audioCapture.id });

      const [sess] = await tx
        .select({ patientId: session.patientId })
        .from(session)
        .where(eq(session.id, parsed.data.sessionId));
      if (sess) {
        await desarquivarPacienteSeArquivado(
          tx,
          ctx,
          sess.patientId,
          "audio_local",
        );
      }

      return audioRow;
    });
    return { id: row!.id };
  } catch (err) {
    const msg = await mensagemDeConsentimento(ctx, err, {
      sessionId: parsed.data.sessionId,
    });
    if (msg) return { error: msg };
    console.error("registrarAudioLocal:", err);
    return { error: "Não foi possível registrar o áudio." };
  }
}

// Grava linha em `audio_capture` (mesmo que o blob ainda seja local) — é
// escrita, entra no guard.
export const registrarAudioLocal = comEscrita(registrarAudioLocalCore);

const clipeAsrSchema = z.object({
  ordem: z.number().int().nonnegative(),
  dados: z.instanceof(Uint8Array),
  contentType: z.string().optional(),
});

const enviarLoteAsrSchema = z.object({
  sessionId: z.string().uuid(),
  loteId: z.string().uuid(),
  clipes: z.array(clipeAsrSchema).min(1),
});

/**
 * Envia um lote de clipes de ditado de voz (#72, T09): insere N linhas em
 * `audio_capture` (mesmo `lote_id`, `ordem` preservada) FORA da fila, sobe
 * cada blob para o bucket efêmero (T04) e só então promove cada linha a
 * `asr_status = 'na_fila'` — ver a nota sobre a ordem abaixo. Devolve o
 * `loteId` IMEDIATAMENTE (R9) — a transcrição roda depois, assíncrona, via
 * fila/worker de outra task (T07).
 *
 * `loteId` vem do CLIENTE (`crypto.randomUUID()`), não é gerado aqui: é a
 * chave de idempotência do retry de rede (R24) — ver checagem abaixo.
 */
async function enviarLoteAsrCore(
  ctx: TenantContext,
  input: {
    sessionId: string;
    loteId: string;
    clipes: Array<{ ordem: number; dados: Uint8Array; contentType?: string }>;
  },
): Promise<{
  error?: string;
  loteId?: string;
  bloqueioConta?: BloqueioConta;
}> {
  requireRole(ctx, "terapeuta");
  // R21: trava de MATURIDADE do serviço faster-whisper (não é gate de LGPD).
  // Recusa ANTES de qualquer escrita ou upload — desligada, nem consome
  // storage nem enfileira nada que o worker nunca vai processar.
  if (!asrHabilitado()) {
    return { error: "Ditado de voz está temporariamente indisponível." };
  }
  const parsed = enviarLoteAsrSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const { sessionId, loteId, clipes } = parsed.data;

  try {
    // R24: reenvio do MESMO loteId (retry de rede do cliente) não duplica —
    // se já existe QUALQUER linha com esse lote_id NESTA sessão (RLS via
    // withTenant já isola por clínica; `sessionId` reduz falso-positivo
    // cross-sessão do mesmo `loteId`), devolve sucesso idempotente sem
    // inserir de novo nem re-subir os blobs.
    //
    // Este SELECT-antes-do-INSERT NÃO é atômico sozinho: duas chamadas
    // concorrentes (duplo clique, duas abas) podem passar aqui juntas antes
    // de qualquer uma inserir. O backstop real é o `UNIQUE(lote_id, ordem)`
    // (migração 0137, review pós-PR #72/T09) — o catch de `23505` logo
    // abaixo é o caminho que de fato garante R24 sob concorrência; esta
    // checagem só evita a viagem de rede de upload no caso comum
    // (sequencial) sem precisar tentar o INSERT primeiro.
    const existentes = await withTenant(ctx, (tx) =>
      tx
        .select({ id: audioCapture.id })
        .from(audioCapture)
        .where(
          and(
            eq(audioCapture.loteId, loteId),
            eq(audioCapture.sessionId, sessionId),
          ),
        )
        .limit(1),
    );
    if (existentes.length > 0) return { loteId };

    // A linha NASCE FORA DA FILA (`nao_solicitado`, `objeto_ref` nulo) e só é
    // promovida a `na_fila` depois que o upload daquele clipe confirmou —
    // revisão final de integração #72. Inserir já `na_fila` com `objeto_ref`
    // preenchido abria uma janela real: `app_asr_reservar` (que elege por
    // `asr_status = 'na_fila' AND objeto_ref IS NOT NULL`) podia pegar a linha
    // ANTES de o blob existir no bucket, `ler()` falhava, o clipe voltava à
    // fila gastando tentativa — e o objeto que chegasse depois já não tinha
    // dono. Nenhuma trava nova: o estado inicial é o próprio default da coluna.
    const linhas = clipes.map((c) => ({
      sessionId,
      clinicId: ctx.clinicId,
      loteId,
      ordem: c.ordem,
      asrStatus: "nao_solicitado" as const,
      objetoRef: null,
    }));

    try {
      await withTenant(ctx, async (tx) => {
        await tx.insert(audioCapture).values(linhas);

        const [sess] = await tx
          .select({ patientId: session.patientId })
          .from(session)
          .where(eq(session.id, sessionId));
        if (sess) {
          await desarquivarPacienteSeArquivado(
            tx,
            ctx,
            sess.patientId,
            "audio_local",
          );
        }
      });
    } catch (err) {
      // Backstop de R24: a outra chamada concorrente venceu a corrida e já
      // inseriu as N linhas deste loteId — `uq_audio_capture_lote_ordem`
      // (migração 0137) estourou 23505 na PRIMEIRA linha do values() que
      // colidiu. Idempotente: devolve sucesso sem subir os blobs de novo
      // (quem venceu a corrida já está subindo os dela).
      if (
        err instanceof Error &&
        "code" in err &&
        (err as { code?: string }).code === "23505"
      ) {
        return { loteId };
      }
      throw err;
    }

    // Upload FORA da transação (mesmo princípio da Fase B de
    // `consolidarSessao`): não segura conexão/lock do Postgres durante a
    // chamada de rede ao storage efêmero. Falha de upload de um clipe não
    // derruba o lote inteiro nem o `loteId` já reservado.
    //
    // A ORDEM É O CONTRATO: sobe o blob, e SÓ ENTÃO promove aquela linha a
    // `na_fila` com o `objeto_ref`. O worker (T07) só enxerga o clipe depois
    // que o objeto existe. Se o processo morrer entre o `guardar` e o UPDATE,
    // a linha fica `nao_solicitado` (nunca reservável) e o objeto órfão é
    // recolhido pelo sweeper (T15) — perde-se a transcrição daquele clipe,
    // nunca se gasta tentativa contra um objeto ausente.
    const errosUpload: string[] = [];
    for (const c of clipes) {
      try {
        const chave = chaveClipe(loteId, c.ordem);
        await guardar(chave, c.dados, c.contentType);
        await withTenant(ctx, (tx) =>
          tx
            .update(audioCapture)
            .set({ asrStatus: "na_fila", objetoRef: chave })
            .where(
              and(
                eq(audioCapture.loteId, loteId),
                eq(audioCapture.ordem, c.ordem),
              ),
            ),
        );
      } catch (err) {
        const detalhe = err instanceof Error ? err.message : String(err);
        errosUpload.push(`clipe ${c.ordem}: ${detalhe}`);
        // `falhou` (e não o `nao_solicitado` em que a linha já está): estado
        // TERMINAL e visível — o terapeuta precisa distinguir "este clipe não
        // vai ser transcrito" de "ainda não pedi transcrição". `objeto_ref`
        // continua nulo, então a linha nunca entra na fila. Um erro AQUI
        // também não pode derrubar os clipes seguintes do lote.
        try {
          await withTenant(ctx, (tx) =>
            tx
              .update(audioCapture)
              .set({ asrStatus: "falhou" })
              .where(
                and(
                  eq(audioCapture.loteId, loteId),
                  eq(audioCapture.ordem, c.ordem),
                ),
              ),
          );
        } catch (errMarcacao) {
          errosUpload.push(
            `clipe ${c.ordem}: falha ao marcar 'falhou': ${
              errMarcacao instanceof Error
                ? errMarcacao.message
                : String(errMarcacao)
            }`,
          );
        }
      }
    }
    if (errosUpload.length > 0) {
      console.error(
        "enviarLoteAsr: falha ao subir clipe(s):",
        errosUpload.join("; "),
      );
    }

    return { loteId };
  } catch (err) {
    const msg = await mensagemDeConsentimento(ctx, err, { sessionId });
    if (msg) return { error: msg };
    console.error("enviarLoteAsr:", err);
    return { error: "Não foi possível enviar o áudio para transcrição." };
  }
}

export const enviarLoteAsr = comEscrita(enviarLoteAsrCore);

const consolidarSchema = z.object({
  sessionId: z.string().uuid(),
  texto: z.string().trim().min(1, "A nota consolidada não pode ficar vazia."),
  visibilityLevel: z.enum(["multidisciplinary", "discipline_only"]).optional(),
});

/**
 * Consolida a sessão: grava a nota final, popula `numero_sequencial_paciente`
 * (só na primeira consolidação — reconsolidar não incrementa) e dispara a
 * costura de extração (`ExtractionProvider`: stub demo gera 'sugerida',
 * produção fica 'pendente_reprocessamento' até a Fase 3 ligar o LLM real).
 *
 * Roda no contexto do terapeuta dono da sessão — `extraction_insert` e
 * `extraction_delete` (RLS) exigem `app_session_terapeuta_id(session_id) =
 * app.user_id`, então `requireRole` sozinho não bastaria sem essa condição.
 */
async function consolidarSessaoCore(
  ctx: TenantContext,
  input: {
    sessionId: string;
    texto: string;
    visibilityLevel?: "multidisciplinary" | "discipline_only";
  },
): Promise<{
  error?: string;
  numeroSequencial?: number;
  bloqueioConta?: BloqueioConta;
}> {
  requireRole(ctx, "terapeuta");
  const parsed = consolidarSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const novoTexto = parsed.data.texto;
  const sid = parsed.data.sessionId;

  try {
    // ── Fase A (transação): grava nota + número, coleta o estado necessário
    //    para decidir a re-extração e monta o contexto canônico do agente.
    const prep = await withTenant(ctx, async (tx) => {
      // texto anterior (antes do upsert) → sabemos se o diário mudou
      const [notaAntiga] = await tx
        .select({ texto: sessionNote.texto })
        .from(sessionNote)
        .where(
          and(
            eq(sessionNote.sessionId, sid),
            eq(sessionNote.tipo, "nota_consolidada"),
          ),
        );
      const textoMudou = (notaAntiga?.texto ?? null) !== novoTexto;

      // 1) grava/atualiza a nota consolidada (upsert na chave única sessão+tipo)
      await tx
        .insert(sessionNote)
        .values({
          sessionId: sid,
          clinicId: ctx.clinicId,
          tipo: "nota_consolidada",
          texto: novoTexto,
          autorId: ctx.userId,
          visibilityLevel: parsed.data.visibilityLevel ?? "multidisciplinary",
        })
        .onConflictDoUpdate({
          target: [sessionNote.sessionId, sessionNote.tipo],
          set: {
            texto: novoTexto,
            atualizadoEm: new Date(),
            ...(parsed.data.visibilityLevel
              ? { visibilityLevel: parsed.data.visibilityLevel }
              : {}),
          },
        });

      // 2) popula numero_sequencial_paciente só se ainda nulo (idempotente):
      //    próximo inteiro por paciente, resolvido via helper SECURITY DEFINER
      //    (app_proximo_numero_sequencial) — precisa enxergar TODAS as sessões
      //    do paciente na clínica, não só as que o RLS deixa este terapeuta
      //    ver (um terapeuta de cobertura, fora da equipe, subestimaria o
      //    MAX() se calculado sob o próprio RLS). O índice único
      //    `uq_session_numero_por_paciente` fecha a corrida remanescente
      //    entre duas consolidações concorrentes: se o UPDATE colidir, relemos
      //    o número já gravado pela outra transação (idempotente).
      const [sess] = await tx
        .select({
          patientId: session.patientId,
          numero: session.numeroSequencialPaciente,
        })
        .from(session)
        .where(eq(session.id, sid));
      let numero = sess!.numero ?? null;
      if (numero === null) {
        try {
          const upd = await tx.execute(sql`
            UPDATE session SET numero_sequencial_paciente =
              app_proximo_numero_sequencial(${sess!.patientId})
            WHERE id = ${sid} AND numero_sequencial_paciente IS NULL
            RETURNING numero_sequencial_paciente AS numero`);
          const row = (upd as unknown as Array<{ numero: number }>)[0];
          numero = row?.numero ?? sess!.numero ?? null;
        } catch (err) {
          // Corrida: outra consolidação concorrente já gravou o número
          // (violação de uq_session_numero_por_paciente). Relemos o valor
          // já persistido — mantém a operação idempotente.
          if (
            err instanceof Error &&
            "code" in err &&
            (err as { code?: string }).code === "23505"
          ) {
            const [atual] = await tx
              .select({ numero: session.numeroSequencialPaciente })
              .from(session)
              .where(eq(session.id, sid));
            numero = atual?.numero ?? null;
          } else {
            throw err;
          }
        }
      }

      // 3) #174 regra 6: a nota consolidada é registro clínico — se o paciente
      //    estava arquivado (comercialmente), ele volta a contar na fatura.
      await desarquivarPacienteSeArquivado(
        tx,
        ctx,
        sess!.patientId,
        "registro_clinico",
      );

      // 4) política de re-extração (P0): não re-chama o LLM nem apaga extrações
      //    já revisadas quando o texto não mudou (e não há pendência).
      const exEstados = await tx
        .select({ estado: extraction.estado })
        .from(extraction)
        .where(eq(extraction.sessionId, sid));
      const reextrair = deveReextrair({
        textoMudou,
        temExtracoes: exEstados.length > 0,
        temPendente: exEstados.some(
          (e) => e.estado === "pendente_reprocessamento",
        ),
      });

      const [cl] = await tx
        .select({ isDemo: clinic.isDemo })
        .from(clinic)
        .where(eq(clinic.id, ctx.clinicId));
      const metas = await tx
        .select({ id: goal.id, descricao: goal.descricao })
        .from(goal)
        .where(
          and(
            eq(goal.clinicId, ctx.clinicId),
            eq(goal.patientId, sess!.patientId),
            eq(goal.estado, "ativa"),
          ),
        );

      // Monta o contrato canônico do agente só se formos re-extrair.
      const contexto = reextrair
        ? await loadCanonicalContext(tx, {
            sessionId: sid,
            patientId: sess!.patientId,
            clinicId: ctx.clinicId,
          })
        : null;

      return {
        numero,
        reextrair,
        isDemo: cl!.isDemo,
        metas,
        contexto,
        patientId: sess!.patientId,
      };
    });

    // Texto inalterado (e sem pendência) → não chama LLM, não apaga nada.
    if (!prep.reextrair) {
      return { numeroSequencial: prep.numero ?? undefined };
    }

    // ── Fase B: chama o provider (LLM) FORA da transação — não segura conexão
    //    nem locks durante a chamada de vários segundos.
    const provider = resolveProvider({ isDemo: prep.isDemo });
    let drafts: ExtractionDraft[];
    let alertaRisco: AlertaRiscoAgente | null = null;
    try {
      const saida = await provider.extrair({
        sessionId: sid,
        clinicId: ctx.clinicId,
        notaConsolidada: novoTexto,
        metasAtivas: prep.metas,
        contextoCanonico: prep.contexto,
      });
      drafts = saida.drafts;
      alertaRisco = saida.alertaRisco;
    } catch (err) {
      console.error("extração falhou (marcando pendente):", err);
      drafts = [PENDENTE_DRAFT];
    }

    // ── Fase C: regrava só sugestões/pendências; PRESERVA linhas já revisadas
    //    (aprovada/editada/descartada, quando existirem — Plano 2).
    //    `extractionIds` sai do RETURNING de um INSERT ... VALUES simples, que
    //    preserva a ordem da lista de valores (sem JOIN/trigger a reordenar) —
    //    o zip por índice com `drafts` na Fase E abaixo é seguro.
    const extractionIds = await withTenant(ctx, async (tx) => {
      await tx
        .delete(extraction)
        .where(
          and(
            eq(extraction.sessionId, sid),
            inArray(extraction.estado, [
              "sugerida",
              "pendente_reprocessamento",
            ]),
          ),
        );
      if (drafts.length === 0) return [];
      const inseridos = await tx
        .insert(extraction)
        .values(
          drafts.map((d) => ({
            sessionId: sid,
            clinicId: ctx.clinicId,
            estado: d.estado,
            subtipo: d.subtipo,
            trechoFonte: d.trechoFonte,
            confianca: d.confianca,
            justificativaConfianca: d.justificativaConfianca,
            inconsistenteComHistorico: d.inconsistenteComHistorico,
            parContrasteId: d.parContrasteId,
            payload: d.payload as object,
          })),
        )
        .returning({ id: extraction.id });
      return inseridos.map((r) => r.id);
    });

    // Acumula erros de registro de alerta das Fases D e E — nenhuma das duas
    // derruba a consolidação (o texto/as extrações já estão salvos), mas o
    // erro tem que ser visível na UI: o terapeuta precisa saber que o alerta
    // não subiu, senão presume que a clínica foi avisada e não foi. Uma fase
    // que falha NÃO pode engolir o erro da outra — por isso não há retorno
    // antecipado aqui, as duas sempre rodam.
    const errosAlerta: string[] = [];

    // ── Fase D: sinal de risco transversal do diário (#122, R20 / R5-TC).
    //    FORA da fila de validação por exceção do coordenador (V1) e depois da
    //    gravação das extrações, mas em transação própria: um erro ao gravar
    //    extração não pode engolir um alerta de risco, e vice-versa.
    if (alertaRisco) {
      const r = await registrarAlertaRisco(ctx, {
        patientId: prep.patientId,
        sessionId: sid,
        risco: alertaRisco,
      });
      if ("erro" in r) errosAlerta.push(r.erro);
    }

    // ── Fase E: sinal de risco de INSTRUMENTO FORMAL (#391 R3, doc §1.2 item
    //    6). Determinístico: lê `item_risco_positivo` do payload EM MEMÓRIA
    //    (o mesmo objeto que acabou de ser gravado na Fase C) — nenhum LLM
    //    roda nesta decisão, o modelo já rodou na Fase B para produzir a
    //    extração. Regra restrita a `subtipo = 'aplicacao_escala_relatada'`:
    //    qualquer outro subtipo é ignorado, mesmo com campo parecido no
    //    payload. `!== false` dispara em `true` (positivo) OU `null` (recusa
    //    de resposta — sinal, não ausência, agent-output-schema.ts); payload
    //    sem o campo (`undefined`) NÃO dispara.
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i]!;
      if (d.subtipo !== "aplicacao_escala_relatada") continue;
      const payload = d.payload as
        { item_risco_positivo?: boolean | null } | null | undefined;
      const itemRiscoPositivo = payload?.item_risco_positivo;
      if (itemRiscoPositivo === false || itemRiscoPositivo === undefined) {
        continue;
      }
      const extractionId = extractionIds[i];
      if (!extractionId) continue; // guarda defensiva; não deveria faltar

      const r = await registrarAlertaRiscoInstrumento(ctx, {
        patientId: prep.patientId,
        sessionId: sid,
        extractionId,
        sinal: {
          // Única categoria de instrumento hoje (doc §1.2 item 6) — se outro
          // instrumento vier depois com item de risco fora de ideação, revisar.
          categoria: "ideacao_suicida",
          // Nível intermediário, não o mínimo `ideacao_passiva`: não suaviza
          // por falta de contexto estruturado, mesma lógica do RPD (spec §
          // "detecção de risco no RPD").
          severidade: "ideacao_ativa_sem_plano",
          certeza: itemRiscoPositivo === true ? "explicito" : "ambiguo_citado",
          trecho_fonte: d.trechoFonte,
          detalhe:
            itemRiscoPositivo === true
              ? "Item de risco de instrumento formal respondido positivamente (true)."
              : "Item de risco de instrumento formal recusado pelo paciente (null).",
        },
      });
      if ("erro" in r) errosAlerta.push(r.erro);
    }

    // ── Fase F: sinal de risco em RPD SUGERIDO (#392, spec §"Decisão de
    //    design: alerta de risco antes da aprovação"). Mesmo padrão da Fase
    //    E: para cada draft `subtipo === 'registro_pensamento'` recém-
    //    persistido, varre os campos de texto livre do payload com a mesma
    //    varredura determinística de #391 (`detectarSinaisDeRiscoRPD`,
    //    reaproveitada direto — a função aceita todos os campos como
    //    opcionais, então passar só o subconjunto que o payload da extração
    //    tem não exige adaptador nem duplica a lista de termos). A sugestão
    //    ainda não tem linha em `tcc_rpd_entry` (só existe pós-aprovação),
    //    então o alerta é ancorado na própria extração
    //    (`origem_extraction_id`), mesma forma de ancoragem da Fase E. Alerta
    //    dispara na CRIAÇÃO da sugestão, não espera aprovação humana — mesmo
    //    princípio de #391 generalizado (ideação em texto pendente de
    //    aprovação ainda é ideação). Try/catch por item: uma falha aqui não
    //    pode derrubar a extração já persistida com sucesso.
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i]!;
      if (d.subtipo !== "registro_pensamento") continue;
      const extractionId = extractionIds[i];
      if (!extractionId) continue; // guarda defensiva; não deveria faltar

      try {
        const payload = d.payload as
          | {
              evidencias_favor?: string | null;
              evidencias_contra?: string | null;
              comportamento_resultante?: string | null;
            }
          | null
          | undefined;

        const sinais = detectarSinaisDeRiscoRPD({
          pensamentoAutomatico: d.trechoFonte,
          evidenciasFavor: payload?.evidencias_favor,
          evidenciasContra: payload?.evidencias_contra,
          comportamentoResultante: payload?.comportamento_resultante,
        });

        for (const sinal of sinais) {
          const r = await registrarAlertaRiscoRPDSugerido(ctx, {
            patientId: prep.patientId,
            extractionId,
            sinal: {
              categoria: sinal.categoria,
              severidade: sinal.severidade,
              certeza: sinal.certeza,
              trecho_fonte: sinal.trechoFonte,
              detalhe: sinal.detalhe,
            },
          });
          if ("erro" in r) errosAlerta.push(r.erro);
        }
      } catch (err) {
        console.error("deteccao/registro de risco (RPD sugerido) falhou:", err);
        errosAlerta.push("Não foi possível avaliar o risco do RPD sugerido.");
      }
    }

    if (errosAlerta.length > 0) {
      return {
        numeroSequencial: prep.numero ?? undefined,
        error: errosAlerta.join(" "),
      };
    }
    return { numeroSequencial: prep.numero ?? undefined };
  } catch (err) {
    const msg = await mensagemDeConsentimento(ctx, err, { sessionId: sid });
    if (msg) return { error: msg };
    console.error("consolidarSessao:", err);
    return { error: "Não foi possível consolidar a sessão." };
  }
}

// Barrado ANTES da Fase A, então a chamada ao LLM (Fase B) e o alerta de risco
// (Fase D) sequer acontecem — conta em somente-leitura não gasta provider nem
// gera sinal que ninguém poderia tratar.
export const consolidarSessao = comEscrita(consolidarSessaoCore);

// ─── #72 T10 — leitura de estado do lote + limites de polling ─────────────
//
// R20: o CLIENTE consulta este estado periodicamente. Os limites vivem aqui,
// nomeados, para não ficarem soltos como número mágico na UI (T11):
// - POLLING_INTERVALO_MS: cada quantos ms o cliente deve perguntar de novo.
// - POLLING_TETO_MS: depois de quanto tempo o cliente PARA de perguntar.
// O teto é comportamento do cliente, não do servidor — estourá-lo nunca muda
// a resposta daqui para "falhou". O servidor sempre devolve o estado real
// (inclusive "ainda na_fila/processando" depois do teto); é a UI quem decide
// parar de exibir um spinner e oferecer outra ação ao terapeuta.
export const POLLING_INTERVALO_MS = 3000;
export const POLLING_TETO_MS = 600_000;

export type EstadoClipeAsr = {
  ordem: number;
  asrStatus: (typeof audioCapture.$inferSelect)["asrStatus"];
  transcricaoTexto: string | null;
};

/**
 * Estado atual de cada clipe de um lote, sob RLS do tenant do request. Não
 * distingue "lote inexistente" de "lote de outra clínica" — em ambos os
 * casos a query sob `withTenant` não enxerga a linha e o retorno é vazio
 * (nunca um erro que vazasse a diferença entre os dois casos).
 */
async function obterEstadoLoteCore(
  ctx: TenantContext,
  loteId: string,
): Promise<EstadoClipeAsr[]> {
  requireRole(ctx, "terapeuta");
  const parsed = z.string().uuid().safeParse(loteId);
  if (!parsed.success) return [];

  const rows = await withTenant(ctx, (tx) =>
    tx
      .select({
        ordem: audioCapture.ordem,
        asrStatus: audioCapture.asrStatus,
        transcricaoTexto: audioCapture.transcricaoTexto,
      })
      .from(audioCapture)
      .where(eq(audioCapture.loteId, parsed.data))
      .orderBy(audioCapture.ordem),
  );

  return rows
    .filter((r): r is typeof r & { ordem: number } => r.ordem !== null)
    .map((r) => ({
      ordem: r.ordem,
      asrStatus: r.asrStatus,
      transcricaoTexto: r.transcricaoTexto,
    }));
}

export const obterEstadoLote = obterEstadoLoteCore;

/**
 * `loteId` mais recente daquela sessão, ou `null` se não houver nenhum. É a
 * fonte de verdade no reload da página (R26): estado local de "estou fazendo
 * polling de tal lote" se perde ao recarregar, então a página SEMPRE resolve
 * de novo aqui — nunca a partir de um `loteId` guardado só no cliente — para
 * decidir se há um lote em voo para retomar.
 */
async function obterLoteMaisRecenteCore(
  ctx: TenantContext,
  sessionId: string,
): Promise<string | null> {
  requireRole(ctx, "terapeuta");
  const parsed = z.string().uuid().safeParse(sessionId);
  if (!parsed.success) return null;

  const [linha] = await withTenant(ctx, (tx) =>
    tx
      .select({ loteId: audioCapture.loteId })
      .from(audioCapture)
      .where(
        and(
          eq(audioCapture.sessionId, parsed.data),
          isNotNull(audioCapture.loteId),
        ),
      )
      .orderBy(sql`${audioCapture.criadoEm} DESC`)
      .limit(1),
  );

  return linha?.loteId ?? null;
}

export const obterLoteMaisRecente = obterLoteMaisRecenteCore;
