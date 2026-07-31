import "server-only";

/**
 * Semáforo de concorrência com fila FIFO.
 *
 * Motivo concreto: a rota pública de cadastro faz verificação/derivação de
 * senha (scrypt) — deliberadamente cara em CPU. Numa rota aberta na internet
 * isso é um vetor de DoS direto: algumas dezenas de requisições simultâneas
 * saturam o event loop do container e derrubam o app inteiro, sem precisar de
 * volume. O rate limit por e-mail/IP não cobre isso sozinho (um atacante
 * distribuído usa e-mails e IPs distintos, cada um dentro do próprio limite).
 *
 * Fila em vez de rejeição: rejeitar por saturação criaria uma resposta a mais
 * na rota, e o tempo de espera na fila é idêntico para e-mail existente e para
 * e-mail novo — não é caminho de vazamento.
 */
export function criarSemaforo(maxSimultaneos: number) {
  let emUso = 0;
  const fila: (() => void)[] = [];

  function liberar(): void {
    // Transfere a vaga direto para quem está na fila SEM passar por
    // `emUso -= 1`. Se decrementasse primeiro, `emUso` ficaria abaixo do teto
    // durante o microtask até o próximo da fila incrementar de novo — e um
    // chamador novo entraria nessa fresta, furando o limite.
    const proximo = fila.shift();
    if (proximo) proximo();
    else emUso -= 1;
  }

  return async function comLimite<T>(fn: () => Promise<T>): Promise<T> {
    if (emUso >= maxSimultaneos) {
      await new Promise<void>((resolve) => fila.push(resolve));
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
