import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CartaoProntidao } from "./cartao-prontidao";
import { montarProntidao, type FatosProntidao } from "@/lib/patient/prontidao";

const NADA: FatosProntidao = {
  temFichaClinica: false,
  temAnamnese: false,
  temProtocoloAtivo: false,
  temMetaAtiva: false,
  temInstrumentoAplicado: false,
  temSessaoConsolidada: false,
};
const TUDO: FatosProntidao = {
  temFichaClinica: true,
  temAnamnese: true,
  temProtocoloAtivo: true,
  temMetaAtiva: true,
  temInstrumentoAplicado: true,
  temSessaoConsolidada: true,
};

function prontidao(fatos: FatosProntidao, role: string) {
  return montarProntidao({
    modalidade: "protocol_driven",
    fatos,
    role,
    patientId: "p1",
  });
}

describe("CartaoProntidao", () => {
  it("não renderiza nada quando o prontuário está pronto", () => {
    const { container } = render(
      <CartaoProntidao prontidao={prontidao(TUDO, "coordenador")} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("mostra UM gesto primário: o próximo degrau", () => {
    render(<CartaoProntidao prontidao={prontidao(NADA, "coordenador")} />);
    const primarios = screen.getAllByTestId("gesto-primario");
    expect(primarios).toHaveLength(1);
    expect(primarios[0]?.getAttribute("href")).toBe(
      "/pacientes/p1/cadastro-clinico",
    );
  });

  it("sem botão morto: terapeuta vê quem resolve, não um link", () => {
    render(<CartaoProntidao prontidao={prontidao(NADA, "terapeuta")} />);
    expect(screen.queryByTestId("gesto-primario")).toBeNull();
    expect(screen.queryByText(/aguardando coordenação/i)).not.toBeNull();
  });

  it("marca o degrau bloqueante de forma redundante ao texto, não só por cor", () => {
    render(<CartaoProntidao prontidao={prontidao(NADA, "coordenador")} />);
    // "protocol_driven" tem DOIS degraus bloqueantes (protocolo e meta) — com
    // NADA preenchido, os dois aparecem. `getAllByText` não presume
    // unicidade; `queryByText` lançaria "multiple elements found".
    expect(screen.getAllByText(/obrigatório/i).length).toBeGreaterThan(0);
  });

  it("lista a escada inteira, incluindo os degraus já concluídos", () => {
    render(<CartaoProntidao prontidao={prontidao(NADA, "coordenador")} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.queryByText(/admissão/i)).not.toBeNull();
  });
});
