import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HistoricoCobrancas } from "./historico-cobrancas";
import type { CicloDoHistorico } from "./queries";

const CICLO_PAGO: CicloDoHistorico = {
  id: "c1",
  inicio: new Date("2026-06-01T00:00:00Z"),
  fim: new Date("2026-07-01T00:00:00Z"),
  status: "pago",
  pacientesContados: 4,
  valorCentavos: 15600,
  vencimentoCobranca: new Date("2026-07-08T00:00:00Z"),
  cobradoEm: new Date("2026-07-05T00:00:00Z"),
  invoiceUrl: null,
};

const CICLO_RECUSADO: CicloDoHistorico = {
  ...CICLO_PAGO,
  id: "c2",
  inicio: new Date("2026-07-01T00:00:00Z"),
  fim: new Date("2026-08-01T00:00:00Z"),
  status: "falhou",
  pacientesContados: 6,
  valorCentavos: 23400,
  vencimentoCobranca: new Date("2026-08-08T00:00:00Z"),
  cobradoEm: null,
  invoiceUrl: null,
};

describe("HistoricoCobrancas", () => {
  it("mostra empty state quando nenhum ciclo fechou ainda", () => {
    render(<HistoricoCobrancas ciclos={[]} />);
    expect(
      screen.queryByText(/nenhuma cobrança fechada ainda/i),
    ).not.toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("renderiza período, fichas, valor e situação de cada ciclo", () => {
    render(<HistoricoCobrancas ciclos={[CICLO_RECUSADO, CICLO_PAGO]} />);
    const linhas = screen.getAllByRole("row");
    // 1 cabeçalho + 2 ciclos
    expect(linhas).toHaveLength(3);
    const primeira = within(linhas[1]!);
    expect(primeira.queryByText("6")).not.toBeNull();
    expect(primeira.queryByText("R$ 234,00")).not.toBeNull();
    expect(primeira.queryByText(/cobrança recusada/i)).not.toBeNull();
  });

  it("mostra travessão no vencimento ausente em vez de data inventada", () => {
    render(
      <HistoricoCobrancas
        ciclos={[{ ...CICLO_PAGO, vencimentoCobranca: null }]}
      />,
    );
    // Ancorado na CÉLULA de vencimento, e não em "existe um — na tabela": a
    // coluna Fatura também renderiza travessão na ausência, e um `getByText`
    // solto passaria mesmo se o vencimento voltasse a inventar data.
    const celulas = screen.getAllByRole("cell");
    expect(celulas[4]?.textContent).toBe("—");
  });

  it("linka a fatura com nome acessível que identifica o ciclo", () => {
    render(
      <HistoricoCobrancas
        ciclos={[{ ...CICLO_PAGO, invoiceUrl: "https://asaas.test/i/1" }]}
      />,
    );
    const link = screen.getByRole("link", {
      name: /ver fatura do ciclo de 01\/06\/2026 a 01\/07\/2026/i,
    });
    expect(link.getAttribute("href")).toBe("https://asaas.test/i/1");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("mostra travessão quando o ciclo não tem fatura", () => {
    render(
      <HistoricoCobrancas ciclos={[{ ...CICLO_PAGO, invoiceUrl: null }]} />,
    );
    expect(screen.queryByRole("link", { name: /fatura/i })).toBeNull();
  });

  it("não linka URL que não seja https", () => {
    render(
      <HistoricoCobrancas
        ciclos={[{ ...CICLO_PAGO, invoiceUrl: "javascript:alert(1)" }]}
      />,
    );
    expect(screen.queryByRole("link", { name: /fatura/i })).toBeNull();
  });

  it("mantém a rolagem horizontal DENTRO da tabela, nunca no body", () => {
    // O `Table` do DS já envolve o <table> num container com overflow-auto.
    // Este caso existe para que trocar por um <table> cru quebre o build.
    render(<HistoricoCobrancas ciclos={[CICLO_PAGO]} />);
    const tabela = screen.getByRole("table");
    const container = tabela.parentElement;
    expect(container?.className).toContain("overflow-auto");
  });

  it("cabeçalhos têm scope=col", () => {
    render(<HistoricoCobrancas ciclos={[CICLO_PAGO]} />);
    for (const th of screen.getAllByRole("columnheader")) {
      expect(th.getAttribute("scope")).toBe("col");
    }
  });
});
