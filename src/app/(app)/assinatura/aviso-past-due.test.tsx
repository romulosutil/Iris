import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AvisoPastDue } from "./aviso-past-due";
import type { CicloCorrente } from "./queries";

const ATRASADA: CicloCorrente = {
  statusAssinatura: "past_due",
  cicloAtualInicio: new Date("2026-07-01T00:00:00Z"),
  cicloAtualFim: new Date("2026-08-01T00:00:00Z"),
  ativadaEm: new Date("2026-06-01T09:00:00Z"),
  canceladaEm: null,
  pastDueDesde: new Date("2026-08-02T12:00:00Z"),
  carenciaDias: 10,
  timezone: "America/Sao_Paulo",
};

const PRAZO =
  "Sua assinatura será cancelada em 5 dias (12/08/2026) se o pagamento não for concluído.";

describe("AvisoPastDue", () => {
  it("nao renderiza fora de past_due", () => {
    const { container } = render(
      <AvisoPastDue
        ciclo={{ ...ATRASADA, statusAssinatura: "active", pastDueDesde: null }}
        prazo={null}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("nao renderiza quando nao ha vinculo", () => {
    const { container } = render(<AvisoPastDue ciclo={null} prazo={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("diz que o acesso continua — past_due nao bloqueia escrita", () => {
    render(<AvisoPastDue ciclo={ATRASADA} prazo={PRAZO} />);
    expect(screen.queryByText(/continua liberado/i)).not.toBeNull();
  });

  it("diz que pagar a fatura em aberto reativa sozinho", () => {
    render(<AvisoPastDue ciclo={ATRASADA} prazo={PRAZO} />);
    // Medido em subscription.ts:2445-2454 — em past_due, o pagamento
    // confirmado devolve a assinatura para `active` pelo webhook.
    expect(screen.queryByText(/volta a ficar ativa sozinha/i)).not.toBeNull();
  });

  it("diz que depois do cancelamento pagar nao basta", () => {
    render(<AvisoPastDue ciclo={ATRASADA} prazo={PRAZO} />);
    // #290: quitar destrava o gate, mas voltar exige autorizacao nova.
    expect(screen.queryByText(/autorização nova/i)).not.toBeNull();
  });

  it("mostra o prazo quando ele lhe e passado", () => {
    render(<AvisoPastDue ciclo={ATRASADA} prazo={PRAZO} />);
    expect(screen.queryByText(/12\/08\/2026/)).not.toBeNull();
  });

  it("omite o prazo quando a faixa do topo ja o mostra", () => {
    render(<AvisoPastDue ciclo={ATRASADA} prazo={null} />);
    // Duas frases de prazo na mesma tela e ruido; a faixa global tem
    // precedencia porque ela tambem explica a CAUSA da recusa.
    expect(screen.queryByText(/12\/08\/2026/)).toBeNull();
    // Mas o resto do aviso continua — e ele que diz o que destrava.
    expect(screen.queryByText(/volta a ficar ativa sozinha/i)).not.toBeNull();
  });

  it("nao promete retentativa nem afirma causa que nao conhecemos", () => {
    render(<AvisoPastDue ciclo={ATRASADA} prazo={PRAZO} />);
    expect(screen.queryByText(/tentaremos novamente/i)).toBeNull();
    expect(screen.queryByText(/seu banco recusou/i)).toBeNull();
  });
});
