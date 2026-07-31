import "server-only";
import { sql } from "drizzle-orm";
import { authDb } from "@/db/client";

/**
 * Lançado quando o store de throttle não respondeu. Existe para que quem chama
 * seja OBRIGADO a decidir: aqui a decisão é FALHAR FECHADO (bloquear a
 * tentativa). Devolver `{ permitido: true }` num catch transformaria uma queda
 * do Postgres em "rota de verificação de credencial sem limite nenhum".
 */
export class ThrottleIndisponivel extends Error {
  constructor(causa: unknown) {
    super("throttle: store indisponível — tentativa bloqueada (fail-closed)");
    this.name = "ThrottleIndisponivel";
    this.cause = causa;
  }
}

// Limpeza oportunista: no máximo uma varredura por instância a cada 5 min. Não
// é correção (uma entrada expirada já não conta — a janela é comparada com
// `now()` na própria instrução), só higiene de tamanho da tabela.
const INTERVALO_LIMPEZA_MS = 5 * 60 * 1000;
let ultimaLimpezaEm = 0;

function limparOportunisticamente(): void {
  const agora = Date.now();
  if (agora - ultimaLimpezaEm < INTERVALO_LIMPEZA_MS) return;
  ultimaLimpezaEm = agora;
  void authDb
    .execute(
      sql`DELETE FROM auth_throttle WHERE janela_expira_em < now() - interval '1 hour'`,
    )
    .catch(() => {
      // Higiene, não segurança: falhar aqui não pode derrubar a requisição.
    });
}

/**
 * Registra UMA tentativa contra `chave` e diz se ela é permitida.
 *
 * ANTI-FORÇA-BRUTA, não só anti-enumeração. A rota pública de cadastro
 * verifica senha de e-mails existentes por `auth.$context`
 * (`src/auth/cadastro.ts`), caminho que NÃO passa por `auth.handler` — logo o
 * rate limiting, o contador de falha e o lockout do Better-Auth não rodam.
 * Este contador é a única proteção que existe ali, e por isso ele:
 *
 * - vive no Postgres (compartilhado entre réplicas e sobrevivendo a deploy),
 *   não num `Map` por processo como `src/lib/rate-limit.ts`;
 * - é atômico: `INSERT … ON CONFLICT DO UPDATE … RETURNING` resolve leitura,
 *   incremento e decisão numa única instrução, então N requisições
 *   simultâneas contam N (sem janela de corrida read-modify-write);
 * - aplica BACKOFF EXPONENCIAL: passado o limite, cada tentativa excedente
 *   empurra o fim da janela para `janelaSegundos * 2^(excesso)`, com teto em
 *   `tetoSegundos`. Sem backoff, um atacante recupera `limite` tentativas a
 *   cada janela indefinidamente.
 *
 * NÃO diferencia "falha" de "sucesso": quem chama registra a tentativa ANTES
 * de saber o resultado, e nunca depois. É o que impede o contador de virar o
 * oráculo de enumeração que o núcleo deixou de ser — um contador que só sobe
 * em falha subiria só para e-mails existentes.
 *
 * @param limite      tentativas permitidas por janela
 * @param janelaSegundos duração da janela deslizante
 * @param tetoSegundos   teto do backoff
 * @throws {ThrottleIndisponivel} se o store falhar — NUNCA devolve permitido.
 */
export async function registrarTentativa(
  chave: string,
  limite: number,
  janelaSegundos: number,
  tetoSegundos: number,
): Promise<{ permitido: boolean }> {
  limparOportunisticamente();

  let contagem: number;
  try {
    const linhas = (await authDb.execute(sql`
      INSERT INTO auth_throttle (chave, contagem, janela_expira_em)
      VALUES (${chave}, 1, now() + make_interval(secs => ${janelaSegundos}))
      ON CONFLICT (chave) DO UPDATE SET
        contagem = CASE
          WHEN auth_throttle.janela_expira_em <= now() THEN 1
          ELSE auth_throttle.contagem + 1
        END,
        janela_expira_em = CASE
          WHEN auth_throttle.janela_expira_em <= now()
            THEN now() + make_interval(secs => ${janelaSegundos})
          WHEN auth_throttle.contagem + 1 > ${limite}
            THEN now() + make_interval(secs => LEAST(
              ${janelaSegundos}::double precision
                * power(2, auth_throttle.contagem + 1 - ${limite}),
              ${tetoSegundos}::double precision
            ))
          ELSE auth_throttle.janela_expira_em
        END,
        atualizado_em = now()
      RETURNING contagem
    `)) as unknown as { contagem: number | string }[];

    contagem = Number(linhas[0]?.contagem);
    if (!Number.isFinite(contagem)) {
      throw new Error("throttle: RETURNING não devolveu contagem");
    }
  } catch (err) {
    throw new ThrottleIndisponivel(err);
  }

  return { permitido: contagem <= limite };
}
