import { describe, expect, test } from "vitest";
import {
  classificarPosturaSeguranca,
  rotularPapeis,
  type VinculoMembro,
} from "./logic";

function vinculo(over: Partial<VinculoMembro> = {}): VinculoMembro {
  return {
    id: "u1",
    nome: "Fulano",
    email: "fulano@clinica.test",
    papel: "terapeuta",
    mfaAtivo: true,
    ...over,
  };
}

describe("classificarPosturaSeguranca (#277)", () => {
  // Régua de mutação (a): remover a classificação de recepção derruba este teste.
  test("admin_recepcao sem segundo fator cai em `semSegundoFator`", () => {
    const r = classificarPosturaSeguranca([
      vinculo({ id: "r1", papel: "admin_recepcao", mfaAtivo: false }),
    ]);

    expect(r.semSegundoFator.map((m) => m.id)).toEqual(["r1"]);
    expect(r.ativacaoPendente).toEqual([]);
    expect(r.protegidos).toBe(0);
  });

  // Régua de mutação (b): trocar os grupos derruba este teste.
  test("papel clínico sem segundo fator cai em `ativacaoPendente`, nunca em `semSegundoFator`", () => {
    const r = classificarPosturaSeguranca([
      vinculo({ id: "t1", papel: "terapeuta", mfaAtivo: false }),
      vinculo({ id: "c1", papel: "coordenador", mfaAtivo: false }),
    ]);

    expect(r.ativacaoPendente.map((m) => m.id).sort()).toEqual(["c1", "t1"]);
    expect(r.semSegundoFator).toEqual([]);
  });

  // Régua de mutação (c): passar a listar o conforme nominalmente derruba este teste.
  test("membro protegido não aparece nominalmente em grupo nenhum — só na contagem", () => {
    const r = classificarPosturaSeguranca([
      vinculo({ id: "p1", mfaAtivo: true }),
      vinculo({ id: "p2", papel: "admin_recepcao", mfaAtivo: true }),
    ]);

    expect(r.protegidos).toBe(2);
    expect(r.semSegundoFator).toEqual([]);
    expect(r.ativacaoPendente).toEqual([]);
    // O objeto de retorno não carrega os nomes de quem está em conformidade.
    expect(JSON.stringify(r)).not.toContain("p1");
  });

  test("papel duplo conta uma vez e cai pelo lado clínico", () => {
    const r = classificarPosturaSeguranca([
      vinculo({ id: "d1", papel: "admin_recepcao", mfaAtivo: false }),
      vinculo({ id: "d1", papel: "terapeuta", mfaAtivo: false }),
    ]);

    expect(r.total).toBe(1);
    expect(r.semSegundoFator).toEqual([]);
    expect(r.ativacaoPendente).toHaveLength(1);
    expect(r.ativacaoPendente[0]?.papeis).toEqual([
      "terapeuta",
      "admin_recepcao",
    ]);
  });

  // A ordem das linhas de `user_role` não é garantida: o rótulo não pode
  // depender de qual vínculo o Postgres devolveu primeiro.
  test("a ordem dos papéis é estável, independente da ordem dos vínculos", () => {
    const direta = classificarPosturaSeguranca([
      vinculo({ id: "z", papel: "coordenador", mfaAtivo: false }),
      vinculo({ id: "z", papel: "admin_recepcao", mfaAtivo: false }),
    ]);
    const invertida = classificarPosturaSeguranca([
      vinculo({ id: "z", papel: "admin_recepcao", mfaAtivo: false }),
      vinculo({ id: "z", papel: "coordenador", mfaAtivo: false }),
    ]);

    expect(direta.ativacaoPendente[0]?.papeis).toEqual([
      "coordenador",
      "admin_recepcao",
    ]);
    expect(invertida.ativacaoPendente[0]?.papeis).toEqual(
      direta.ativacaoPendente[0]?.papeis,
    );
  });

  test("`total` agrega por usuário, não por vínculo — o número entregue ao convênio", () => {
    const r = classificarPosturaSeguranca([
      vinculo({ id: "a", papel: "coordenador", mfaAtivo: true }),
      vinculo({ id: "a", papel: "terapeuta", mfaAtivo: true }),
      vinculo({ id: "b", papel: "terapeuta", mfaAtivo: true }),
    ]);

    expect(r.total).toBe(2);
    expect(r.protegidos).toBe(2);
  });

  test("clínica de um membro só: 1 de 1, sem tratamento especial", () => {
    const r = classificarPosturaSeguranca([
      vinculo({ id: "c", papel: "coordenador", mfaAtivo: true }),
    ]);

    expect(r).toEqual({
      semSegundoFator: [],
      ativacaoPendente: [],
      protegidos: 1,
      total: 1,
    });
  });

  test("papel duplo não duplica o papel na lista quando o vínculo repete", () => {
    const r = classificarPosturaSeguranca([
      vinculo({ id: "x", papel: "terapeuta", mfaAtivo: false }),
      vinculo({ id: "x", papel: "terapeuta", mfaAtivo: false }),
    ]);

    expect(r.ativacaoPendente[0]?.papeis).toEqual(["terapeuta"]);
  });
});

describe("rotularPapeis", () => {
  test("traduz o enum do banco para pt-BR legível", () => {
    expect(rotularPapeis(["admin_recepcao"])).toBe("Recepção");
    expect(rotularPapeis(["coordenador", "terapeuta"])).toBe(
      "Coordenador · Terapeuta",
    );
  });
});
