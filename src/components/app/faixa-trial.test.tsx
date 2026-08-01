import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FaixaTrial } from "./faixa-trial";

/**
 * O caso que importa aqui é o **negativo**.
 *
 * Até a Fatia A a faixa retornava `null` quando `diasRestantes < 0`: a pessoa
 * via "termina hoje" e, no dia seguinte, a tela ficava muda — sem aviso, sem
 * CTA, com a conta seguindo funcional porque o gate de escrita só chega na
 * Fatia B. O teste de `diasRestantes = -1` é o que discrimina o código antigo
 * do novo: contra a versão anterior ele falha em `getByRole("status")`, porque
 * não havia nada renderizado para consultar.
 *
 * Os demais casos existem para travar a pluralização e garantir que o estado
 * "encerrado" não vazou para dentro do trial ativo.
 */
function textoDaFaixa(): string {
  return screen.getByRole("status").textContent ?? "";
}

describe("FaixaTrial", () => {
  it("anuncia que o teste terminou quando os dias são negativos", () => {
    render(<FaixaTrial diasRestantes={-1} />);

    const texto = textoDaFaixa();
    expect(texto).toMatch(/período de teste terminou/i);
    // A conta não é bloqueada no fim do trial (leitura e export seguem livres):
    // a faixa precisa dizer isso, senão a pessoa acha que perdeu o acesso.
    expect(texto).toMatch(/continua ativa/i);
  });

  it("segue anunciando o fim muito depois do vencimento", () => {
    render(<FaixaTrial diasRestantes={-45} />);

    expect(textoDaFaixa()).toMatch(/período de teste terminou/i);
  });

  it("avisa que termina hoje no último dia", () => {
    render(<FaixaTrial diasRestantes={0} />);

    const texto = textoDaFaixa();
    expect(texto).toMatch(/termina hoje/i);
    expect(texto).not.toMatch(/terminou/i);
  });

  it("usa singular em um dia restante", () => {
    render(<FaixaTrial diasRestantes={1} />);

    expect(textoDaFaixa()).toContain("Seu período de teste termina em 1 dia.");
  });

  it("usa plural em mais de um dia restante", () => {
    render(<FaixaTrial diasRestantes={5} />);

    expect(textoDaFaixa()).toContain("Seu período de teste termina em 5 dias.");
  });

  it("nunca usa role=alert — fim de trial não é risco clínico", () => {
    render(<FaixaTrial diasRestantes={-1} />);

    expect(screen.queryByRole("alert")).toBeNull();
  });
});
