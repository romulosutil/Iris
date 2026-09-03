import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvolucaoVazia } from "./evolucao-vazia";
import { montarProntidao } from "@/lib/patient/prontidao";

const SEM_META = montarProntidao({
  modalidade: "protocol_driven",
  fatos: {
    temFichaClinica: true,
    temAnamnese: true,
    temProtocoloAtivo: true,
    temMetaAtiva: false,
    temInstrumentoAplicado: false,
    temSessaoConsolidada: false,
  },
  role: "coordenador",
  patientId: "p1",
});

const PRONTO = montarProntidao({
  modalidade: "protocol_driven",
  fatos: {
    temFichaClinica: true,
    temAnamnese: true,
    temProtocoloAtivo: true,
    temMetaAtiva: true,
    temInstrumentoAplicado: true,
    temSessaoConsolidada: true,
  },
  role: "coordenador",
  patientId: "p1",
});

describe("EvolucaoVazia", () => {
  it("não manda mais agendar sessão quando falta meta", () => {
    render(<EvolucaoVazia prontidao={SEM_META} />);
    expect(screen.queryByText(/agendar primeira sessão/i)).toBeNull();
  });

  it("aponta o degrau que realmente falta", () => {
    render(<EvolucaoVazia prontidao={SEM_META} />);
    expect(screen.getByTestId("gesto-primario").getAttribute("href")).toBe(
      "/pacientes/p1/metas",
    );
  });

  it("com o prontuário pronto, explica que falta só documentar a sessão", () => {
    render(<EvolucaoVazia prontidao={PRONTO} />);
    expect(screen.queryByText(/sem sessões registradas/i)).not.toBeNull();
  });
});
