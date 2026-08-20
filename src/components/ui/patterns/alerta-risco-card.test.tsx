import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AlertaRiscoCard } from "./alerta-risco-card";
import { Button } from "@/components/ui/button";

describe("AlertaRiscoCard", () => {
  it("mantém na superfície apenas relato, estado essencial e CTA único", () => {
    const { container } = render(
      <AlertaRiscoCard
        pacienteNome="Lucas Silva"
        categoria="autolesao"
        status="aberto"
        trechoFonte="Episódio durante frustração com necessidade de bloqueio de autolesão leve."
        detalhe="autolesão leve"
        tempoRestanteFormatado="01h 01m"
        acaoPrimaria={<Button>Reconhecer</Button>}
        acoesSecundarias={[
          {
            id: "descartar",
            rotulo: "Descartar alerta…",
            aoSelecionar: () => {},
          },
        ]}
      />,
    );

    // História humana e estado essencial ficam visíveis.
    expect(screen.getByRole("heading", { name: "Autolesão" })).toBeDefined();
    expect(screen.getByText("Lucas Silva")).toBeDefined();
    expect(screen.getByText("Aguardando reconhecimento")).toBeDefined();
    expect(
      screen.getByText(/Episódio durante frustração/, { selector: "*" }),
    ).toBeDefined();

    // Um único CTA em destaque; o resto foi para o menu de reticências.
    expect(screen.getByRole("button", { name: "Reconhecer" })).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Descartar alerta…" }),
    ).toBeNull();

    // A contagem de SLA existe, mas recolhida: fora da leitura de repouso.
    const detalhes = container.querySelector("details");
    expect(detalhes).not.toBeNull();
    expect(detalhes?.open).toBe(false);
    expect(within(detalhes as HTMLElement).getByText(/01h 01m/)).toBeDefined();
  });

  it("guarda disclaimer de IA, prazos e dever legal dentro do respaldo regulatório", () => {
    const { container } = render(
      <AlertaRiscoCard
        pacienteNome="Criança Anon"
        categoria="violencia_sofrida"
        status="escalado_estagio_1"
        trechoFonte="Relato de agressão física sofrida."
        avisoLegalTexto="Dever legal de comunicação ao Conselho Tutelar."
        tempoRestanteFormatado="15m"
      />,
    );

    const detalhes = container.querySelector("details") as HTMLElement;
    const dentro = within(detalhes);

    expect(
      screen.getByText("Ver respaldo regulatório", { selector: "span" }),
    ).toBeDefined();
    expect(
      dentro.getByText(/Identificado por IA: Violência sofrida/),
    ).toBeDefined();
    expect(
      dentro.getByText(/a decisão de conduta é 100% humana/),
    ).toBeDefined();
    expect(
      dentro.getByText(/Dever legal de comunicação ao Conselho Tutelar\./),
    ).toBeDefined();
    expect(dentro.getByText(/Escalonamento interno em/)).toBeDefined();

    // O gatilho do dever legal continua sinalizado na superfície do card.
    expect(screen.getByText("Dever legal aplicável")).toBeDefined();
  });

  it("expõe as ações secundárias por teclado no menu de reticências", async () => {
    const usuario = userEvent.setup();
    const aoDescartar = vi.fn();

    render(
      <AlertaRiscoCard
        pacienteNome="Lucas Silva"
        categoria="autolesao"
        status="reconhecido"
        trechoFonte="Episódio autolesivo em acompanhamento."
        acaoPrimaria={<Button>Resolver</Button>}
        acoesSecundarias={[
          {
            id: "descartar",
            rotulo: "Descartar alerta…",
            tom: "destrutivo",
            aoSelecionar: aoDescartar,
          },
        ]}
      />,
    );

    const gatilho = screen.getByRole("button", {
      name: /Mais ações do alerta de Autolesão/,
    });
    expect(gatilho.getAttribute("aria-haspopup")).toBe("menu");
    expect(gatilho.getAttribute("aria-expanded")).toBe("false");

    gatilho.focus();
    await usuario.keyboard("{ArrowDown}");

    const item = screen.getByRole("menuitem", { name: "Descartar alerta…" });
    expect(document.activeElement).toBe(item);

    await usuario.keyboard("{Enter}");
    expect(aoDescartar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(gatilho);
  });

  it("renderiza estado terminal com conduta registrada e sem bloco de prazo", () => {
    const { container } = render(
      <AlertaRiscoCard
        pacienteNome="Lucas Silva"
        categoria="autolesao"
        status="resolvido"
        trechoFonte="Episódio autolesivo tratado."
        condutaRegistrada="Orientação familiar realizada e registrado encaminhamento."
      />,
    );

    expect(screen.getByText("Resolvido")).toBeDefined();
    expect(
      screen.getByText(
        "Orientação familiar realizada e registrado encaminhamento.",
      ),
    ).toBeDefined();

    const detalhes = container.querySelector("details") as HTMLElement;
    expect(within(detalhes).queryByText(/Escalonamento interno em/)).toBeNull();
  });
});
