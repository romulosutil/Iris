import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { ler, apagar } from "@/lib/asr/storage";
import {
  getAsrProvider,
  AsrProviderError,
  type AsrClassificacaoErro,
} from "@/lib/asr/provider";
import { codigoPg } from "@/db/pg-error";

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
 * (`db/migrations/0136_asr_fila.sql`, T02) pela conexão `db` (`DATABASE_URL`,
 * role `iris_app`, membro de `app_role` — é a essa role que as três funções
 * concedem `EXECUTE`; `authDb`/`iris_auth` não tem o grant). As funções são
 * `SECURITY DEFINER` cross-tenant por desenho — não há `withTenant` aqui
 * porque não existe clínica nenhuma para resolver: o worker vê a fila
 * inteira, de todas as clínicas, no mesmo tick.
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

/**
 * Diagnóstico para o log da APP — nome do erro + SQLSTATE, nunca `.message`.
 *
 * A regra do repo é que o log de servidor pode ser mais detalhado que a
 * resposta, mas aqui a mediana de risco é alta: o log do container é lido pelo
 * painel do Easypanel, servido em HTTP puro (memória
 * `easypanel-ambiente-expoe-segredos`). `err.name` + `codigoPg` mantêm o poder
 * de diagnóstico real ("22001 no concluir" já localiza o defeito) sem que a
 * nota ditada possa entrar na string.
 */
function diagnosticoDoErro(err: unknown): string {
  const nome = err instanceof Error ? err.name : typeof err;
  const codigo = codigoPg(err);
  return codigo ? `${nome} (SQLSTATE ${codigo})` : nome;
}

/**
 * Bearer em tempo constante. Env ausente → recusa, mesmo padrão de
 * `billing/fechar-ciclos/route.ts`.
 */
function autorizado(header: string | null): boolean {
  const esperado = process.env.ASR_JOB_TOKEN;
  if (!esperado || !header) return false;
  const prefixo = "Bearer ";
  if (!header.startsWith(prefixo)) return false;
  const recebido = header.slice(prefixo.length);
  const a = Buffer.from(recebido, "utf8");
  const b = Buffer.from(esperado, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function reservarLote(limite: number): Promise<LinhaReservada[]> {
  const linhas = await db.execute(
    sql`SELECT * FROM app_asr_reservar(${limite})`,
  );
  return linhas as unknown as LinhaReservada[];
}

async function concluirClipe(id: string, texto: string): Promise<void> {
  await db.execute(sql`SELECT app_asr_concluir(${id}::uuid, ${texto})`);
}

async function falharClipe(
  id: string,
  reverterTentativa: boolean,
): Promise<void> {
  await db.execute(
    sql`SELECT app_asr_falhar(${id}::uuid, ${reverterTentativa})`,
  );
}

/**
 * O objeto efêmero ainda é reivindicado por alguma linha? Pergunta ao banco
 * (`app_asr_objetos_em_uso`, migração 0138) em vez de recalcular aqui o teto
 * de tentativas de `app_asr_falhar` — duas cópias da mesma aritmética
 * envelheceriam separado, e o retorno da função é só o rowcount, não o estado
 * resultante.
 */
async function objetoEmUso(ref: string): Promise<boolean> {
  const linhas = await db.execute(
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
      console.error(
        `[asr-transcrever] falha ao apagar objeto efêmero (${clipe.objeto_ref})`,
        diagnosticoDoErro(err),
      );
    }
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!autorizado(request.headers.get("authorization"))) {
    return Response.json({ error: "não autorizado" }, { status: 401 });
  }

  try {
    const reservados = await reservarLote(LOTE_PADRAO);

    // R12 — falha de UM clipe não aborta os demais do tick: cada clipe roda
    // seu próprio try/catch/finally (processarClipe), sequencialmente, e o
    // loop sempre segue para o próximo item independente do desfecho.
    const resultados: ResultadoClipe[] = [];
    for (const clipe of reservados) {
      resultados.push(await processarClipe(clipe));
    }

    return Response.json({
      ok: true,
      processados: resultados.length,
      transcritos: resultados.filter((r) => r.desfecho === "transcrito").length,
      falhas: resultados.filter((r) => r.desfecho === "falhou").length,
      revertidos: resultados.filter((r) => r.desfecho === "revertido").length,
      resultados,
    });
  } catch (err) {
    // `err` inteiro NÃO entra aqui: a `.message` do `DrizzleQueryError` traz os
    // params da query — e uma delas carrega a transcrição.
    console.error(
      "[asr-transcrever] falha no tick do worker",
      diagnosticoDoErro(err),
    );
    return Response.json(
      { ok: false, categoria: categoriaDoErro(err) },
      { status: 500 },
    );
  }
}
