import { describe, expect, test } from "vitest";
import { agruparProtocolosPorPrescricao } from "./protocolo-agrupamento";

const VBMAPP = { id: "p1", nome: "VB-MAPP", disciplina: "ABA" };
const ABLLS = { id: "p2", nome: "ABLLS-R", disciplina: "ABA" };
const PROC = { id: "p3", nome: "PROC", disciplina: "Fonoaudiologia" };
const CATALOGO = [VBMAPP, ABLLS, PROC];

describe("agrupamento de protocolo por disciplina prescrita (fatia 3)", () => {
  test("sem prescrição não oferece nada — nem grupo, nem catálogo", () => {
    const r = agruparProtocolosPorPrescricao([], CATALOGO, []);
    expect(r.grupos).toHaveLength(0);
    expect(r.foraDaPrescricao).toHaveLength(0);
  });

  test("só oferece protocolo da disciplina prescrita", () => {
    const r = agruparProtocolosPorPrescricao(["ABA"], CATALOGO, []);
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0]!.disponiveis.map((p) => p.nome)).toEqual([
      "VB-MAPP",
      "ABLLS-R",
    ]);
    // PROC é de Fonoaudiologia, que não está prescrita: não pode aparecer como
    // encaixe disponível em disciplina nenhuma.
    expect(
      r.grupos.flatMap((g) => g.disponiveis).map((p) => p.nome),
    ).not.toContain("PROC");
  });

  test("disciplina prescrita sem protocolo no catálogo vira grupo vazio, não some", () => {
    // Terapia Convencional é caso legítimo: prescreve horas e não encaixa
    // protocolo nenhum. A disciplina precisa aparecer dizendo isso, senão o
    // coordenador acha que esqueceu de configurar alguma coisa.
    const r = agruparProtocolosPorPrescricao(["Psicologia"], CATALOGO, []);
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0]!.disciplina).toBe("Psicologia");
    expect(r.grupos[0]!.disponiveis).toHaveLength(0);
    expect(r.grupos[0]!.ativos).toHaveLength(0);
  });

  test("vínculo ativo sai de 'disponíveis' e entra em 'ativos' com o id do vínculo", () => {
    const r = agruparProtocolosPorPrescricao(["ABA"], CATALOGO, [
      { id: "v1", protocolId: "p1", desativadoEm: null },
    ]);
    expect(r.grupos[0]!.ativos).toEqual([
      { protocolo: VBMAPP, vinculoId: "v1" },
    ]);
    expect(r.grupos[0]!.disponiveis.map((p) => p.id)).toEqual(["p2"]);
  });

  test("vínculo desativado volta para 'disponíveis' — histórico não é estado ativo", () => {
    const r = agruparProtocolosPorPrescricao(["ABA"], CATALOGO, [
      { id: "v1", protocolId: "p1", desativadoEm: "2026-08-01" },
    ]);
    expect(r.grupos[0]!.ativos).toHaveLength(0);
    expect(r.grupos[0]!.disponiveis.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  test("protocolo ativo de disciplina NÃO prescrita cai em 'fora da prescrição'", () => {
    // Encerrar a prescrição de ABA deixa o VB-MAPP órfão. Esconder produziria
    // linha viva no banco que ninguém enxerga nem consegue desvincular.
    const r = agruparProtocolosPorPrescricao(["Fonoaudiologia"], CATALOGO, [
      { id: "v1", protocolId: "p1", desativadoEm: null },
    ]);
    expect(r.foraDaPrescricao).toEqual([
      { protocolo: VBMAPP, vinculoId: "v1" },
    ]);
    expect(r.grupos.flatMap((g) => g.ativos)).toHaveLength(0);
  });

  test("órfão desativado não aparece em lugar nenhum", () => {
    const r = agruparProtocolosPorPrescricao(["Fonoaudiologia"], CATALOGO, [
      { id: "v1", protocolId: "p1", desativadoEm: "2026-08-01" },
    ]);
    expect(r.foraDaPrescricao).toHaveLength(0);
  });

  test("disciplina compara sem caixa e sem espaço sobrando", () => {
    // As duas tabelas são texto livre, alimentadas por caminhos diferentes.
    // Comparação byte a byte jogaria o protocolo em 'fora da prescrição' sem
    // nada na tela explicando por quê.
    const r = agruparProtocolosPorPrescricao([" aba "], CATALOGO, [
      { id: "v1", protocolId: "p1", desativadoEm: null },
    ]);
    expect(r.foraDaPrescricao).toHaveLength(0);
    expect(r.grupos[0]!.ativos.map((a) => a.vinculoId)).toEqual(["v1"]);
  });

  test("vínculo cujo protocolo não está no catálogo aparece degradado, não some", () => {
    // O catálogo é deduplicado por NOME (`obterOuInicializarProtocolosDaClinica`):
    // duas linhas `protocol` de mesmo nome fazem um id desaparecer da lista. Um
    // vínculo vigente apontando para esse id ficaria vivo no banco e invisível
    // na tela — sem grupo e sem bloco de órfãos, portanto sem como desencaixar.
    const r = agruparProtocolosPorPrescricao(["ABA"], CATALOGO, [
      { id: "v9", protocolId: "id-que-sumiu", desativadoEm: null },
    ]);
    expect(r.foraDaPrescricao).toHaveLength(1);
    expect(r.foraDaPrescricao[0]!.vinculoId).toBe("v9");
    expect(r.foraDaPrescricao[0]!.foraDoCatalogo).toBe(true);
    expect(r.grupos.flatMap((g) => g.ativos)).toHaveLength(0);
  });

  test("prescrição repetida em caixa/espaço diferente rende um grupo só", () => {
    // O índice único de vigência (0077) é sobre a coluna crua, então "ABA" e
    // " aba " coexistem como prescrições vigentes. Dois grupos idênticos dariam
    // chave React repetida e dois cartões comandando o MESMO vínculo.
    const r = agruparProtocolosPorPrescricao(["ABA", " aba "], CATALOGO, [
      { id: "v1", protocolId: "p1", desativadoEm: null },
    ]);
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0]!.disciplina).toBe("ABA");
    expect(r.grupos.flatMap((g) => g.ativos)).toHaveLength(1);
  });

  test("vínculo ativo duplicado do mesmo protocolo rende um cartão só (legado)", () => {
    const r = agruparProtocolosPorPrescricao(["ABA"], CATALOGO, [
      { id: "v1", protocolId: "p1", desativadoEm: null },
      { id: "v2", protocolId: "p1", desativadoEm: null },
    ]);
    expect(r.grupos[0]!.ativos).toHaveLength(1);
    expect(r.grupos[0]!.ativos[0]!.vinculoId).toBe("v1");
  });
});
