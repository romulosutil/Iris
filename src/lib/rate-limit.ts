import "server-only";

type Registro = { contagem: number; expiraEm: number };

// Em memória, por instância. Suficiente para o MVP num único container; se o
// app escalar horizontalmente isto vira Postgres ou Redis — a assinatura não muda.
const registros = new Map<string, Registro>();

/**
 * Contador de tentativas por chave (`ip:…`, `email:…`) numa janela deslizante.
 * Cadastro e recuperação de senha são superfície aberta na internet: sem isto,
 * a mesma rota serve para força bruta e para enumerar e-mails cadastrados.
 */
export function consumirTentativa(
  chave: string,
  limite: number,
  janelaMs: number,
): { permitido: boolean } {
  const agora = Date.now();
  const atual = registros.get(chave);

  if (!atual || atual.expiraEm <= agora) {
    registros.set(chave, { contagem: 1, expiraEm: agora + janelaMs });
    return { permitido: true };
  }
  if (atual.contagem >= limite) return { permitido: false };

  atual.contagem += 1;
  return { permitido: true };
}

/** Só para teste — zera o estado do módulo entre casos. */
export function _limparParaTeste(): void {
  registros.clear();
}
