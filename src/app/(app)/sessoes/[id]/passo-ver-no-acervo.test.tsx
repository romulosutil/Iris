import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PassoVerNoAcervo } from "./passo-ver-no-acervo";

// #533 (`PR-01`) — o card de `revisada` do coordenador ganha o gesto que
// faltava: "Abrir na fila de validação" em `/validacao?sessao=<id>`. Régua de
// mutação: apagar o `<Link>` derruba o 1º teste; mostrá-lo para o terapeuta
// ou em `no_acervo` derruba o 2º/3º.

const SESSION_ID = "00000000-0000-0000-0000-0000000000e1";
const PATIENT_ID = "00000000-0000-0000-0000-0000000000a1";

afterEach(cleanup);

describe("PassoVerNoAcervo", () => {
  test("revisada + coordenador: link literal 'Abrir na fila de validação' para /validacao?sessao=<id>", () => {
    render(
      <PassoVerNoAcervo
        revisada
        patientId={PATIENT_ID}
        sessionId={SESSION_ID}
        ehCoordenador
      />,
    );
    const link = screen.getByRole("link", {
      name: "Abrir na fila de validação",
    });
    expect(link.getAttribute("href")).toBe(`/validacao?sessao=${SESSION_ID}`);
    // O caminho para o acervo continua lá — o gesto novo soma, não substitui.
    expect(
      screen.getByRole("link", { name: "Ver no acervo" }).getAttribute("href"),
    ).toBe(`/pacientes/${PATIENT_ID}`);
  });

  test("revisada + terapeuta: sem o link — encerrar é gesto da coordenação", () => {
    render(
      <PassoVerNoAcervo
        revisada
        patientId={PATIENT_ID}
        sessionId={SESSION_ID}
        ehCoordenador={false}
      />,
    );
    expect(
      screen.queryByRole("link", { name: "Abrir na fila de validação" }),
    ).toBeNull();
    expect(
      screen.getByText(/falta só a coordenação encerrar o item na fila/),
    ).toBeDefined();
  });

  test("no_acervo + coordenador: sem o link — não há item pendente para abrir", () => {
    render(
      <PassoVerNoAcervo
        revisada={false}
        patientId={PATIENT_ID}
        sessionId={SESSION_ID}
        ehCoordenador
      />,
    );
    expect(
      screen.queryByRole("link", { name: "Abrir na fila de validação" }),
    ).toBeNull();
    expect(screen.getByText(/já está no acervo do paciente/)).toBeDefined();
  });
});
