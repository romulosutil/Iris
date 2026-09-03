import { describe, expect, it } from "vitest";
import {
  COPY_ERROS,
  copyDeErro,
  ErroComCopy,
  mensagemDeErro,
  mensagemDeExcecao,
  textoDeErro,
  textoErroInterno,
} from "./erros";

describe("COPY_ERROS", () => {
  it("toda chave tem `titulo` e `acao` não vazios, em pt-BR literal", () => {
    for (const [codigo, copy] of Object.entries(COPY_ERROS)) {
      expect(copy.titulo.trim(), codigo).not.toBe("");
      expect(copy.acao.trim(), codigo).not.toBe("");
      // Sem culpa: nada de "você errou", "inválido" apontando para a pessoa.
      expect(copy.titulo, codigo).not.toMatch(/você errou|culpa/i);
    }
  });

  it("cobre o mínimo da issue: sentinela de concorrência, interno e SQLSTATEs", () => {
    for (const chave of [
      "CONCURRENCY_ERROR",
      "ERRO_INTERNO",
      "23505",
      "23503",
      "23P01",
      "42501",
      "P0001",
    ]) {
      expect(COPY_ERROS, chave).toHaveProperty(chave);
    }
  });
});

describe("copyDeErro / textoDeErro", () => {
  it("código desconhecido (ou ausente) cai em ERRO_INTERNO", () => {
    expect(copyDeErro("XX000")).toBe(COPY_ERROS.ERRO_INTERNO);
    expect(copyDeErro(undefined)).toBe(COPY_ERROS.ERRO_INTERNO);
  });

  it("texto = titulo + acao, com o correlacaoId no lugar de {codigo}", () => {
    expect(textoDeErro("ERRO_INTERNO", "abcd1234")).toBe(
      "Não foi possível concluir. Tente de novo; se repetir, avise a coordenação (código abcd1234).",
    );
    expect(textoErroInterno("abcd1234")).toBe(
      textoDeErro("ERRO_INTERNO", "abcd1234"),
    );
  });

  it("sem correlacaoId o parêntese do código some, em vez de ficar '{codigo}' cru", () => {
    const texto = textoDeErro("ERRO_INTERNO");
    expect(texto).not.toContain("{codigo}");
    expect(texto).not.toContain("código");
    expect(texto).toBe(
      "Não foi possível concluir. Tente de novo; se repetir, avise a coordenação.",
    );
  });

  it("CONCURRENCY_ERROR tem a copy da issue", () => {
    expect(textoDeErro("CONCURRENCY_ERROR")).toBe(
      "Alguém alterou esta evidência antes de você. Recarregue para ver a versão atual.",
    );
  });
});

describe("mensagemDeErro (fronteira da UI)", () => {
  it("traduz sentinela técnica para copy; deixa passar texto já humano", () => {
    expect(mensagemDeErro("CONCURRENCY_ERROR")).toBe(
      textoDeErro("CONCURRENCY_ERROR"),
    );
    expect(mensagemDeErro("Informe o nome.")).toBe("Informe o nome.");
    expect(mensagemDeErro(undefined)).toBeUndefined();
  });
});

describe("mensagemDeExcecao (S-10)", () => {
  it("erro de driver NUNCA chega à UI: vira copy do dicionário + código", () => {
    const params = "paciente relatou ideação suicida";
    const err = new Error(`Failed query: insert…\nparams: ${params}`, {
      cause: Object.assign(new Error("x"), { code: "23505" }),
    });
    err.name = "DrizzleQueryError";
    const texto = mensagemDeExcecao(err, "abcd1234");
    expect(texto).not.toContain(params);
    expect(texto).not.toContain("Failed query");
    expect(texto).toBe(textoDeErro("23505", "abcd1234"));
  });

  it("Error genérico (sem SQLSTATE) vira ERRO_INTERNO com o correlacaoId", () => {
    expect(mensagemDeExcecao(new Error("segredo"), "abcd1234")).toBe(
      textoErroInterno("abcd1234"),
    );
  });

  it("ErroComCopy é a ÚNICA exceção cuja message atravessa (é copy por construção)", () => {
    const e = new ErroComCopy("Este CPF já está cadastrado nesta clínica.");
    expect(mensagemDeExcecao(e, "abcd1234")).toBe(
      "Este CPF já está cadastrado nesta clínica.",
    );
    expect(e.name).toBe("ErroComCopy");
  });
});
