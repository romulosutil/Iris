/**
 * Testes do pipeline de chunking + embedding (D11 / #260, T3).
 *
 * O provedor de embedding e a transação de tenant são DUBLÊS. O que se prova
 * aqui é o que o pipeline decide — ordem dos passos, fail-closed, determinismo
 * do chunking, contrato de dimensão — e não o que o Gemini responde. O
 * isolamento e o gate de consentimento têm oráculo próprio, no banco:
 * `db/tests/rag-multitenant-rls.int.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execucoes: { texto: string; sql: unknown }[] = [];

vi.mock("server-only", () => ({}));
vi.mock("@/db/rls", () => ({
  withTenant: async (
    _ctx: unknown,
    fn: (tx: { execute: (q: unknown) => Promise<void> }) => Promise<unknown>,
  ) =>
    fn({
      execute: async (q: unknown) => {
        // O objeto `SQL` do Drizzle não tem `toString` útil (`[object Object]`).
        // `JSON.stringify` expõe `queryChunks`, que é onde o texto literal
        // (`SELECT app_rag_indexar_chunk(`) e os parâmetros aparecem.
        execucoes.push({ texto: JSON.stringify(q), sql: q });
      },
    }),
}));

const {
  chunkarTexto,
  indexarNota,
  DIMENSAO_EMBEDDING,
  MAX_CHARS_CHUNK,
  OVERLAP_CHARS_CHUNK,
} = await import("./rag-pipeline");

/** Provedor dublê: vetor determinístico por texto, sem rede e sem custo. */
function providerFake(dimensao = DIMENSAO_EMBEDDING) {
  const chamadas: string[][] = [];
  return {
    modelo: "dubl-embed-v0",
    chamadas,
    async gerar(textos: readonly string[]) {
      chamadas.push([...textos]);
      return textos.map((t) => {
        const v = new Array<number>(dimensao).fill(0);
        v[t.length % dimensao] = 1;
        return v;
      });
    },
  };
}

const CTX = {
  clinicId: "00000000-0000-0000-0000-0000000000a1",
  userId: "00000000-0000-0000-0000-0000000000u1",
  role: "coordenador" as const,
};

const NOTA = "00000000-0000-0000-0000-0000000000n1";

beforeEach(() => {
  execucoes.length = 0;
  process.env.RAG_INDEXACAO_ENABLED = "true";
});

afterEach(() => {
  delete process.env.RAG_INDEXACAO_ENABLED;
  delete process.env.RAG_EMBEDDING_MODEL;
});

describe("chunkarTexto", () => {
  it("texto curto vira um chunk só, sem espaço sobrando", () => {
    expect(chunkarTexto("  Sessão tranquila.  ")).toEqual([
      { indice: 0, texto: "Sessão tranquila." },
    ]);
  });

  it("texto vazio ou só espaço não gera chunk", () => {
    expect(chunkarTexto("")).toEqual([]);
    expect(chunkarTexto("   \n\n  ")).toEqual([]);
  });

  it("respeita a janela máxima e numera os índices em sequência a partir de 0", () => {
    const paragrafo = "Frase de tamanho médio sobre o repertório observado. ";
    const texto = Array.from({ length: 200 }, () => paragrafo).join("");
    const chunks = chunkarTexto(texto);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.indice)).toEqual(
      chunks.map((_, i) => i), // 0,1,2,… sem buraco
    );
    for (const c of chunks)
      expect(c.texto.length).toBeLessThanOrEqual(MAX_CHARS_CHUNK);
  });

  it("é determinístico — a mesma entrada devolve exatamente os mesmos chunks", () => {
    const texto = Array.from(
      { length: 60 },
      (_, i) =>
        `Parágrafo ${i} com conteúdo clínico suficiente para forçar corte.`,
    ).join("\n\n");
    expect(chunkarTexto(texto)).toEqual(chunkarTexto(texto));
  });

  it("nunca corta no meio de palavra", () => {
    const texto = Array.from({ length: 400 }, () => "palavralonga").join(" ");
    for (const c of chunkarTexto(texto)) {
      // Toda "palavra" do texto é a mesma; um corte no meio produziria um
      // fragmento diferente de "palavralonga".
      for (const palavra of c.texto.split(/\s+/)) {
        expect(palavra).toBe("palavralonga");
      }
    }
  });

  it("chunks vizinhos se sobrepõem — o contexto da fronteira não se perde", () => {
    const texto = Array.from(
      { length: 120 },
      (_, i) =>
        `Marcador${i} descreve antecedente e consequência da tentativa.`,
    ).join(" ");
    const chunks = chunkarTexto(texto);
    expect(chunks.length).toBeGreaterThan(1);

    const fimDoPrimeiro = chunks[0]!.texto.slice(-OVERLAP_CHARS_CHUNK);
    const primeiraPalavraDaCauda = fimDoPrimeiro.split(/\s+/).slice(1)[0]!;
    expect(chunks[1]!.texto).toContain(primeiraPalavraDaCauda);
  });

  it("uma frase maior que a janela é fatiada, não descartada", () => {
    const monolito = Array.from({ length: 500 }, () => "termo").join(" ");
    const chunks = chunkarTexto(monolito, { maxChars: 300, overlapChars: 30 });
    expect(chunks.length).toBeGreaterThan(1);
    const reconstruido = chunks.map((c) => c.texto).join(" ");
    expect(reconstruido).toContain("termo termo");
  });
});

describe("indexarNota · gates antes de qualquer chamada paga", () => {
  it("com a flag desligada não sanitiza, não chama o provedor e não grava", async () => {
    delete process.env.RAG_INDEXACAO_ENABLED;
    const provider = providerFake();

    const r = await indexarNota(
      CTX,
      { sessionNoteId: NOTA, texto: "João brincou.", identidades: {} },
      provider,
    );

    expect(r).toEqual({ status: "desligado" });
    expect(provider.chamadas).toEqual([]);
    expect(execucoes).toEqual([]);
  });

  it("sanitiza ANTES do embedding — o provedor nunca vê o nome do paciente", async () => {
    const provider = providerFake();

    await indexarNota(
      CTX,
      {
        sessionNoteId: NOTA,
        texto: "João Pedro Silva apontou para o item 3 vezes.",
        identidades: { nomePaciente: "João Pedro Silva" },
      },
      provider,
    );

    const textosEnviados = provider.chamadas.flat().join(" ");
    expect(textosEnviados).not.toContain("João");
    expect(textosEnviados).not.toContain("Silva");
    expect(textosEnviados).toContain("[PACIENTE_ID]");
  });

  it("aborta ANTES do provedor se sobrar PII estrutural (2ª linha de defesa)", async () => {
    // Com o sanitizador ÍNTEGRO este caminho é inalcançável — e é para ser: o
    // assert existe contra a REGRESSÃO do sanitizador, não contra a entrada.
    // Testá-lo exige simular exatamente essa regressão, e é o que o stub faz:
    // devolve o texto cru como se tivesse sanitizado. Sem este caso, um `if`
    // apagado no `indexarNota` não derrubaria teste nenhum.
    const sanitizer = await import("./pii-sanitizer");
    const stub = vi.spyOn(sanitizer, "sanitizarPII").mockReturnValue({
      texto: "responsável no 11987654321 e no mae@exemplo.com",
      ocorrencias: [],
      limpo: true,
    });
    const provider = providerFake();

    await expect(
      indexarNota(
        CTX,
        { sessionNoteId: NOTA, texto: "irrelevante", identidades: {} },
        provider,
      ),
    ).rejects.toThrow(/PII estrutural/);

    expect(provider.chamadas).toEqual([]);
    expect(execucoes).toEqual([]);
    stub.mockRestore();
  });

  it("recusa vetor com dimensão diferente da coluna e NÃO grava nada", async () => {
    const provider = providerFake(512);

    await expect(
      indexarNota(
        CTX,
        { sessionNoteId: NOTA, texto: "Sessão tranquila.", identidades: {} },
        provider,
      ),
    ).rejects.toThrow(/768/);

    expect(execucoes).toEqual([]);
  });

  it("recusa quando o provedor devolve menos vetores que chunks", async () => {
    const provider = {
      modelo: "dubl-embed-v0",
      async gerar() {
        return [];
      },
    };
    await expect(
      indexarNota(
        CTX,
        { sessionNoteId: NOTA, texto: "Sessão tranquila.", identidades: {} },
        provider,
      ),
    ).rejects.toThrow(/0 vetores para 1 chunks/);
    expect(execucoes).toEqual([]);
  });

  it("texto que sanitiza para vazio não gera chamada nem escrita", async () => {
    const provider = providerFake();
    const r = await indexarNota(
      CTX,
      { sessionNoteId: NOTA, texto: "   \n\n  ", identidades: {} },
      provider,
    );
    expect(r).toEqual({ status: "vazio" });
    expect(provider.chamadas).toEqual([]);
    expect(execucoes).toEqual([]);
  });
});

describe("indexarNota · escrita", () => {
  it("grava um chunk por vez pelo definer, dentro de withTenant", async () => {
    const provider = providerFake();
    const texto = Array.from(
      { length: 80 },
      (_, i) =>
        `Parágrafo ${i} com conteúdo clínico bastante para forçar corte de janela.`,
    ).join("\n\n");

    const r = await indexarNota(
      CTX,
      { sessionNoteId: NOTA, texto, identidades: {} },
      provider,
    );

    expect(r.status).toBe("indexado");
    const chunks = chunkarTexto(texto);
    expect(r).toEqual({
      status: "indexado",
      chunks: chunks.length,
      modelo: "dubl-embed-v0",
    });
    // Uma execução por chunk — e todas passam por `app_rag_indexar_chunk`,
    // que é onde mora o gate de consentimento. Nenhum INSERT direto.
    expect(execucoes.length).toBe(chunks.length);
    for (const e of execucoes) {
      expect(e.texto).toContain("app_rag_indexar_chunk");
    }
  });

  it("não engole erro do banco — a recusa do definer sobe para o chamador", async () => {
    const provider = providerFake();
    const rls = await import("@/db/rls");
    const espia = vi.spyOn(rls, "withTenant").mockRejectedValueOnce(
      Object.assign(new Error("Failed query"), {
        cause: { code: "P0001", message: "sem consentimento vigente" },
      }),
    );

    await expect(
      indexarNota(
        CTX,
        { sessionNoteId: NOTA, texto: "Sessão tranquila.", identidades: {} },
        provider,
      ),
    ).rejects.toThrow(/Failed query/);

    espia.mockRestore();
  });
});
