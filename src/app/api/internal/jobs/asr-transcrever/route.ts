import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { ler, apagar } from "@/lib/asr/storage";
import { getAsrProvider, AsrProviderError } from "@/lib/asr/provider";

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

type ResultadoClipe = {
  id: string;
  desfecho: Desfecho;
  erro?: string;
};

/** `Error.message` quando há, senão o valor cru — nunca afirma causa única. */
function mensagemDoErro(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
 * Processa um clipe reservado: baixa o objeto, transcreve, conclui ou falha,
 * e SEMPRE apaga o objeto efêmero no fim (R11) — nos três desfechos.
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
        erro: mensagemDoErro(err),
      };
    }
  } finally {
    // R11 — nenhum áudio sobrevive ao fim do tick. Falha ao apagar é logada,
    // não relançada: não pode derrubar o desfecho já persistido no banco.
    try {
      await apagar(clipe.objeto_ref);
    } catch (err) {
      console.error(
        `[asr-transcrever] falha ao apagar objeto efêmero (${clipe.objeto_ref})`,
        mensagemDoErro(err),
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
    console.error("[asr-transcrever] falha no tick do worker", err);
    return Response.json(
      { ok: false, error: mensagemDoErro(err) },
      { status: 500 },
    );
  }
}
