import { PgBoss } from "pg-boss";

/**
 * Instância singleton do `pg-boss`.
 *
 * SEPARADO de `client.ts` DE PROPÓSITO: `client.ts` importa `drizzle-orm` para
 * o enfileiramento transacional, e o worker (`scripts/queue-worker.ts`) nunca
 * enfileira — só consome. Com os dois no mesmo módulo, o bundle esbuild do
 * worker arrastaria o Drizzle inteiro para dentro da imagem magra do
 * agendador, que é a classe de peso morto que `infra/asr/Dockerfile.agendador`
 * existe para evitar. Quem consome importa daqui; quem enfileira importa de
 * `client.ts`.
 */

/**
 * Quem é este processo para a fila.
 *
 * - `produtor` (default): o app Next. Só faz `send`. NÃO liga `supervise` nem
 *   `schedule` — manutenção e cron rodando em toda réplica web seriam N cópias
 *   do mesmo trabalho de banco disputando as mesmas linhas, e escalar o app
 *   passaria a escalar a carga da fila junto.
 * - `consumidor`: o processo do worker (um só, `concurrency: 1`). É ele que
 *   roda `work`, a manutenção e o cron do tick periódico.
 */
export type PapelDaFila = "produtor" | "consumidor";

let bossInstance: PgBoss | null = null;
let papelAtual: PapelDaFila | null = null;
let startPromise: Promise<PgBoss> | null = null;

export function getBossInstance(papel: PapelDaFila = "produtor"): PgBoss {
  if (bossInstance) {
    if (papelAtual !== papel) {
      // Não é cosmético: o mesmo processo pedindo os dois papéis significa que
      // alguém enfileirou antes do worker subir, e a instância já criada está
      // sem `supervise`/`schedule` — o worker rodaria sem manutenção nem cron
      // e ninguém veria. Falhar aqui é a única forma de isso aparecer.
      throw new Error(
        `Fila já inicializada como "${papelAtual}" e foi pedida como "${papel}" no mesmo processo`,
      );
    }
    return bossInstance;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada para inicialização da fila");
  }

  bossInstance = new PgBoss(opcoesDoBoss(papel, connectionString));
  papelAtual = papel;

  return bossInstance;
}

/**
 * Opções do construtor, puras e testáveis — o `pg-boss` não expõe a config que
 * recebeu, então testar o comportamento pela instância seria testar o
 * internals dele. Aqui o oráculo é a decisão, que é o que importa.
 */
export function opcoesDoBoss(
  papel: PapelDaFila,
  connectionString: string,
): ConstructorParameters<typeof PgBoss>[0] {
  const ehConsumidor = papel === "consumidor";
  return {
    connectionString,
    schema: "pgboss",
    supervise: ehConsumidor,
    schedule: ehConsumidor,
    // Schema, tabelas e filas são provisionados pela migração 0154, rodada
    // pelo superuser. Em runtime o papel de banco é `app_role` (NOBYPASSRLS,
    // sem DDL): com `migrate: true` o boss tentaria `CREATE SCHEMA` e morreria.
    migrate: false,
    application_name: ehConsumidor
      ? "iris_queue_worker"
      : "iris_queue_produtor",
  };
}

/**
 * Inicia o boss uma única vez por processo. Chamado tanto pelo produtor
 * (`enqueueJob`) quanto pelo consumidor (`startQueueWorkers`) — sem isso, um
 * processo que faz as duas coisas abriria dois pools contra o mesmo banco.
 */
export async function ensureBossStarted(
  papel: PapelDaFila = "produtor",
): Promise<PgBoss> {
  const boss = getBossInstance(papel);
  if (!startPromise) {
    startPromise = (async () => {
      await boss.start();
      return boss;
    })().catch((err) => {
      // Zera para que a próxima chamada possa tentar de novo: uma falha
      // transitória de conexão no boot não pode deixar o processo incapaz de
      // enfileirar para sempre.
      startPromise = null;
      throw err;
    });
  }
  return await startPromise;
}

export function resetBossInstance(): void {
  bossInstance = null;
  papelAtual = null;
  startPromise = null;
}
