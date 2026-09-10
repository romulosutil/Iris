import type { ReactElement } from "react";
import { afterEach, expect, test } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { DataList, DataListGroup, DataListRow } from "./data-list";
import { Button } from "./button";
import { StatusBadge } from "./patterns/status-badge";

afterEach(cleanup);

async function semViolacoes(ui: ReactElement) {
  const { container } = render(ui);
  const resultado = await axe.run(container, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
    },
    rules: {
      region: { enabled: false },
      "landmark-one-main": { enabled: false },
      "page-has-heading-one": { enabled: false },
      "color-contrast": { enabled: false },
    },
  });
  expect(resultado.violations).toEqual([]);
  return container;
}

function Fila() {
  return (
    <DataList
      aria-labelledby="fila-titulo"
      cabecalho={
        <>
          <h2 id="fila-titulo">Pendentes de consolidação</h2>
          <Button variante="neutra" tamanho="sm" aria-expanded>
            Recolher
          </Button>
        </>
      }
    >
      <DataListGroup titulo="Dra. Sofia" contagem={2}>
        <DataListRow
          inicio="07:00"
          titulo="Melinda"
          estado={<StatusBadge estado="sugerida" />}
          acoes={
            <Button variante="neutra" tamanho="sm">
              Gerir
            </Button>
          }
        />
        <DataListRow
          inicio="08:00"
          titulo="Benjamin"
          detalhe="10/09"
          estado={<StatusBadge estado="aprovada" />}
          acoes={
            <Button variante="neutra" tamanho="sm">
              Gerir
            </Button>
          }
        />
      </DataListGroup>
      <DataListGroup titulo="Dr. Caio" contagem={1}>
        <DataListRow titulo="Ana" />
      </DataListGroup>
    </DataList>
  );
}

test("DataList agrupada — sem violações axe", async () => {
  await semViolacoes(<Fila />);
});

test("DataList como=ul sem grupos — sem violações axe", async () => {
  await semViolacoes(
    <DataList como="ul" aria-label="Terapeutas">
      <DataListRow titulo="Dra. Sofia" detalhe="Psicologia" />
      <DataListRow titulo="Dr. Caio" detalhe="Fonoaudiologia" />
    </DataList>,
  );
});

test("DataList — cada grupo é uma seção nomeada pelo próprio cabeçalho com uma lista de linhas", () => {
  render(<Fila />);
  const grupo = screen.getByRole("region", { name: /Dra\. Sofia/ });
  const lista = within(grupo).getByRole("list");
  expect(within(lista).getAllByRole("listitem")).toHaveLength(2);
  // A contagem faz parte do nome acessível: leitor de tela ouve "Dra. Sofia 2".
  expect(
    screen.getByRole("heading", { level: 3, name: "Dra. Sofia 2" }),
  ).toBeTruthy();
});

test("DataListRow — os quatro slots caem nas áreas de grid nomeadas", () => {
  render(
    <ul>
      <DataListRow
        inicio="07:00"
        titulo="Melinda"
        detalhe="Psicologia"
        estado={<span data-testid="estado">Agendada</span>}
        acoes={<button type="button">Gerir</button>}
      />
    </ul>,
  );
  const li = screen.getByRole("listitem");
  expect(li.className).toContain("grid-template-areas");
  expect(screen.getByText("07:00").className).toContain("[grid-area:inicio]");
  expect(
    screen.getByText("Melinda").closest("[class*='grid-area:titulo']"),
  ).toBeTruthy();
  expect(
    screen.getByTestId("estado").closest("[class*='grid-area:estado']"),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Gerir" })
      .closest("[class*='grid-area:acoes']"),
  ).toBeTruthy();
});

test("DataListRow — sem `inicio`/`estado`/`acoes` a linha ainda ocupa as áreas (grid não colapsa)", () => {
  render(
    <ul>
      <DataListRow titulo="Só título" />
    </ul>,
  );
  const li = screen.getByRole("listitem");
  const ocultos = li.querySelectorAll("[aria-hidden='true']");
  expect(ocultos).toHaveLength(3);
});
