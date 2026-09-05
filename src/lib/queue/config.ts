import type { QueueName } from "./types";

export type QueueDefinition = {
  name: QueueName;
  concurrency: number;
  retryLimit: number;
  retryBackoff: boolean;
  retryDelay: number;
  expireInSeconds: number;
  heartbeatSeconds?: number;
  deadLetter?: QueueName;
  /** Cron da rede de segurança (ver `CRON_TICK_ASR`). Ausente = só sob demanda. */
  cron?: string;
};

/**
 * Tick periódico de ASR — a REDE DE SEGURANÇA, não o caminho quente.
 *
 * O caminho quente é o `enqueueJob` transacional em `diario-asr.ts`: o job
 * nasce no mesmo COMMIT que promove os clipes a `na_fila`, então o ditado é
 * transcrito em segundos (R1), sem esperar cron nenhum.
 *
 * O cron existe por DOIS motivos que o job por lote não cobre:
 *
 *   1. CLIPE DEVOLVIDO À FILA. `app_asr_falhar(id, true)` (saturação/503) e
 *      `app_asr_expirar_presos` devolvem a linha a `na_fila` DEPOIS que o job
 *      daquele lote já foi concluído com sucesso. Sem tick periódico esse
 *      clipe fica parado até alguém gravar outro ditado — que pode nunca
 *      acontecer naquela clínica.
 *   2. HEARTBEAT. `scripts/alarme-jobs.mjs` alarma quando o heartbeat `asr`
 *      passa de 30 min sem avançar (`limiteH: 0.5`), e quem escreve esse
 *      heartbeat é a rota, uma vez por tick. Fila orientada só a evento fica
 *      muda em clínica parada e dispararia alarme falso a cada 30 min — a
 *      classe da memória `metrica-constante-por-enforcement`, ao contrário.
 *
 * 1 min (e não os 20 s do laço antigo) porque o cron deixou de ser o caminho
 * de latência: ele só precisa ser MUITO mais curto que os 30 min do alarme.
 */
export const CRON_TICK_ASR = "* * * * *";

export const QUEUE_DEFINITIONS: Record<QueueName, QueueDefinition> = {
  "asr-transcrever": {
    name: "asr-transcrever",
    // Teto estrito de 1: o tick chama uma rota que processa até 5 clipes
    // SEQUENCIALMENTE contra o serviço `iris-asr`. Dois ticks em paralelo é
    // exatamente a sobreposição que derrubava o pipeline em 503 (#494/T19).
    concurrency: 1,
    retryLimit: 3,
    retryBackoff: true,
    retryDelay: 5,
    // Um tick CHEIO mede ~215 s (5 clipes × ~43 s, runbook §2). 300 s dá
    // folga sobre isso sem deixar um tick travado ocupar a fila para sempre.
    expireInSeconds: 300,
    heartbeatSeconds: 30,
    deadLetter: "dlq",
    cron: CRON_TICK_ASR,
  },
  dlq: {
    name: "dlq",
    concurrency: 5,
    retryLimit: 1,
    retryBackoff: false,
    retryDelay: 0,
    expireInSeconds: 60,
  },
};
