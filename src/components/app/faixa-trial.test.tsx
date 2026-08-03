import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FaixaTrial } from "./faixa-trial";

/**
 * Dois casos discriminam código antigo de novo aqui.
 *
 * 1. O **negativo**: até a Fatia A a faixa retornava `null` quando
 *    `diasRestantes < 0` — a pessoa via "termina hoje" e no dia seguinte a tela
 *    ficava muda, com a conta ainda funcional (o gate de escrita só chega na
 *    Fatia B). Contra a versão anterior, o teste falha em `getByRole("status")`.
 * 2. O **aguardando 1º paciente** (#175): o relógio só dispara no primeiro
 *    paciente cadastrado. Enquanto isso não acontece, qualquer contagem
 *    regressiva na tela é mentira — a faixa tem que explicar a condição, não
 *    contar dias.
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

  it("aguardando o 1º paciente: explica quando o relógio começa, sem contagem", () => {
    render(<FaixaTrial diasRestantes={7} aguardandoPrimeiroPaciente />);

    const texto = textoDaFaixa();
    expect(texto).toMatch(/primeiro paciente/i);
    // O que discrimina o fix: nada de "termina em N dias" / "termina hoje" /
    // "terminou" enquanto o relógio não disparou.
    expect(texto).not.toMatch(/termina em/i);
    expect(texto).not.toMatch(/termina hoje/i);
    expect(texto).not.toMatch(/terminou/i);
  });

  it("aguardando ignora dias negativos herdados (nunca anuncia fim antes de começar)", () => {
    render(<FaixaTrial diasRestantes={-3} aguardandoPrimeiroPaciente />);

    expect(textoDaFaixa()).toMatch(/primeiro paciente/i);
    expect(textoDaFaixa()).not.toMatch(/terminou/i);
  });

  it("nunca usa role=alert — fim de trial não é risco clínico", () => {
    render(<FaixaTrial diasRestantes={-1} />);

    expect(screen.queryByRole("alert")).toBeNull();
  });
});
