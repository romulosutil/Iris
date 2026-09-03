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

  // `Card` estampa um Pill "Conquistado ✓" em todo estado fora de
  // sugerido/candidato, e o estampa mesmo sem `titulo`. Sobre um cartão que
  // diz "falta protocolo e meta", o selo afirma o contrário do conteúdo.
  it("não estampa selo de conquista sobre um prontuário incompleto", () => {
    render(<CartaoProntidao prontidao={prontidao(NADA, "coordenador")} />);
    expect(screen.queryByText(/conquistado/i)).toBeNull();
  });

  // Spec §4, estado 5: "Conta em somente-leitura → escada visível, gestos
  // desabilitados pela razão que `layout.tsx` já exibe."
  //
  // Texto real de `mensagemDeEstado("trial_expirado")` (`estado-conta.ts`) —
  // não uma frase inventada para o teste: é justamente a reutilização dessa
  // fonte que a prop existe para garantir.
  const MOTIVO =
    "Seu período de teste terminou. Você continua vendo e exportando o que já registrou — para voltar a cadastrar e editar, ative a assinatura. Você paga pelas fichas ativas no mês, sem valor mínimo.";

  it("conta em somente-leitura: escada visível e gesto primário desabilitado com a razão", () => {
    render(
      <CartaoProntidao
        prontidao={prontidao(NADA, "coordenador")}
        motivoSomenteLeitura={MOTIVO}
      />,
    );

    // A escada continua inteira: bloqueio de ESCRITA não apaga a LEITURA de
    // o que falta e de quem resolve.
    expect(screen.getAllByRole("listitem")).toHaveLength(6);

    const gesto = screen.getByTestId("gesto-primario");
    expect(gesto.tagName).toBe("BUTTON");
    expect((gesto as HTMLButtonElement).disabled).toBe(true);
    // Sem `href` nenhum: um link "desabilitado" continua abrível por clique do
    // meio, e levaria a uma tela que recusa a escrita de novo.
    expect(gesto.hasAttribute("href")).toBe(false);

    // Desabilitado COM razão legível — a diferença entre isso e botão morto.
    expect(screen.getByTestId("motivo-somente-leitura").textContent).toBe(
      MOTIVO,
    );
  });

  // Contra-caso obrigatório: sem o motivo, nada muda. Sem esta linha, um
  // componente que desabilitasse SEMPRE passaria no teste acima.
  it("sem conta bloqueada, o gesto continua sendo o link navegável", () => {
    render(<CartaoProntidao prontidao={prontidao(NADA, "coordenador")} />);
    const gesto = screen.getByTestId("gesto-primario");
    expect(gesto.getAttribute("href")).toBe("/pacientes/p1/cadastro-clinico");
    expect(gesto.getAttribute("aria-disabled")).toBeNull();
    expect(screen.queryByTestId("motivo-somente-leitura")).toBeNull();
  });

  it("lista a escada inteira, incluindo os degraus já concluídos", () => {
    render(<CartaoProntidao prontidao={prontidao(NADA, "coordenador")} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.queryByText(/admissão/i)).not.toBeNull();
  });
});
