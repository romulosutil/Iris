/**
 * Runner do consumidor da fila (`pg-boss`) — D73.
 *
 * COMO ISTO CHEGA EM PRODUÇÃO: não é executado como TypeScript. O
 * `infra/asr/Dockerfile.agendador` transpila este arquivo com esbuild num
 * estágio de build (`pnpm queue:build`) e a imagem final carrega só o
 * `.mjs` resultante + `pg-boss`. Rodar `tsx` no container seria depender de
 * uma `devDependency` que não existe no artefato — a classe de falha das
 * memórias `imagem-escalonamento-nao-herda-app` e
 * `carga-nao-cobre-import-dinamico`: imagem que sobe verde e morre no primeiro
 * tick com `ERR_MODULE_NOT_FOUND`.
 *
 * `pnpm queue:work` (com `tsx`) existe só para desenvolvimento local.
 */
import { logger } from "@/lib/observabilidade/logger";
import { startQueueWorkers, stopQueueWorkers } from "@/lib/queue/worker";

let encerrando = false;

async function encerrar(sinal: string, codigo: number): Promise<void> {
  // Segundo SIGTERM durante um encerramento em curso não reentra: o
  // `stop({ graceful })` está esperando o tick em voo terminar, e chamá-lo de
  // novo abortaria justamente o que ele protege.
  if (encerrando) return;
  encerrando = true;

  logger.info("queue.runner.encerrando", { sinal });
  try {
    await stopQueueWorkers();
  } catch (err) {
    logger.error("queue.runner.falha-no-encerramento", {
      erro: err instanceof Error ? err.message : String(err),
    });
  }
  process.exit(codigo);
}

async function main(): Promise<void> {
  await startQueueWorkers();
  logger.info("queue.runner.ativo");

  // 128+SIGTERM / 128+SIGINT: os códigos que um supervisor (Easypanel, Docker)
  // espera de uma parada limpa por sinal.
  process.on("SIGTERM", () => void encerrar("SIGTERM", 143));
  process.on("SIGINT", () => void encerrar("SIGINT", 130));
}

main().catch((err) => {
  // Falha no boot é FATAL de propósito (env ausente, banco fora, fila sem
  // grant): um runner que degrada e fica de pé sem consumir nada é
  // indistinguível de um runner saudável com fila vazia.
  logger.error("queue.runner.falha-fatal", {
    erro: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
