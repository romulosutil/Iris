import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

// Mesmo motivo do popover-alocar.a11y.test.tsx: ./actions é "use server" e
// puxa @/db/client no load. Aqui, além disso, a action é DUBLADA para devolver
// `ok: true` sem rede — é o sucesso que arma o efeito sob teste.
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));
vi.mock("./actions", () => ({
  criarRegraAction: vi.fn(async () => ({ ok: true })),
  criarAvulsaAction: vi.fn(async () => ({ ok: true })),
  listarDisciplinasEquipeAction: vi.fn(async () => []),
}));

const { PopoverAlocar } = await import("./popover-alocar");

afterEach(cleanup);

const props = {
  aberto: true,
  diaSemana: 1,
  inicioMin: 540,
  dataISO: "2026-07-13",
  semanaVisivelISO: "2026-07-13",
  hojeISO: "2026-07-13",
  eixo: "terapeuta" as const,
  entidadeFixa: { id: "t1", nome: "Dra. Sofia" },
  pacientes: [{ id: "p1", nome: "Ana Alfa" }],
  terapeutas: [{ id: "t1", nome: "Dra. Sofia" }],
  disciplinas: ["aba", "fono", "to"],
  duracaoPadrao: { aba: 60, fono: 30, to: 50 },
};

describe("PopoverAlocar — efeito de sucesso", () => {
  test("dispara aoSucesso UMA vez, mesmo com o pai re-renderizando e trocando as callbacks", async () => {
    const aoSucesso = vi.fn();

    // Reproduz o pai real (`semana-cliente`): as duas callbacks são arrow
    // inline e `aoSucesso` mexe no estado dele. Se o efeito do filho
    // dependesse da identidade delas, este render entraria em laço —
    // `aoSucesso` -> setVersao -> novas funções -> efeito -> `aoSucesso`.
    function Pai() {
      const [versao, setVersao] = useState(0);
      return (
        <>
          <span data-testid="versao">{versao}</span>
          <PopoverAlocar
            {...props}
            aoFechar={() => setVersao((v) => v)}
            aoSucesso={() => {
              aoSucesso();
              setVersao((v) => v + 1);
            }}
          />
        </>
      );
    }

    render(<Pai />);
    await userEvent.click(
      screen.getByRole("button", { name: /confirmar alocação/i }),
    );

    await waitFor(() => expect(aoSucesso).toHaveBeenCalled());
    // A rerenderização do pai já aconteceu (versão saiu de 0). Um laço faria
    // esta contagem crescer sem parar; o contrato é exatamente uma chamada.
    expect(screen.getByTestId("versao").textContent).toBe("1");
    expect(aoSucesso).toHaveBeenCalledTimes(1);
  });
});
