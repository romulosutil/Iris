import { sql } from "drizzle-orm";
import { autorizarBearer } from "@/lib/security/autorizar-bearer";
import { asrWorkerDb } from "@/db/client";
import { ler, apagar } from "@/lib/asr/storage";
import {
  getAsrProvider,
  AsrProviderError,
  type AsrClassificacaoErro,
} from "@/lib/asr/provider";
import {
  detalheDoErro,
  detalheSemPii,
  registrarHeartbeat,
} from "@/lib/jobs/heartbeat";
import { logarErroSemPII } from "@/lib/observabilidade/logar-erro";
import { logger } from "@/lib/observabilidade/logger";

/**
 * Rota interna do worker de transcrição (#72, T07).
 *
 * Gatilho magro (mesmo idioma de `billing/fechar-ciclos` e
 * `jobs/exportacao-integral`): um agendador externo dispara POST aqui; toda a
 * lógica mora no app, nunca no script/job.
 *
 * Autorização por bearer fixo (`ASR_JOB_TOKEN`) comparado em tempo constante
 * — env ausente recusa tudo, nunca "libera porque não configurou".
 *
 * Chama `app_asr_reservar`/`app_asr_concluir`/`app_asr_falhar`
 * (`db/migrations/0136_asr_fila.sql`, T02) e `app_asr_expirar_presos`
 * (`0141`, T19) pela conexão `asrWorkerDb` (`ASR_WORKER_DATABASE_URL`, papel
 * membro de `iris_asr_worker`). NÃO pelo pool `db` da app: essas funções são
 * `SECURITY DEFINER` cross-tenant e devolvem/escrevem dado de outras clínicas,
 * então o `EXECUTE` saiu de `app_role` na `0140` (#494/T18). Não há
 * `withTenant` aqui porque não existe clínica nenhuma para resolver: o worker
 * vê a fila inteira, de todas as clínicas, no mesmo tick.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Teto de clipes por tick — mesmo idioma de `jobs/exportacao-integral/route.ts`
// (lote fixo por chamada, evita timeout de requisição). Sem env dedicado: o
// brief de T07 não pede que isso seja configurável por ambiente.
const LOTE_PADRAO = 5;

// MIME fixo enviado ao provider — GAP CONHECIDO, documentado no relatório
// desta task. `audio_capture` não persiste o mime/codec do clipe: a chave do
// storage efêmero é só `loteId:ordem` (T09/T14, `chaveClipe`), sem extensão
// nem metadado de formato. R7 prevê codec dual (`webm;opus` / `mp4` AAC no
// iOS), mas o worker não tem como saber qual dos dois foi de fato gravado.
// `audio/webm` cobre o caminho majoritário (Android/desktop); um clipe
// vindo de iOS chegaria ao serviço ASR com `Content-Type` incorreto até esse
// dado ser persistido em uma task futura.
const ASR_MIME_PADRAO = "audio/webm";

// Idade a partir da qual uma linha presa em `na_fila`/`transcrevendo` é dada
// como perdida (#494/T19). 6h é DELIBERADAMENTE a mesma régua do sweeper de
// órfãos (`ASR_SWEEPER_LIMITE_HORAS`, default 6): passada a janela, o objeto
// seria apagado do bucket efêmero de qualquer forma se estivesse ocioso — uma
// linha que continua esperando por ele está esperando por um áudio condenado.
// Enquanto a linha existir reivindicando a chave, `app_asr_objetos_em_uso`
// responde "em uso" e o sweeper PRESERVA o áudio: é a linha que isenta o
// objeto, e por isso o backstop de idade tinha que existir para os dois.
const ASR_BACKSTOP_HORAS = 6;

type LinhaReservada = {
  id: string;
  clinic_id: string;
  objeto_ref: string;
  lote_id: string | null;
  ordem: number | null;
};

type Desfecho = "transcrito" | "falhou" | "revertido";

/**
 * Categoria fechada do desfecho de erro — o ÚNICO vocabulário de falha que
 * atravessa a fronteira HTTP desta rota (#494, T16).
 *
 * Motivo: `concluirClipe` manda a transcrição como parâmetro vinculado, e a
 * `.message` do `DrizzleQueryError` é montada como "Failed query: …\nparams: …"
 * — com o texto da nota clínica dentro. Ecoar essa mensagem no corpo levava a
 * nota inteira até a linha de log do `scripts/disparo-asr-transcrever.mjs`, num
 * painel Easypanel servido em HTTP puro. Um rótulo de conjunto fechado não tem
 * como carregar PII: não existe caminho de dado do erro para a string.
 *
 * Os três primeiros valores são exatamente os de `AsrClassificacaoErro` (T05) —
 * a rota não reinterpreta status HTTP, só repassa o que o provider classificou.
 * `erro_interno` cobre tudo que não veio do provider (storage, banco, bug
 * nosso): é justamente o balde onde a mensagem crua seria mais perigosa.
 */
type CategoriaErro = AsrClassificacaoErro | "erro_interno";

type ResultadoClipe = {
  id: string;
  desfecho: Desfecho;
  categoria?: CategoriaErro;
};

/** Classificação do provider quando existe; qualquer outra origem é interna. */
function categoriaDoErro(err: unknown): CategoriaErro {
  return err instanceof AsrProviderError ? err.classificacao : "erro_interno";
}

/*
 * O diagnóstico do log da APP (nome do erro + SQLSTATE, nunca `.message`)
 * saiu daqui na F3 da #560: `logarErroSemPII` já produz um SUPERCONJUNTO do
 * que a função local montava — classe, SQLSTATE, constraint, status HTTP,
 * nome da causa e hash da mensagem — e ainda entrega isso como campos JSON,
 * com `requestId`, passando pela redaction por chave. Duas funções para o
 * mesmo diagnóstico é como uma delas envelhece sem ninguém notar.
 *
 * A razão de ser restritivo continua valendo e é por que nada aqui virou
 * `err` cru: o log do container é lido pelo painel do Easypanel, servido em
 * HTTP puro (memória `easypanel-ambiente-expoe-segredos`).
 */

async function reservarLote(limite: number): Promise<LinhaReservada[]> {
  const linhas = await asrWorkerDb.execute(
    sql`SELECT * FROM app_asr_reservar(${limite})`,
  );
  return linhas as unknown as LinhaReservada[];
}

async function concluirClipe(id: string, texto: string): Promise<void> {
  await asrWorkerDb.execute(
    sql`SELECT app_asr_concluir(${id}::uuid, ${texto})`,
  );
}

async function falharClipe(
  id: string,
  reverterTentativa: boolean,
): Promise<void> {
  await asrWorkerDb.execute(
    sql`SELECT app_asr_falhar(${id}::uuid, ${reverterTentativa})`,
  );
}

/**
 * Backstop de idade da LINHA — roda ANTES da reserva de cada tick (#494/T19).
 *
 * POR QUE ANTES: expirar primeiro solta o `objeto_ref` das linhas condenadas na
 * mesma passada em que a fila é lida, então o sweeper já encontra o objeto
 * liberado no próximo ciclo dele. Rodar depois adiaria a liberação em um tick
 * inteiro sem ganho nenhum.
 *
 * POR QUE AQUI E NÃO NO SWEEPER: o sweeper (T15) varre o BUCKET; ele nem
 * enumera linhas de `audio_capture`. Quem já tem a fila em mãos a cada tick é
 * esta rota.
 */
async function expirarPresos(): Promise<number> {
  const linhas = await asrWorkerDb.execute(
    sql`SELECT app_asr_expirar_presos(${`${ASR_BACKSTOP_HORAS} hours`}::interval) AS expirados`,
  );
  const primeira = (linhas as unknown as { expirados: number }[])[0];
  return primeira?.expirados ?? 0;
}

/**
 * O objeto efêmero ainda é reivindicado por alguma linha? Pergunta ao banco
 * (`app_asr_objetos_em_uso`, migração 0138) em vez de recalcular aqui o teto
 * de tentativas de `app_asr_falhar` — duas cópias da mesma aritmética
 * envelheceriam separado, e o retorno da função é só o rowcount, não o estado
 * resultante.
 */
async function objetoEmUso(ref: string): Promise<boolean> {
  const linhas = await asrWorkerDb.execute(
    sql`SELECT ref FROM app_asr_objetos_em_uso(ARRAY[${ref}]::text[])`,
  );
  return (linhas as unknown as unknown[]).length > 0;
}

/**
 * Processa um clipe reservado: baixa o objeto, transcreve, conclui ou falha,
 * e apaga o objeto efêmero no fim (R11) SÓ NO DESFECHO DEFINITIVO.
 *
 * Dos três desfechos, dois devolvem o clipe a `na_fila` PRESERVANDO
 * `objeto_ref` (503/saturação, que reverte a tentativa; e falha transitória
 * abaixo do teto de 3) — apagar o objeto neles condenava o clipe: a próxima
 * reserva o encontrava elegível, `ler()` falhava por objeto inexistente, e ele
 * queimava as tentativas restantes até `falhou` sem nunca ter sido
 * transcrito. Quem sabe em qual dos casos estamos é o BANCO, depois do
 * `concluir`/`falhar` — daí a consulta abaixo.
 */
async function processarClipe(clipe: LinhaReservada): Promise<ResultadoClipe> {
  try {
    try {
      const audio = await ler(clipe.objeto_ref);
      const { texto } = await getAsrProvider().transcrever(
        audio,
        ASR_MIME_PADRAO,
      );
      await concluirClipe(clipe.id, texto);
      return { id: clipe.id, desfecho: "transcrito" };
    } catch (err) {
      // A classificação da recusa vem do PROVIDER (T05) — esta rota nunca
      // reinterpreta status HTTP. Só `AsrProviderError` com
      // `classificacao === "saturacao"` (503) reverte a tentativa; qualquer
      // outra causa (download do storage, 400/413/408/500 do serviço) conta
      // como falha normal do clipe.
      const reverter =
        err instanceof AsrProviderError && err.classificacao === "saturacao";
      await falharClipe(clipe.id, reverter);
      return {
        id: clipe.id,
        desfecho: reverter ? "revertido" : "falhou",
        categoria: categoriaDoErro(err),
      };
    }
  } finally {
    // R11 — nenhum áudio sobrevive ao fim do tick, exceto o que ainda vai ser
    // relido numa próxima reserva. Falha ao consultar/apagar é logada, não
    // relançada: não pode derrubar o desfecho já persistido no banco. E o
    // erro cai no lado que NÃO apaga — objeto preservado a mais é vazamento
    // que o sweeper (T15) recolhe na janela de 6h; objeto apagado a menos é
    // áudio clínico perdido para sempre.
    try {
      // Sem `return` aqui: um `return` dentro de `finally` descartaria o
      // `ResultadoClipe` já montado no `try`.
      if (!(await objetoEmUso(clipe.objeto_ref))) {
        await apagar(clipe.objeto_ref);
      }
    } catch (err) {
      // `objetoRef` é a chave do storage efêmero (`loteId:ordem`), não PII —
      // e é o único jeito de o operador achar o objeto que ficou para trás.
      logarErroSemPII("asr-transcrever.objeto-efemero-nao-apagado", err, {
        objetoRef: clipe.objeto_ref,
      });
    }
  }
}

export async function POST(request: Request): Promise<Response> {
  // Bearer em tempo constante; env ausente → recusa (`autorizarBearer`,
  // A-05/#530 — implementação única compartilhada com billing e exportação).
  if (
    !autorizarBearer(
      request.headers.get("authorization"),
      process.env.ASR_JOB_TOKEN,
    )
  ) {
    return Response.json({ error: "não autorizado" }, { status: 401 });
  }

  try {
    // Falha do backstop NÃO aborta o tick: ele é a rede embaixo da rede, e
    // deixar de transcrever a fila inteira porque a limpeza falhou trocaria um
    // vazamento lento por uma parada total. Mas é logado — um backstop que
    // falha em silêncio é indistinguível de um backstop que não existe.
    let expirados: number | null = null;
    try {
      expirados = await expirarPresos();
      if (expirados > 0) {
        // Contagem e régua como CAMPOS, não interpolados na frase: é por
        // `expirados` que se vê o backstop saindo do zero, e uma mensagem
        // montada obrigaria o operador a extrair o número por regex.
        logger.warn("asr-transcrever.backstop-expirou-presos", {
          expirados,
          limiteHoras: ASR_BACKSTOP_HORAS,
        });
      }
    } catch (err) {
      logarErroSemPII("asr-transcrever.backstop-falhou", err);
    }

    const reservados = await reservarLote(LOTE_PADRAO);

    // R12 — falha de UM clipe não aborta os demais do tick: cada clipe roda
    // seu próprio try/catch/finally (processarClipe), sequencialmente, e o
    // loop sempre segue para o próximo item independente do desfecho.
    const resultados: ResultadoClipe[] = [];
    for (const clipe of reservados) {
      resultados.push(await processarClipe(clipe));
    }

    // #536 — sinal de vida no banco (o `.mjs` deste job é fetch-only). Só
    // contagens: nada de id de clipe, clínica ou transcrição.
    await registrarHeartbeat(
      "asr",
      true,
      detalheSemPii({
        processados: resultados.length,
        transcritos: resultados.filter((r) => r.desfecho === "transcrito")
          .length,
        falhas: resultados.filter((r) => r.desfecho === "falhou").length,
      }),
    );

    return Response.json({
      ok: true,
      // `null` quando o backstop falhou — distinto de `0` ("rodou, nada a
      // expirar"). Um número só vira contagem depois que a chamada deu certo.
      expirados,
      processados: resultados.length,
      transcritos: resultados.filter((r) => r.desfecho === "transcrito").length,
      falhas: resultados.filter((r) => r.desfecho === "falhou").length,
      revertidos: resultados.filter((r) => r.desfecho === "revertido").length,
      resultados,
    });
  } catch (err) {
    // `err` inteiro NÃO entra aqui: a `.message` do `DrizzleQueryError` traz os
    // params da query — e uma delas carrega a transcrição. `logarErroSemPII`
    // reduz ao conjunto fechado (classe, SQLSTATE, constraint, hash) antes de
    // qualquer coisa chegar ao registro.
    logarErroSemPII("asr-transcrever.tick-falhou", err);
    await registrarHeartbeat("asr", false, detalheDoErro(err));
    return Response.json(
      { ok: false, categoria: categoriaDoErro(err) },
      { status: 500 },
    );
  }
}
