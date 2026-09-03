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

  // §4a — escada vazia por FALTA DE LEITURA tem a mesma forma da escada
  // cumprida (`proximo === null`). Antes do discriminante `situacao`, esta
  // tela dizia "O prontuário está pronto" sobre um prontuário que o papel não
  // consegue ler: afirmação falsa. No prontuário o estado honesto é ausência
  // (D-A9) — quem mostra "Aguardando coordenação" é o passo Documentar.
  it("fatos não visíveis: não afirma que o prontuário está pronto", () => {
    const naoVisivel = montarProntidao({
      modalidade: "protocol_driven",
      fatos: {
        temFichaClinica: true,
        temAnamnese: true,
        temProtocoloAtivo: true,
        temMetaAtiva: true,
        temInstrumentoAplicado: true,
        temSessaoConsolidada: true,
      },
      role: "admin_recepcao",
      patientId: "p1",
    });
    expect(naoVisivel.situacao).toBe("fatos_nao_visiveis");

    const { container } = render(<EvolucaoVazia prontidao={naoVisivel} />);
    expect(container.firstChild).toBeNull();
  });
});
