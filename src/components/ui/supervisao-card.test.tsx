import { describe, it, expect } from "vitest";
import * as React from "react";
import { render, screen, within } from "@testing-library/react";
import { SupervisaoCard } from "./supervisao-card";
import { Button } from "@/components/ui/button";

describe("SupervisaoCard", () => {
  it("mantém paciente, sinal e CTA na superfície e recolhe metadados técnicos", () => {
    const { container } = render(
      <SupervisaoCard
        patientNome="Lucas Gabriel Silva"
        patientHref="#"
        tipo="estagnacao"
        goalNome="Imitação de Gestos Simples"
        protocolNome="VB-MAPP"
        detalhe={{
          sessionNumero: 14,
          metrica: "VBMAPP",
          tipoEstrutura: "motor",
        }}
        estado="novo"
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

    expect(
      screen.getByRole("heading", { name: "Lucas Gabriel Silva" }),
    ).toBeDefined();
    expect(screen.getByText("Estagnação")).toBeDefined();
    expect(screen.getByText("Imitação de Gestos Simples")).toBeDefined();
    expect(screen.getByRole("button", { name: "Reconhecer" })).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Descartar alerta…" }),
    ).toBeNull();

    const detalhes = container.querySelector("details") as HTMLDetailsElement;
    expect(detalhes.open).toBe(false);
    expect(within(detalhes).getByText("VB-MAPP")).toBeDefined();
    expect(
      within(detalhes).getByText(/Sessão 14 • Métrica: VBMAPP • Área: motor/),
    ).toBeDefined();
  });

  it("omite a expansão quando não há metadado técnico algum", () => {
    const { container } = render(
      <SupervisaoCard
        patientNome="Thiago Rocha"
        tipo="estagnacao"
        goalNome="Nomeação de Objetos do Cotidiano"
        protocolNome={null}
        detalhe={{ sessionNumero: null, metrica: null }}
        acaoPrimaria={<Button>Reconhecer</Button>}
      />,
    );

    expect(container.querySelector("details")).toBeNull();
    expect(screen.getByText("Nomeação de Objetos do Cotidiano")).toBeDefined();
  });
});
