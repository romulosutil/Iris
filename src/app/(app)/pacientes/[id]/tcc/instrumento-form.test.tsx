import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  InstrumentoForm,
  type ItemInstrumentoTexto,
} from "./instrumento-form";

/**
 * #393 — mesmo padrão de `novo-paciente-form.test.tsx` para componentes com
 * `useActionState`: a action é mockada (nunca resolve), o comportamento é
 * exercitado via RTL/`role`.
 *
 * IMPORTANTE: nenhuma string de fixture aqui se parece com item real do
 * PHQ-9/GAD-7 (conteúdo licenciado, gate de fonte primária — spec.md). Todo
 * "texto" usado é claramente sintético (`"[texto de teste — item N]"`).
 */

vi.mock("./actions", () => ({
  salvarInstrumentoAplicacaoAction: vi.fn(() => new Promise(() => {})),
}));

describe("InstrumentoForm — estado vazio (#393)", () => {
  it("mostra estado vazio quando NENHUM item tem texto carregado (caso default/comum hoje)", () => {
    const itensSemTexto: ItemInstrumentoTexto[] = [
      { numeroItem: 1, texto: null },
      { numeroItem: 2, texto: null },
      { numeroItem: 3, texto: null },
    ];

    render(
      <InstrumentoForm
        patientId="pac-1"
        tipoInstrumento="phq9"
        itensTexto={itensSemTexto}
      />,
    );

    expect(
      screen.getByText(/conteúdo do instrumento pendente de configuração/i),
    ).toBeTruthy();
    // Não deve renderizar nenhum campo de resposta nem o botão de salvar.
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("button", { name: /salvar/i })).toBeNull();
  });

  it("mostra estado vazio quando itensTexto vem como array vazio", () => {
    render(
      <InstrumentoForm patientId="pac-1" tipoInstrumento="gad7" itensTexto={[]} />,
    );

    expect(
      screen.getByText(/conteúdo do instrumento pendente de configuração/i),
    ).toBeTruthy();
  });
});

describe("InstrumentoForm — renderização parcial (#393)", () => {
  it("renderiza SÓ os itens com texto carregado, ignorando os sem texto", () => {
    const itensMistos: ItemInstrumentoTexto[] = [
      { numeroItem: 1, texto: "[texto de teste — item 1]" },
      { numeroItem: 2, texto: null },
      { numeroItem: 3, texto: "[texto de teste — item 3]" },
      { numeroItem: 4, texto: null },
      { numeroItem: 5, texto: "[texto de teste — item 5]" },
    ];

    render(
      <InstrumentoForm
        patientId="pac-1"
        tipoInstrumento="phq9"
        itensTexto={itensMistos}
      />,
    );

    // Estado vazio NÃO aparece — há pelo menos um item com texto.
    expect(
      screen.queryByText(/conteúdo do instrumento pendente de configuração/i),
    ).toBeNull();

    expect(
      screen.getByText(/\[texto de teste — item 1\]/),
    ).toBeTruthy();
    expect(
      screen.getByText(/\[texto de teste — item 3\]/),
    ).toBeTruthy();
    expect(
      screen.getByText(/\[texto de teste — item 5\]/),
    ).toBeTruthy();

    // Exatamente 3 radiogroups (um por item COM texto) — itens 2 e 4 não
    // geram campo nenhum.
    expect(screen.getAllByRole("radiogroup")).toHaveLength(3);

    // Botão de salvar existe (algum item renderizado), mas começa desabilitado
    // até todas as respostas serem preenchidas.
    const botao = screen.getByRole("button", { name: /salvar aplicação/i });
    expect(botao).toHaveProperty("disabled", true);
  });

  it("cada item renderizado tem 4 opções de resposta (0 a 3), sem nenhum rótulo de frequência", () => {
    const itensComUmTexto: ItemInstrumentoTexto[] = [
      { numeroItem: 1, texto: "[texto de teste — item 1]" },
    ];

    render(
      <InstrumentoForm
        patientId="pac-1"
        tipoInstrumento="phq9"
        itensTexto={itensComUmTexto}
      />,
    );

    const grupo = screen.getByRole("radiogroup");
    const radios = grupo.querySelectorAll('input[type="radio"]');
    expect(radios).toHaveLength(4);
    const valores = Array.from(radios).map(
      (r) => (r as HTMLInputElement).value,
    );
    expect(valores.sort()).toEqual(["0", "1", "2", "3"]);
  });
});
