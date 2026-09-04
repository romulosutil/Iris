// @vitest-environment node
/**
 * #494 / T22 — a AUTORIZAÇÃO da rota do worker de ASR, medida sozinha.
 *
 * POR QUE UM ARQUIVO NOVO, unitário, e não mais casos no `route.int.test.ts`:
 * a checagem de bearer (`autorizado()`, route.ts) acontece ANTES de qualquer
 * ida ao banco. Amarrar a cobertura dela ao Postgres real significa que ela
 * some inteira quando o `describe.skipIf(!hasDb)` pula o arquivo — e um guard
 * de autenticação que só existe quando o banco existe não é um guard.
 *
 * O QUE A SUÍTE ANTERIOR NÃO PEGAVA (achado T22): os dois únicos casos eram
 * "sem header" e `"Bearer token-errado"` — 13 bytes contra um token de 23. A
 * comparação em tempo constante curto-circuita no `a.length !== b.length`
 * ANTES do `timingSafeEqual`, então mutar o `return timingSafeEqual(a, b)`
 * para `return true` mantinha os dois verdes: qualquer portador com o
 * comprimento certo seria aceito. E `ASR_JOB_TOKEN` era sempre definido no
 * `beforeEach`, deixando "env ausente recusa tudo" com cobertura ZERO.
 *
 * Por isso todo token errado aqui é construído com o MESMO número de bytes do
 * certo: é o único formato de entrada que atravessa o filtro de comprimento e
 * chega no comparador de verdade.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  capturarLog,
  type CapturaDeLog,
} from "@/lib/observabilidade/captura-de-log";

// O módulo da rota importa `asrWorkerDb` no topo. Dublado para (a) o teste não
// precisar de Postgres e (b) o número de chamadas virar o ORÁCULO de "passou
// da autorização": zero chamadas prova que a recusa aconteceu antes da fila.
const execute = vi.fn();
vi.mock("@/db/client", () => ({
  asrWorkerDb: { execute: (...args: unknown[]) => execute(...args) },
  db: {},
  authDb: {},
}));

// Storage e provider não devem sequer ser alcançados nestes testes; dublados
// para que, se algum dia forem, a falha seja evidente e não uma ida à rede.
vi.mock("@/lib/asr/storage", () => ({
  ler: vi.fn(),
  guardar: vi.fn(),
  apagar: vi.fn(),
}));

const { POST } = await import("./route");

// 23 bytes ASCII — o mesmo comprimento usado no `route.int.test.ts`.
const TOKEN = "token-do-job-asr-72-t07";
const URL_ROTA = "http://localhost/api/internal/jobs/asr-transcrever";

function requisicao(authorization?: string | null): Request {
  const headers = new Headers();
  if (authorization != null) headers.set("authorization", authorization);
  return new Request(URL_ROTA, { method: "POST", headers });
}

/** Token errado com EXATAMENTE o mesmo número de bytes do certo. */
function mesmoComprimento(preenchimento: string): string {
  return preenchimento.repeat(TOKEN.length).slice(0, TOKEN.length);
}

describe("POST /api/internal/jobs/asr-transcrever — autorização (#494/T22)", () => {
  const envOriginal = process.env.ASR_JOB_TOKEN;

  beforeEach(() => {
    execute.mockReset();
    // Tick vazio: o backstop devolve 0 expirados e a reserva devolve fila
    // vazia. Serve só para o caminho AUTORIZADO conseguir chegar ao 200.
    execute.mockResolvedValue([{ expirados: 0 }]);
    process.env.ASR_JOB_TOKEN = TOKEN;
  });

  afterEach(() => {
    if (envOriginal === undefined) delete process.env.ASR_JOB_TOKEN;
    else process.env.ASR_JOB_TOKEN = envOriginal;
  });

  it("token do MESMO comprimento mas conteúdo diferente é recusado (401) e não toca a fila", async () => {
    // ESTE é o caso que mata `return true` no comparador: 23 bytes de 'x'
    // passam pelo filtro de comprimento e só o `timingSafeEqual` os separa.
    const falso = mesmoComprimento("x");
    expect(falso).toHaveLength(TOKEN.length);
    expect(falso).not.toBe(TOKEN);

    const res = await POST(requisicao(`Bearer ${falso}`));

    expect(res.status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });

  it("token que difere do certo em UM único byte é recusado (401)", async () => {
    // Vizinho mais próximo possível: mesmo comprimento, mesmo prefixo, último
    // byte trocado. Nenhuma comparação por prefixo/`startsWith` sobrevive.
    const quase = `${TOKEN.slice(0, -1)}X`;
    expect(quase).toHaveLength(TOKEN.length);

    const res = await POST(requisicao(`Bearer ${quase}`));

    expect(res.status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });

  it("token certo com prefixo 'Bearer' ausente é recusado (401)", async () => {
    const res = await POST(requisicao(TOKEN));
    expect(res.status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });

  it("token certo com esquema errado ('Token ') é recusado (401)", async () => {
    const res = await POST(requisicao(`Token ${TOKEN}`));
    expect(res.status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });

  it("header ausente é recusado (401)", async () => {
    const res = await POST(requisicao(null));
    expect(res.status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });

  it("ASR_JOB_TOKEN AUSENTE recusa até o header bem formado — nunca 'libera porque não configurou'", async () => {
    // Cobertura zero até T22: o `beforeEach` do `route.int.test.ts` sempre
    // definia a env, então remover `if (!esperado)` de `autorizado()` não
    // derrubava nada. Sem env, `Buffer.from(undefined)` nem chega a existir —
    // a recusa tem que ser explícita.
    delete process.env.ASR_JOB_TOKEN;

    const res = await POST(requisicao(`Bearer ${TOKEN}`));

    expect(res.status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });

  it("ASR_JOB_TOKEN vazio recusa igual a ausente (env definida mas em branco)", async () => {
    // `""` é o formato real de "variável presente e vazia" no Easypanel —
    // salvar o campo em branco define a env, não a remove. `!esperado` cobre
    // os dois casos; sem ele, `""` cairia no comparador.
    //
    // NÃO dá para exercitar aqui o bearer VAZIO (`"Bearer "`), que seria o
    // par de comprimento 0 casando no `timingSafeEqual`: `Headers.set()`
    // normaliza o valor removendo o espaço final, então o header chega como
    // `"Bearer"` e morre antes, no `startsWith`. Um teste sobre ele passaria
    // pelo motivo errado.
    process.env.ASR_JOB_TOKEN = "";

    expect((await POST(requisicao(`Bearer ${TOKEN}`))).status).toBe(401);
    expect((await POST(requisicao("Bearer x"))).status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });

  it("CONTROLE POSITIVO: o token certo é aceito e o tick roda (200)", async () => {
    // Sem este caso, todos os 401 acima seriam satisfeitos por uma rota que
    // recusa TUDO — o teste de recusa só vale se a aceitação for observável.
    const res = await POST(requisicao(`Bearer ${TOKEN}`));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
    expect(execute).toHaveBeenCalled();
  });
});

/**
 * #560 / F3 — o log da rota, medido.
 *
 * Antes desta fatia os três sítios eram `console.warn`/`console.error` com a
 * contagem interpolada na frase, e NENHUM teste os observava: o guard de lint
 * garante que o `console` não volta, mas não garante que o registro que ficou
 * no lugar carrega o que o operador precisa. É o que estes casos medem —
 * evento de conjunto fechado, contagem como CAMPO, e a `message` fora.
 */
describe("POST /api/internal/jobs/asr-transcrever — log estruturado (#560/F3)", () => {
  const envOriginal = process.env.ASR_JOB_TOKEN;
  let log: CapturaDeLog;

  beforeEach(() => {
    execute.mockReset();
    process.env.ASR_JOB_TOKEN = TOKEN;
    log = capturarLog();
  });

  afterEach(() => {
    log.restaurar();
    if (envOriginal === undefined) delete process.env.ASR_JOB_TOKEN;
    else process.env.ASR_JOB_TOKEN = envOriginal;
  });

  it("backstop que expirou clipes registra a CONTAGEM como campo, não na frase", async () => {
    // Primeira chamada = backstop; segunda = reserva do lote (fila vazia).
    execute
      .mockResolvedValueOnce([{ expirados: 3 }])
      .mockResolvedValueOnce([])
      .mockResolvedValue([]);

    const res = await POST(requisicao(`Bearer ${TOKEN}`));
    expect(res.status).toBe(200);

    const registro = log.evento("asr-transcrever.backstop-expirou-presos");
    // O campo é o ponto da fatia: um número interpolado numa string obriga o
    // operador a extrair por regex e não sobrevive a nenhum agregador.
    expect(registro?.expirados).toBe(3);
    // 6h é a régua deliberadamente igual à do sweeper de órfãos
    // (`ASR_SWEEPER_LIMITE_HORAS`); se ela mudar aqui sem mudar lá, o par que
    // o comentário do `route.ts` documenta se desfez.
    expect(registro?.limiteHoras).toBe(6);
    expect(registro?.nivel).toBe("warn");
  });

  it("backstop com zero expirados NÃO registra — o silêncio é o caso normal", async () => {
    // Sem este caso, um `if (expirados >= 0)` passaria: a rotina rodaria
    // todo tick gravando uma linha que não significa nada, e a linha que
    // significa algo ficaria enterrada nela.
    execute.mockResolvedValue([{ expirados: 0 }]);

    await POST(requisicao(`Bearer ${TOKEN}`));

    expect(log.houve("asr-transcrever.backstop-expirou-presos")).toBe(false);
  });

  it("backstop que FALHA é registrado sem a message do driver, e o tick segue", async () => {
    const erro = Object.assign(
      new Error("SELECT app_asr_expirar_presos($1) -- params: transcrição"),
      { name: "DrizzleQueryError", code: "22001" },
    );
    execute.mockRejectedValueOnce(erro).mockResolvedValue([]);

    const res = await POST(requisicao(`Bearer ${TOKEN}`));

    // O tick não pode morrer porque a limpeza falhou: trocaria um vazamento
    // lento por uma parada total.
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      // `null`, não `0`: "o backstop falhou" é distinto de "rodou e não havia
      // nada a expirar".
      expirados: null,
    });

    const registro = log.evento("asr-transcrever.backstop-falhou");
    expect(registro?.nivel).toBe("error");
    expect(registro?.erroNome).toBe("DrizzleQueryError");
    // A `message` do driver é o SQL + os params — e um deles é a transcrição.
    expect(log.bruto()).not.toContain("transcrição");
  });

  it("falha do tick registra a classe do erro e devolve 500 sem vazar a message", async () => {
    const erro = Object.assign(
      new Error("SELECT app_asr_reservar($1) -- params: nota ditada da sessão"),
      { name: "DrizzleQueryError", code: "40001" },
    );
    // Backstop OK, reserva do lote explode: é o caminho do `catch` externo.
    execute.mockResolvedValueOnce([{ expirados: 0 }]).mockRejectedValue(erro);

    const res = await POST(requisicao(`Bearer ${TOKEN}`));

    expect(res.status).toBe(500);
    const registro = log.evento("asr-transcrever.tick-falhou");
    expect(registro?.erroNome).toBe("DrizzleQueryError");
    expect(registro?.codigo).toBe("40001");
    expect(log.bruto()).not.toContain("nota ditada");
  });
});
