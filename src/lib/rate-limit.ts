import "server-only";

type Registro = { contagem: number; expiraEm: number };

// Em memória, por instância. Suficiente para o MVP num único container; se o
// app escalar horizontalmente isto vira Postgres ou Redis — a assinatura não muda.
// Cap de 10k entradas previne DoS por enumeração de e-mails (chaves controladas
// pelo atacante). Expirações são evitadas oportunisticamente em cada escrita.
const registros = new Map<string, Registro>();
const CAP_ENTRIES = 10_000;

/**
 * Remove entradas expiradas do mapa. Chamado em cada operação de escrita para
 * impedir crescimento ilimitado de memória.
 */
function evitarExpirados(agora: number): void {
  const chavesPorExpirar: string[] = [];
  for (const [chave, registro] of registros.entries()) {
    if (registro.expiraEm <= agora) {
      chavesPorExpirar.push(chave);
    }
  }
  for (const chave of chavesPorExpirar) {
    registros.delete(chave);
  }
}

/**
 * Contador de tentativas por chave (`ip:…`, `email:…`) numa janela deslizante.
 * Cadastro e recuperação de senha são superfície aberta na internet: sem isto,
 * a mesma rota serve para força bruta e para enumerar e-mails cadastrados.
 *
 * Se a memória atinge o cap de entradas, falha fechada (nega). Jamais falha
 * aberta — isso quebraria o propósito do rate limit.
 */
export function consumirTentativa(
  chave: string,
  limite: number,
  janelaMs: number,
): { permitido: boolean } {
  const agora = Date.now();

  // Evita crescimento ilimitado limpando expirados.
  evitarExpirados(agora);

  const atual = registros.get(chave);

  if (!atual || atual.expiraEm <= agora) {
    // Falha fechada: se está acima do cap, nega (evita DoS por nova chave).
    if (registros.size >= CAP_ENTRIES) {
      return { permitido: false };
    }

    registros.set(chave, { contagem: 1, expiraEm: agora + janelaMs });
    // Enforca limite na primeira tentativa também.
    return { permitido: 1 <= limite };
  }
  if (atual.contagem >= limite) return { permitido: false };

  atual.contagem += 1;
  return { permitido: true };
}

/** Só para teste — zera o estado do módulo entre casos. */
export function _limparParaTeste(): void {
  registros.clear();
}
