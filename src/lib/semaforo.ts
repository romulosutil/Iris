import "server-only";

/**
 * Lançado quando não há vaga E a fila está cheia, ou quando a espera na fila
 * estourou o tempo. Tipo próprio para o chamador poder responder de forma
 * genérica em vez de deixar vazar erro de infraestrutura.
 */
class SemaforoSaturado extends Error {
  constructor(motivo: "fila-cheia" | "timeout") {
    super(`semáforo saturado: ${motivo}`);
    this.name = "SemaforoSaturado";
  }
}

export type OpcoesSemaforo = {
  /** Máximo de chamadores ESPERANDO. Acima disso, rejeita na hora. */
  capFila: number;
  /** Tempo máximo na fila antes de desistir. */
  timeoutMs: number;
};

type Espera = { resolve: () => void; cancelado: boolean };

/**
 * Semáforo de concorrência com fila FIFO **limitada e com timeout**.
 *
 * Motivo concreto: a rota pública de cadastro faz derivação/verificação de
 * senha (scrypt) — deliberadamente cara em CPU. Numa rota aberta na internet
 * isso é DoS direto: algumas dezenas de requisições simultâneas saturam o event
 * loop do container. O rate limit por e-mail/IP não cobre isso sozinho (um
 * atacante distribuído usa e-mails e IPs distintos, cada um dentro do próprio
 * limite).
 *
 * FILA LIMITADA (finding 4 do review): a primeira versão tinha fila infinita e
 * sem timeout, o que apenas MUDAVA o DoS de lugar — de exaustão de CPU para
 * exaustão de memória e de latência (milhares de requisições penduradas, cada
 * uma segurando `FormData` e socket). Cap + timeout devolvem o controle: além
 * do cap o chamador é rejeitado na hora, e o servidor volta a respirar.
 *
 * A rejeição NÃO é canal de vazamento: a decisão acontece antes de qualquer
 * consulta ao banco e não depende do e-mail submetido, então é idêntica para
 * e-mail cadastrado e para e-mail livre.
 */
export function criarSemaforo(maxSimultaneos: number, opcoes: OpcoesSemaforo) {
  let emUso = 0;
  const fila: Espera[] = [];

  function liberar(): void {
    // Transfere a vaga direto para o próximo VIVO da fila, SEM passar por
    // `emUso -= 1`. Se decrementasse primeiro, `emUso` ficaria abaixo do teto
    // durante o microtask até o próximo incrementar de novo — e um chamador
    // novo entraria nessa fresta, furando o limite. Esperas canceladas
    // (timeout) são descartadas aqui: elas já não seguram vaga nenhuma.
    for (;;) {
      const proximo = fila.shift();
      if (!proximo) {
        emUso -= 1;
        return;
      }
      if (!proximo.cancelado) {
        proximo.resolve();
        return;
      }
    }
  }

  return async function comLimite<T>(fn: () => Promise<T>): Promise<T> {
    if (emUso >= maxSimultaneos) {
      if (fila.length >= opcoes.capFila)
        throw new SemaforoSaturado("fila-cheia");

      const espera: Espera = { resolve: () => {}, cancelado: false };
      let temporizador: ReturnType<typeof setTimeout> | undefined;
      // Se rejeitar (timeout), a vaga nunca foi tomada — nada a liberar, e o
      // erro sobe direto para o chamador.
      await new Promise<void>((resolve, reject) => {
        espera.resolve = () => {
          if (temporizador) clearTimeout(temporizador);
          resolve();
        };
        temporizador = setTimeout(() => {
          espera.cancelado = true;
          const i = fila.indexOf(espera);
          if (i >= 0) fila.splice(i, 1);
          reject(new SemaforoSaturado("timeout"));
        }, opcoes.timeoutMs);
        fila.push(espera);
      });
      // Chegou aqui = a vaga foi TRANSFERIDA por `liberar` (emUso inalterado).
    } else {
      emUso += 1;
    }

    try {
      return await fn();
    } finally {
      liberar();
    }
  };
}
