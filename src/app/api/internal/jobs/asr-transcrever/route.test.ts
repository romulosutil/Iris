import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";
import { db } from "@/db/client";
import * as storage from "@/lib/asr/storage";
import * as provider from "@/lib/asr/provider";

/**
 * Guard de vazamento de texto clínico pela fronteira HTTP do worker (#494, T16).
 *
 * O medo concreto: `concluirClipe` manda a transcrição como parâmetro vinculado
 * (`app_asr_concluir($1, $2)`). O `DrizzleQueryError` monta sua `.message` como
 * "Failed query: …\nparams: …" — COM o texto dentro. Se essa mensagem virar
 * corpo de resposta, ela termina na linha de log do
 * `scripts/disparo-asr-transcrever.mjs`, num painel Easypanel servido em HTTP
 * puro. Mesma classe da memória `campo-livre-de-terceiro-carrega-pii`.
 *
 * Por isso o oráculo destes testes é sobre o `JSON.stringify` do corpo INTEIRO,
 * e não sobre um campo nomeado: um campo novo que voltasse a ecoar a mensagem
 * crua reprova aqui sem ninguém precisar lembrar de atualizar a assertiva.
 */

vi.mock("@/db/client", () => ({
  db: { execute: vi.fn() },
}));

vi.mock("@/lib/asr/storage", () => ({
  ler: vi.fn(),
  apagar: vi.fn(),
}));

vi.mock("@/lib/asr/provider", async (importOriginal) => {
  // `AsrProviderError` REAL: a rota classifica por `instanceof`, e um dublê da
  // classe faria o teste de saturação passar pelo caminho errado.
  const original = await importOriginal<typeof provider>();
  return { ...original, getAsrProvider: vi.fn() };
});

const TOKEN = "token-secreto-asr-123";

// Texto que finge ser a nota de sessão ditada. Distinto o bastante para que uma
// busca por substring no corpo não case por acidente.
const TEXTO_CLINICO =
  "paciente relatou ideacao suicida na sessao de terca-feira";

const CLIPE = {
  id: "11111111-1111-4111-8111-111111111111",
  clinic_id: "22222222-2222-4222-8222-222222222222",
  objeto_ref: "lote-abc:0",
  lote_id: "lote-abc",
  ordem: 0,
};

/** Espelha o formato real: `DrizzleQueryError` carrega os params na `.message`. */
function erroDoBancoComTexto(texto: string): Error {
  const err = new Error(
    `Failed query: select app_asr_concluir($1, $2)\nparams: ${CLIPE.id},${texto}`,
  );
  err.name = "DrizzleQueryError";
  (err as Error & { cause?: unknown }).cause = Object.assign(
    new Error("value too long for type character varying"),
    { code: "22001" },
  );
  return err;
}

function requisicaoAutorizada(): Request {
  return new Request("http://localhost/api/internal/jobs/asr-transcrever", {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}` },
  });
}

describe("POST /api/internal/jobs/asr-transcrever — categoria fechada (T16)", () => {
  const envOriginal = process.env.ASR_JOB_TOKEN;
  let erroDeLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.ASR_JOB_TOKEN = TOKEN;
    vi.clearAllMocks();
    erroDeLog = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(storage.ler).mockResolvedValue(new Uint8Array([1, 2, 3]));
    vi.mocked(storage.apagar).mockResolvedValue(undefined);
    vi.mocked(provider.getAsrProvider).mockReturnValue({
      transcrever: vi.fn().mockResolvedValue({ texto: TEXTO_CLINICO }),
    });
  });

  afterEach(() => {
    erroDeLog.mockRestore();
    process.env.ASR_JOB_TOKEN = envOriginal;
  });

  /**
   * A rota faz quatro consultas distintas pelo mesmo `db.execute`; distinguir
   * pelo objeto `sql` exigiria remontar os chunks do Drizzle. A ORDEM das
   * chamadas dentro de um tick de um clipe é determinística
   * (reservar → concluir → falhar → objetos_em_uso), então o dublê responde
   * por posição.
   */
  function agendarChamadasDoBanco(aoConcluir: () => unknown) {
    let chamada = 0;
    vi.mocked(db.execute).mockImplementation((async () => {
      chamada += 1;
      if (chamada === 1) return [CLIPE] as unknown;
      if (chamada === 2) return aoConcluir();
      return [] as unknown;
    }) as unknown as typeof db.execute);
  }

  it("não ecoa a transcrição no corpo quando o banco falha ao concluir", async () => {
    agendarChamadasDoBanco(() => {
      throw erroDoBancoComTexto(TEXTO_CLINICO);
    });

    const res = await POST(requisicaoAutorizada());
    expect(res.status).toBe(200);
    const corpo = await res.json();

    expect(JSON.stringify(corpo)).not.toContain(TEXTO_CLINICO);
    expect(corpo.resultados).toHaveLength(1);
    expect(corpo.resultados[0]).toEqual({
      id: CLIPE.id,
      desfecho: "falhou",
      categoria: "erro_interno",
    });

    // O log da app também não pode carregar a nota: o Easypanel serve o painel
    // em HTTP puro, e o log do container é lido lá.
    const logado = erroDeLog.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
    expect(logado).not.toContain(TEXTO_CLINICO);
  });

  it("preserva a classificação do provider como categoria fechada", async () => {
    vi.mocked(provider.getAsrProvider).mockReturnValue({
      transcrever: vi.fn().mockRejectedValue(
        new provider.AsrProviderError("serviço saturado", "saturacao", {
          status: 503,
        }),
      ),
    });
    agendarChamadasDoBanco(() => []);

    const res = await POST(requisicaoAutorizada());
    const corpo = await res.json();

    expect(corpo.revertidos).toBe(1);
    expect(corpo.resultados[0]).toEqual({
      id: CLIPE.id,
      desfecho: "revertido",
      categoria: "saturacao",
    });
  });

  it("não ecoa texto na resposta 500 quando o tick inteiro falha", async () => {
    vi.mocked(db.execute).mockImplementation((async () => {
      throw erroDoBancoComTexto(TEXTO_CLINICO);
    }) as unknown as typeof db.execute);

    const res = await POST(requisicaoAutorizada());
    expect(res.status).toBe(500);
    const corpo = await res.json();

    expect(JSON.stringify(corpo)).not.toContain(TEXTO_CLINICO);
    expect(corpo).toEqual({ ok: false, categoria: "erro_interno" });

    const logado = erroDeLog.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
    expect(logado).not.toContain(TEXTO_CLINICO);
  });
});
