import "server-only";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDiario } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { codigoPg, constraintPg } from "@/db/pg-error";
import { audioCapture, session } from "@/db/schema";
import { desarquivarPacienteSeArquivado } from "@/lib/patient/desarquivamento";
import { comEscrita, type BloqueioConta } from "@/lib/billing/guard-escrita";
import { asrHabilitado } from "@/lib/flags";
import { chaveClipe } from "@/lib/audio/local-store";
import { guardar } from "@/lib/asr/storage";
import { logarErroSemPII } from "@/lib/observabilidade/logar-erro";
import { logger } from "@/lib/observabilidade/logger";
import { mensagemDeConsentimento } from "./diario-comum";
import { enqueueJob } from "@/lib/queue/client";

/**
 * Ditado de voz do diário de sessão (#72): envio do lote de clipes, leitura do
 * estado de transcrição e aceite do texto no rascunho (#559, F4 — extraído de
 * `diario/[sessionId]/logic.ts`).
 *
 * `POLLING_INTERVALO_MS` / `POLLING_TETO_MS` NÃO são reexportados daqui. O
 * `logic.ts` os reexportava de `@/lib/asr/polling` para a UI, mas nenhum
 * consumidor usava essa porta — `ditado-voz.tsx` sempre importou direto do
 * módulo neutro, que é o certo: este arquivo é `server-only` e um componente
 * de cliente não pode atravessá-lo para chegar a uma constante.
 */

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

type LinhaDeLoteAsr = Pick<
  typeof audioCapture.$inferSelect,
  "ordem" | "asrStatus"
>;

/**
 * Ordens do lote que AINDA NÃO tiveram o upload confirmado (#494/T20).
 *
 * `nao_solicitado` é o estado em que a linha NASCE — antes do `guardar()` e
 * antes da promoção a `na_fila`. Ele não é um desfecho: é o meio do caminho.
 * Todos os outros (`na_fila`, `transcrevendo`, `transcrito`, `falhou`) só
 * existem porque alguém já decidiu o destino daquele clipe, e reprocessá-los
 * seria re-subir blob e reescrever estado por cima de trabalho concluído.
 *
 * Puro de propósito: é o predicado que decide entre "devolver idempotente" e
 * "retomar", e precisa ser testável sem banco.
 */
export function ordensPendentesDeUpload(
  linhas: ReadonlyArray<LinhaDeLoteAsr>,
): number[] {
  return linhas
    .filter((l) => l.asrStatus === "nao_solicitado")
    .map((l) => l.ordem)
    .filter((o): o is number => o !== null);
}

/**
 * O lote está resolvido? Só quando EXISTE linha e NENHUMA delas ficou para
 * trás em `nao_solicitado` (#494/T20).
 *
 * O critério antigo era "existe qualquer linha com este lote_id". Mas a
 * inserção não conclui nada: o INSERT commita FORA da fila e o que de fato
 * entrega o clipe ao worker é o par upload + promoção a `na_fila`. Se a
 * conexão da terapeuta caísse entre os dois, o reenvio com o mesmo `loteId`
 * (o retry que R24 prescreve) devolvia `{ loteId }` na hora sem subir nada, e
 * as linhas ficavam `nao_solicitado` PARA SEMPRE — nunca reserváveis
 * (`app_asr_reservar` exige `na_fila` + `objeto_ref`), nunca varridas (o
 * objeto não existe), mas ainda reportadas como pendentes pelo polling da UI
 * até estourar o teto de 10 min.
 */
export function loteJaResolvido(
  linhas: ReadonlyArray<LinhaDeLoteAsr>,
): boolean {
  // Testa o STATUS direto, e não `ordensPendentesDeUpload(...).length`: aquela
  // função descarta `ordem` nula (não dá para casar com clipe nenhum do
  // payload), e uma linha assim ainda pendente daria o lote por resolvido.
  return (
    linhas.length > 0 && linhas.every((l) => l.asrStatus !== "nao_solicitado")
  );
}

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
  // Quantos clipes NÃO chegaram a `na_fila` nesta chamada (#494/T20). Zero
  // (campo ausente) é o caminho feliz. Presente, o lote foi aceito mas está
  // incompleto — a UI precisa distinguir isso de "tudo enviado", já que o
  // polling nunca vai ver esses clipes transcreverem. É uma CONTAGEM, e não a
  // mensagem do erro, de propósito: mensagem crua de driver/storage pode
  // carregar valor de linha, e este retorno chega ao cliente.
  clipesComFalha?: number;
  bloqueioConta?: BloqueioConta;
}> {
  requireDiario(ctx);
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
    // as linhas existentes desta sessão (RLS via withTenant já isola por
    // clínica; `sessionId` reduz falso-positivo cross-sessão do mesmo
    // `loteId`) decidem entre devolver idempotente e RETOMAR o que ficou pelo
    // caminho — ver `loteJaResolvido`. Lê `ordem` + `asrStatus` de TODAS as
    // linhas, sem `limit(1)`: o critério é sobre o conjunto, não sobre
    // existência.
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
        .select({
          ordem: audioCapture.ordem,
          asrStatus: audioCapture.asrStatus,
        })
        .from(audioCapture)
        .where(
          and(
            eq(audioCapture.loteId, loteId),
            eq(audioCapture.sessionId, sessionId),
          ),
        ),
    );
    if (loteJaResolvido(existentes)) return { loteId };

    // Retomada: as linhas já existem (não inserir de novo — o INSERT bateria
    // no `uq_audio_capture_lote_ordem`), mas há `nao_solicitado` pendente.
    // Sobe só o que falta; quem já está `na_fila`/`transcrito`/`falhou` fica
    // intocado, senão um retry ressuscitaria clipe já concluído.
    const retomando = existentes.length > 0;
    const pendentes = new Set(ordensPendentesDeUpload(existentes));
    const clipesASubir = retomando
      ? clipes.filter((c) => pendentes.has(c.ordem))
      : clipes;
    // Pendente sem blob correspondente no payload: o cliente reenviou o lote
    // sem os dados daquele clipe, então não há o que subir e a linha vai
    // continuar fora da fila. Entra na contagem devolvida, não em silêncio.
    const pendentesSemBlob = retomando
      ? pendentes.size - clipesASubir.length
      : 0;

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
      if (!retomando)
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
      // Lido por `codigoPg`/`constraintPg` (`@/db/pg-error`), NÃO por `.code`
      // na raiz: o Drizzle embrulha o erro do driver em `DrizzleQueryError` e
      // o SQLSTATE vai para `.cause` — ler só a raiz fazia o `catch` não
      // reconhecer a violação, rethrow, e o lote perdedor da corrida voltar
      // erro genérico ao terapeuta (flake do teste de concorrência de R24).
      if (
        codigoPg(err) === "23505" &&
        constraintPg(err) === "uq_audio_capture_lote_ordem"
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
    //
    // TODO UPDATE ABAIXO É COMPARE-AND-SWAP em `nao_solicitado` (#494/T20).
    // POR QUÊ: fora de transação, este laço corre em paralelo com QUALQUER
    // outro escritor da mesma linha — a segunda chamada concorrente do mesmo
    // `loteId` (duplo clique/duas abas), o worker que já reservou o clipe, o
    // sweeper. Sem o predicado de estado, um `UPDATE ... SET 'na_fila'`
    // chegando atrasado REVERTE um clipe já `transcrevendo`/`transcrito`/
    // `falhou` para a fila: ele seria transcrito duas vezes, e a versão nova
    // sobrescreveria a que a terapeuta já tem na tela. O CAS torna esse
    // UPDATE atrasado um no-op (0 linhas) em vez de uma regressão de estado —
    // é ele que garante que o perdedor da corrida NUNCA ressuscita trabalho
    // concluído, e é o que permite que o upload duplicado do perdedor seja
    // inofensivo (mesma chave determinística `loteId:ordem`, mesmo objeto).
    const ordensComFalha: number[] = [];
    for (const c of clipesASubir) {
      try {
        const chave = chaveClipe(loteId, c.ordem);
        await guardar(chave, c.dados, c.contentType);
        await withTenant(ctx, async (tx) => {
          await tx
            .update(audioCapture)
            .set({ asrStatus: "na_fila", objetoRef: chave })
            .where(
              and(
                eq(audioCapture.loteId, loteId),
                eq(audioCapture.ordem, c.ordem),
                eq(audioCapture.asrStatus, "nao_solicitado"),
              ),
            );

          // Emitido DENTRO da transação (`tx`): se o UPDATE que promove os
          // clipes a `na_fila` sofrer rollback, o job nunca existe. O payload
          // é só correlação de log — quem escolhe o trabalho é
          // `app_asr_reservar`, do lado do banco.
          await enqueueJob(
            "asr-transcrever",
            { origem: "lote", loteId, sessionId, clinicId: ctx.clinicId },
            { singletonKey: loteId, tx },
          );
        });
      } catch {
        ordensComFalha.push(c.ordem);
        // `falhou` (e não o `nao_solicitado` em que a linha já está): estado
        // TERMINAL e visível — o terapeuta precisa distinguir "este clipe não
        // vai ser transcrito" de "ainda não pedi transcrição". `objeto_ref`
        // continua nulo, então a linha nunca entra na fila. Um erro AQUI
        // também não pode derrubar os clipes seguintes do lote.
        //
        // Mesmo CAS da promoção: MEU upload falhou, mas se a linha já saiu de
        // `nao_solicitado` foi porque OUTRA chamada do mesmo lote subiu aquele
        // clipe com sucesso. Carimbar `falhou` por cima diria à terapeuta que
        // um clipe que está na fila (ou já transcrito) se perdeu.
        try {
          await withTenant(ctx, (tx) =>
            tx
              .update(audioCapture)
              .set({ asrStatus: "falhou" })
              .where(
                and(
                  eq(audioCapture.loteId, loteId),
                  eq(audioCapture.ordem, c.ordem),
                  eq(audioCapture.asrStatus, "nao_solicitado"),
                ),
              ),
          );
        } catch {
          // A linha fica em `nao_solicitado`. Já está contada em
          // `ordensComFalha` — o clipe não subiu de qualquer forma, e o
          // desfecho para o terapeuta é o mesmo.
        }
      }
    }

    const clipesComFalha = ordensComFalha.length + pendentesSemBlob;
    if (clipesComFalha > 0) {
      // Só ordem e contagem no log: a mensagem crua de storage/driver pode
      // embutir valor de linha (memória `campo-livre-de-terceiro-carrega-pii`)
      // e `audio_capture` é dado de paciente. `loteId` é opaco e já é a chave
      // de correlação com o objeto no bucket.
      //
      // #560 (F4): os números saem em CAMPOS, não interpolados numa frase. A
      // frase obrigava o operador a escrever um regex por sítio para extrair
      // "quantos clipes ficaram fora"; em campo, `clipesComFalha` é filtrável
      // e somável. `ordensComFalha` é lista de índices (`0,3,7`), não de ids.
      logger.error("diario-asr.lote-incompleto", {
        loteId,
        clipesComFalha,
        ordensComFalha: ordensComFalha.join(",") || "nenhuma",
        pendentesSemBlob,
      });
      return { loteId, clipesComFalha };
    }

    return { loteId };
  } catch (err) {
    const msg = await mensagemDeConsentimento(ctx, err, { sessionId });
    if (msg) return { error: msg };
    logarErroSemPII("enviarLoteAsr:", err);
    return { error: "Não foi possível enviar o áudio para transcrição." };
  }
}

export const enviarLoteAsr = comEscrita(enviarLoteAsrCore);

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
  requireDiario(ctx);
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
  requireDiario(ctx);
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

// ─── #72 T25 — a transcrição é efêmera (R19, decisão C de 31/08/2026) ─────
//
// Aceitar o texto no rascunho da nota é o gesto que apaga `transcricao_texto`
// do servidor: a `session_note` passa a ser o único registro que sobrevive, e
// é ela que já entra na exportação do acervo. Sem isto, `audio_capture` —
// que está em `TABELAS_NEGADAS` do coletor de propósito — guardaria texto
// clínico que a paciente nunca conseguiria portar (LGPD Art. 18).
//
// Ler e apagar acontecem no MESMO statement, e só volta o que o UPDATE de
// fato tocou: se a RLS barrar a escrita ela afeta 0 linhas em silêncio, e
// devolver o texto nesse caso entregaria uma transcrição que continua no
// banco. O JOIN com `upd` é o que torna isso impossível.
export type AceitarTranscricaoResultado = {
  paragrafos?: string[];
  error?: string;
  bloqueioConta?: BloqueioConta;
};

async function aceitarTranscricaoLoteCore(
  ctx: TenantContext,
  loteId: string,
): Promise<AceitarTranscricaoResultado> {
  requireDiario(ctx);
  const parsed = z.string().uuid().safeParse(loteId);
  if (!parsed.success) return { error: "Lote inválido." };

  const linhas = await withTenant(ctx, async (tx) => {
    const r = await tx.execute(sql`
      WITH antes AS (
        SELECT id, ordem, transcricao_texto
        FROM audio_capture
        WHERE lote_id = ${parsed.data} AND transcricao_texto IS NOT NULL
      ), upd AS (
        UPDATE audio_capture a
        SET transcricao_texto = NULL
        FROM antes
        WHERE a.id = antes.id
        RETURNING a.id
      )
      SELECT antes.ordem AS ordem, antes.transcricao_texto AS texto
      FROM antes JOIN upd ON upd.id = antes.id
      ORDER BY antes.ordem
    `);
    return r as unknown as Array<{ ordem: number | null; texto: string }>;
  });

  return { paragrafos: linhas.map((l) => l.texto) };
}

export const aceitarTranscricaoLote = comEscrita(aceitarTranscricaoLoteCore);
