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

  // A escada inteira mora em `layout.tsx` (spec §3.3, superfície 1), e o layout
  // do App Router envolve ESTA página. Repetir o `CartaoProntidao` aqui
  // desenhava a MESMA escada duas vezes na aba Evolução, com dois botões
  // primários idênticos — a carga cognitiva que a §3.4 ("um gesto primário por
  // vez") existe para remover, montada dentro de uma única tela.
  it("não repete a escada que o layout já mostra", () => {
    render(<EvolucaoVazia prontidao={SEM_META} />);
    expect(screen.queryByTestId("gesto-primario")).toBeNull();
    expect(screen.queryByText(/prescrever um protocolo/i)).toBeNull();
  });

  it("nomeia o próximo passo como texto e aponta o cartão do topo", () => {
    render(<EvolucaoVazia prontidao={SEM_META} />);
    // Diz POR QUE o gráfico está vazio e onde está o gesto — sem virar um
    // segundo botão disputando o clique com o do cartão acima.
    expect(screen.queryByText(/ativar ao menos uma meta/i)).not.toBeNull();
    expect(
      screen.queryByText(/para este prontuário gerar dados/i),
    ).not.toBeNull();
  });

  // Degrau RECOMENDADO não trava o gráfico — só o bloqueante trava. Contar
  // "tudo que não está concluído" fazia a tela dizer que faltavam 3 passos
  // "para a sessão gerar dado" num prontuário cujos dois passos obrigatórios
  // já estavam cumpridos: manda resolver o degrau errado.
  it("sem bloqueante, não conta passo recomendado como impedimento", () => {
    const soRecomendados = montarProntidao({
      modalidade: "protocol_driven",
      fatos: {
        temFichaClinica: false,
        temAnamnese: false,
        temProtocoloAtivo: true,
        temMetaAtiva: true,
        temInstrumentoAplicado: false,
        temSessaoConsolidada: false,
      },
      role: "coordenador",
      patientId: "p1",
    });

    render(<EvolucaoVazia prontidao={soRecomendados} />);

    expect(screen.queryByText(/faltam? \d+ passos? obrigat/i)).toBeNull();
    expect(
      screen.queryByText(/nenhum passo obrigatório falta/i),
    ).not.toBeNull();
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
