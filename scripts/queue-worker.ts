/**
 * Runner dedicado para processamento de filas via pg-boss.
 * Pode rodar como serviço na VPS ou dentro do container de worker.
 * Suporta graceful shutdown em SIGINT/SIGTERM.
 */
import { startQueueWorkers, stopQueueWorkers } from "../src/lib/queue/worker";

async function main() {
  console.log(
    "[queue-worker] Iniciando consumidor exclusivo da fila PostgreSQL...",
  );
  await startQueueWorkers();

  const shutdown = async (signal: string) => {
    console.log(
      `[queue-worker] Sinal ${signal} recebido. Finalizando gracefully...`,
    );
    await stopQueueWorkers();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[queue-worker] Erro fatal no runner da fila:", err);
  process.exit(1);
});
