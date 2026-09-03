import { describe, it, expect } from "vitest";
import { capacidadesDaModalidade } from "./modalidade";

describe("capacidadesDaModalidade", () => {
  it("protocol_driven: Evolução existe, aba central é PEI & Metas, tem Anamnese", () => {
    const c = capacidadesDaModalidade("protocol_driven");
    expect(c.temEvolucao).toBe(true);
    expect(c.temAnamnese).toBe(true);
    expect(c.leituraDeEvolucao).toBe("protocolo");
    expect(c.abaCentral).toEqual({ slug: "metas", rotulo: "PEI & Metas" });
  });

  it("cognitive_behavioral: Evolução existe, com leitura própria, SEM Anamnese", () => {
    const c = capacidadesDaModalidade("cognitive_behavioral");
    expect(c.temEvolucao).toBe(true);
    expect(c.temAnamnese).toBe(false);
    expect(c.leituraDeEvolucao).toBe("tcc");
    expect(c.abaCentral).toEqual({ slug: "tcc", rotulo: "TCC" });
  });

  it("conventional: NÃO tem Evolução nem Anamnese — acompanhamento é narrativo", () => {
    const c = capacidadesDaModalidade("conventional");
    expect(c.temEvolucao).toBe(false);
    expect(c.temAnamnese).toBe(false);
    expect(c.leituraDeEvolucao).toBeNull();
    expect(c.rotaDeEntrada).toBe("temas");
  });

  it("modalidade não resolvida: sem aba central nem Anamnese, mas Evolução continua acessível", () => {
    // Paciente cuja ficha ainda não tem modalidade gravada precisa navegar.
    // Fechar a Evolução aqui deixaria o prontuário sem porta de entrada.
    const c = capacidadesDaModalidade(null);
    expect(c.abaCentral).toBeNull();
    expect(c.temEvolucao).toBe(true);
    expect(c.temAnamnese).toBe(false);
    expect(c.leituraDeEvolucao).toBe("protocolo");
    expect(c.rotaDeEntrada).toBeNull();
  });
});

describe("degraus de prontidão", () => {
  it("protocol_driven exige protocolo e meta, e recomenda ficha e anamnese", () => {
    const c = capacidadesDaModalidade("protocol_driven");
    expect(c.degrausProntidao).toEqual([
      "admissao",
      "ficha_clinica",
      "anamnese",
      "protocolo",
      "meta",
      "primeira_sessao",
    ]);
    expect(c.degrausBloqueantes).toEqual(["protocolo", "meta"]);
  });

  it("cognitive_behavioral exige instrumento, não protocolo nem meta", () => {
    const c = capacidadesDaModalidade("cognitive_behavioral");
    expect(c.degrausProntidao).toEqual([
      "admissao",
      "ficha_clinica",
      "instrumento",
      "primeira_sessao",
    ]);
    expect(c.degrausBloqueantes).toEqual(["instrumento"]);
  });

  it("conventional não bloqueia nada — acompanhamento é narrativo", () => {
    const c = capacidadesDaModalidade("conventional");
    expect(c.degrausProntidao).toEqual([
      "admissao",
      "ficha_clinica",
      "primeira_sessao",
    ]);
    expect(c.degrausBloqueantes).toEqual([]);
  });

  it("modalidade não resolvida pede definir a modalidade primeiro", () => {
    const c = capacidadesDaModalidade(null);
    expect(c.degrausProntidao).toEqual(["admissao", "modalidade"]);
    expect(c.degrausBloqueantes).toEqual(["modalidade"]);
  });
});
