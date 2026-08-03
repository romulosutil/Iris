import "server-only";

type Registro = { contagem: number; expiraEm: number };

// Em memória, por instância. Suficiente para o MVP num único container; se o
// app escalar horizontalmente isto vira Postgres ou Redis — a assinatura não muda.
// Cap de 10k entradas previne DoS por enumeração de e-mails (chaves controladas
// pelo atacante). Expirações são evitadas oportunisticamente em cada escrita.
const registros = new Map<string, Registro>();
// Exportado só para o teste montar o cenário de lotação (Finding 1 da review
// da PR #166) sem hardcodar o número em dois lugares.
export const CAP_ENTRIES = 10_000;

// Finding 4 da review da PR #166: varrer o mapa inteiro em toda escrita é
// O(N) na hot path de uma rota pública. Amortizamos varrendo no máximo uma
// vez por INTERVALO_VARREDURA_MS — comportamento observável não muda (uma
// entrada expirada nunca conta como tentativa viva, porque `consumirTentativa`
// já trata `atual.expiraEm <= agora` como "não existe" antes de usar `atual`),
// só a frequência da limpeza de memória muda.
const INTERVALO_VARREDURA_MS = 1_000;
let ultimaVarreduraEm = 0;

/**
 * Remove entradas expiradas do mapa. Amortizado: só varre de fato se já
 * passou `INTERVALO_VARREDURA_MS` desde a última varredura, para não pesar a
 * thread principal em toda requisição sob tráfego volumétrico.
 */
function evitarExpirados(agora: number): void {
  if (agora - ultimaVarreduraEm < INTERVALO_VARREDURA_MS) return;
  ultimaVarreduraEm = agora;

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
 * Despeja a entrada cujo reset está mais próximo (a que expiraria primeiro).
 * Chamado só quando o mapa está no cap e uma chave nova precisa de espaço.
 */
function despejarMaisProximoDoReset(): void {
  let chaveAlvo: string | undefined;
  let menorExpiraEm = Infinity;
  for (const [chave, registro] of registros.entries()) {
    if (registro.expiraEm < menorExpiraEm) {
      menorExpiraEm = registro.expiraEm;
      chaveAlvo = chave;
    }
  }
  if (chaveAlvo !== undefined) {
    registros.delete(chaveAlvo);
  }
}

/**
 * Contador de tentativas por chave (`ip:…`, `email:…`) numa janela deslizante.
 * Cadastro e recuperação de senha são superfície aberta na internet: sem isto,
 * a mesma rota serve para força bruta e para enumerar e-mails cadastrados.
 *
 * Se a memória atinge o cap de entradas para uma chave NOVA, despeja a
 * entrada cujo reset está mais próximo em vez de falhar fechada ou aberta
 * (Finding 1 da review da PR #166 — fail-closed aqui é DoS trivial: um
 * atacante lota o mapa com chaves controláveis, como e-mails falsos, e
 * bloqueia login/cadastro para todo mundo até o fim da janela).
 *
 * Trade-off registrado por escrito porque quem ler isso depois precisa ver:
 * despejo devolve disponibilidade, mas dá ao atacante um caminho para
 * *esvaziar* o contador de uma vítima enchendo o mapa (ele perde a própria
 * entrada e ganha uma nova). É a troca certa aqui porque este limitador é
 * anti-enumeração numa rota pública, não um controle de autorização — o pior
 * caso é a vítima ganhar uma tentativa extra, não um bypass de autenticação.
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
    // No cap: despeja a entrada com reset mais próximo para abrir espaço.
    if (registros.size >= CAP_ENTRIES) {
      despejarMaisProximoDoReset();
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
  ultimaVarreduraEm = 0;
}

/** Só para teste — observa o tamanho real do mapa (prova de despejo/limpeza). */
export function _tamanhoParaTeste(): number {
  return registros.size;
}
