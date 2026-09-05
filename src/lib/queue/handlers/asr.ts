import type { Job } from "pg-boss";
import type { AsrJobPayload } from "../types";
import { QUEUE_DEFINITIONS } from "../config";
import { logger } from "@/lib/observabilidade/logger";

/**
 * Consumidor do tick de transcrição (#72 / D73), concorrência 1.
 *
 * GATILHO MAGRO, NÃO O WORKER — mesmo idioma de `billing/fechar-ciclos` e
 * `jobs/exportacao-integral`, e pelo mesmo motivo do #156 (memória
 * `job-billing-e-post-em-rota-interna`): a reserva do lote
 * (`app_asr_reservar`), o download do bucket efêmero, a chamada ao serviço
 * `iris-asr`, a conclusão/falha e o apagamento R11 moram INTEIRAMENTE em
 * `src/app/api/internal/jobs/asr-transcrever/route.ts`. Este handler só
 * acorda aquela rota.
 *
 * POR QUE NÃO IMPORTAR A LÓGICA DIRETO: a rota fala com o banco pela conexão
 * `asrWorkerDb` (`ASR_WORKER_DATABASE_URL`, papel membro de `iris_asr_worker`),
 * com o storage efêmero e com o provider de ASR. Trazer esse grafo para cá
 * obrigaria a imagem do agendador a carregar o `node_modules` do app —
 * exatamente o que `infra/asr/Dockerfile.agendador` recusa. Duplicar a chamada
 * aqui seria a mesma classe de bug do #156, só que perdendo áudio clínico em
 * vez de gerando cobrança errada.
 *
 * O QUE ESTE ARQUIVO GANHOU AO SAIR DO LAÇO `sleep 20`: o teto de concorrência
 * é do lado do banco (nunca dois ticks vivos), o retry/backoff é do `pg-boss`
 * e a falha definitiva cai na DLQ com log sanitizado — em vez de virar uma
 * linha de `ATENÇÃO` num laço que segue dormindo.
 */

/**
 * Teto de espera da resposta da rota. `expireInSeconds` da fila menos uma
 * folga: abortar DEPOIS do boss expirar o job só produziria dois registros de
 * falha para o mesmo tick.
 *
 * ⚠️ Este é o número que causou o #494/T19 no desenho antigo: o cliente
 * abortava em 120 s contra um tick que pode legitimamente levar ~215 s (5
 * clipes × ~43 s medidos, runbook §2), o laço dormia 20 s e disparava de novo
 * contra um tick ainda vivo. Aqui a sobreposição não volta nem se o timeout
 * for curto — a fila tem concorrência 1 — mas um teto abaixo do tempo real do
 * tick ainda transformaria todo tick cheio em retentativa inútil.
 */
const TIMEOUT_TICK_MS =
  QUEUE_DEFINITIONS["asr-transcrever"].expireInSeconds * 1000 - 20_000;

/**
 * Env do disparo, resolvida a cada tick (e não no import).
 *
 * Lida na chamada de propósito, memória `env-lida-no-import-passa-local-cai-no-ci`:
 * `const X = process.env…` no topo do módulo congela o valor no momento do
 * bundle/boot e passa verde em teste enquanto falha no container.
 *
 * Ausência é ERRO, nunca "libera porque não configurou": sem token a rota
 * responderia 401 e o tick viraria falha silenciosa. Só o NOME da variável
 * ausente aparece — o valor é credencial.
 */
export function lerConfigDisparoAsr(): { url: string; token: string } {
  const url = process.env.ASR_JOB_URL;
  const token = process.env.ASR_JOB_TOKEN;

  const faltando: string[] = [];
  if (!url) faltando.push("ASR_JOB_URL");
  if (!token) faltando.push("ASR_JOB_TOKEN");
  if (faltando.length > 0) {
    throw new Error(
      `Disparo de ASR sem configuração: variável(is) ausente(s): ${faltando.join(", ")}`,
    );
  }

  return { url: url!, token: token! };
}

/** Campos de contagem da resposta da rota — conjunto fechado, sem PII. */
type ResumoTick = {
  processados?: number;
  transcritos?: number;
  falhas?: number;
  revertidos?: number;
  expirados?: number | null;
};

/**
 * Extrai SÓ os números do corpo da resposta.
 *
 * A rota devolve também `resultados[]`, com o id de cada clipe. Nada disso
 * entra em log: o painel do Easypanel é servido em HTTP puro (memória
 * `easypanel-ambiente-expoe-segredos`) e um corpo repassado inteiro é como a
 * transcrição chegaria lá se a rota mudasse amanhã. Números não têm caminho
 * de dado para PII.
 */
function resumoDoCorpo(corpo: unknown): ResumoTick {
  if (typeof corpo !== "object" || corpo === null) return {};
  const c = corpo as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  return {
    processados: num(c.processados),
    transcritos: num(c.transcritos),
    falhas: num(c.falhas),
    revertidos: num(c.revertidos),
    expirados: c.expirados === null ? null : num(c.expirados),
  };
}

async function dispararTick(job: Job<AsrJobPayload>): Promise<void> {
  const { url, token } = lerConfigDisparoAsr();
  const { origem, loteId, sessionId, clinicId } = job.data ?? {
    origem: "periodico",
  };

  logger.info("queue.asr.tick-iniciando", {
    jobId: job.id,
    origem,
    loteId,
    sessionId,
    clinicId,
  });

  // `AbortSignal.any` compõe os dois motivos legítimos de parada: o boss
  // abortando (shutdown gracioso / expiração do job) e o teto local. Sem a
  // composição, um `SIGTERM` durante um tick de 200 s ficaria pendurado até o
  // timeout do `stop({ graceful })`.
  const sinal = AbortSignal.any([
    job.signal,
    AbortSignal.timeout(TIMEOUT_TICK_MS),
  ]);

  const resposta = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: "{}",
    signal: sinal,
  });

  // Corpo lido SEMPRE (inclusive no erro) para não deixar a conexão pendurada,
  // e nunca ecoado — só reduzido a contagens.
  let corpo: unknown = null;
  try {
    corpo = await resposta.json();
  } catch {
    corpo = null;
  }

  if (!resposta.ok) {
    // Mensagem NÃO afirma causa (memória `mensagem-de-erro-que-afirma-causa`):
    // 401 é token errado, 500 é falha do tick, 502/504 é a rota fora do ar, e
    // um texto que escolhesse um deles seria diagnóstico falso nos outros
    // dois. O `status` é o fato; a causa está no log da rota.
    //
    // Lançar é o certo: é o que faz o `pg-boss` reagendar com backoff e, ao
    // esgotar as 3 tentativas, mandar para a DLQ.
    throw new Error(
      `Tick de ASR recusado pela rota interna (HTTP ${resposta.status})`,
    );
  }

  logger.info("queue.asr.tick-concluido", {
    jobId: job.id,
    origem,
    ...resumoDoCorpo(corpo),
  });
}

export async function processAsrJob(jobs: Job<AsrJobPayload>[]): Promise<void> {
  for (const job of jobs) {
    // Abort ANTES de gastar um disparo: no shutdown o boss aborta os jobs em
    // voo, e um `fetch` iniciado aqui rodaria contra um processo já morrendo.
    if (job.signal.aborted) {
      throw new Error("Tick de ASR abortado antes da execução");
    }
    await dispararTick(job);
  }
}
