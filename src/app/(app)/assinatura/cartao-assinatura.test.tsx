import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CartaoAssinatura } from "./cartao-assinatura";
import type { CicloCorrente } from "./queries";

const ATIVA: CicloCorrente = {
  statusAssinatura: "active",
  cicloAtualInicio: new Date("2026-08-13T00:00:00Z"),
  cicloAtualFim: new Date("2026-09-12T00:00:00Z"),
  ativadaEm: new Date("2026-08-13T14:00:00Z"),
  canceladaEm: null,
  pastDueDesde: null,
  carenciaDias: 10,
  timezone: "America/Sao_Paulo",
};

describe("CartaoAssinatura", () => {
  it("nao renderiza nada para quem nunca ativou", () => {
    const { container } = render(
      <CartaoAssinatura ciclo={null} debitoCentavos={0} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("nao renderiza nada em free_tier — quem nunca assinou ve a tabela de precos", () => {
    const { container } = render(
      <CartaoAssinatura
        ciclo={{
          ...ATIVA,
          statusAssinatura: "free_tier",
          cicloAtualInicio: null,
          cicloAtualFim: null,
          ativadaEm: null,
        }}
        debitoCentavos={0}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("mostra estado, periodo do ciclo e proximo fechamento", () => {
    render(<CartaoAssinatura ciclo={ATIVA} debitoCentavos={0} />);
    expect(screen.queryByText(/assinatura ativa/i)).not.toBeNull();
    expect(screen.queryByText("13/08/2026 a 12/09/2026")).not.toBeNull();
    expect(screen.queryByText("12/09/2026")).not.toBeNull();
  });

  it("diferencia quem acabou de ativar mostrando desde quando", () => {
    render(<CartaoAssinatura ciclo={ATIVA} debitoCentavos={0} />);
    expect(screen.queryByText(/ativa desde/i)).not.toBeNull();
    expect(screen.queryByText("13/08/2026")).not.toBeNull();
  });

  it("nao estampa valor do ciclo corrente — ele so existe no fechamento", () => {
    render(<CartaoAssinatura ciclo={ATIVA} debitoCentavos={0} />);
    // Nenhum valor em reais no cartao de uma assinatura sem debito. Se um
    // "valor projetado" for adicionado depois sem a apuracao real por tras,
    // este teste e quem acusa.
    expect(screen.queryByText(/R\$/)).toBeNull();
    expect(
      screen.queryByText(/só é fechado quando o ciclo fecha/i),
    ).not.toBeNull();
  });

  it("mostra o debito em aberto quando existe", () => {
    render(<CartaoAssinatura ciclo={ATIVA} debitoCentavos={15600} />);
    // `formatarBRL` usa NBSP entre "R$" e o numero: comparar so o trecho
    // numerico evita um falso vermelho por causa do espaco.
    expect(screen.queryByText(/156,00/)).not.toBeNull();
  });

  it("mostra travessao quando o ciclo ainda nao abriu", () => {
    render(
      <CartaoAssinatura
        ciclo={{ ...ATIVA, cicloAtualInicio: null, cicloAtualFim: null }}
        debitoCentavos={0}
      />,
    );
    expect(screen.queryAllByText("—").length).toBeGreaterThan(0);
  });

  it("rotula past_due sem usar o identificador cru do Postgres", () => {
    render(
      <CartaoAssinatura
        ciclo={{
          ...ATIVA,
          statusAssinatura: "past_due",
          pastDueDesde: new Date("2026-08-02T12:00:00Z"),
        }}
        debitoCentavos={0}
      />,
    );
    expect(screen.queryByText("past_due")).toBeNull();
    expect(screen.queryByText(/pagamento em atraso/i)).not.toBeNull();
  });
});
