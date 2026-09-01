import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

// CorrigirNota → ConsolidarForm → ./actions ("use server") → getTenantContext
// → @/db/client (abriria conexão Postgres no import). No jsdom só
// renderizamos; nenhuma action é de fato invocada.
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));

const { CorrigirNota } = await import("./corrigir-nota");

afterEach(cleanup);

const SESSION_ID = "00000000-0000-0000-0000-000000000000";
const NOTA = "Paciente manteve contato visual por 8 minutos na atividade X.";

// O conteúdo vive dentro de um `<details>` fechado: consultar por role o
// esconderia. As asserções vão ao DOM cru de propósito.
function montar(
  visibilityLevel:
    "multidisciplinary" | "discipline_only" = "multidisciplinary",
) {
  const { container } = render(
    <CorrigirNota
      sessionId={SESSION_ID}
      texto={NOTA}
      visibilityLevel={visibilityLevel}
    />,
  );
  return container;
}

describe("CorrigirNota (#513)", () => {
  test("pré-popula o textarea com a nota já consolidada", () => {
    const textarea = montar().querySelector<HTMLTextAreaElement>(
      "textarea[name='texto']",
    );
    expect(textarea).not.toBeNull();
    // O defeito de #513 era exatamente este valor vindo vazio: corrigir um
    // erro de digitação exigiria redigitar a nota inteira, e salvar um texto
    // parcial sobrescreveria o registro clínico salvo.
    expect(textarea!.value).toBe(NOTA);
  });

  test("nota 'discipline_only' já vem com o sigilo marcado", () => {
    const check = montar("discipline_only").querySelector<HTMLInputElement>(
      "input[name='visibilityLevel']",
    );
    expect(check).not.toBeNull();
    // `consolidarSessaoAction` grava `multidisciplinary` quando o checkbox não
    // vem no FormData. Desmarcado aqui, salvar uma correção de digitação
    // rebaixaria o sigilo profissional da nota em silêncio.
    expect(check!.checked).toBe(true);
  });

  test("nota multidisciplinar não marca o sigilo por conta própria", () => {
    const check = montar().querySelector<HTMLInputElement>(
      "input[name='visibilityLevel']",
    );
    expect(check!.checked).toBe(false);
  });

  test("é conserto, não o próximo passo: nasce fechado e avisa que reabre a análise", () => {
    const container = montar();
    const detalhes = container.querySelector("details");
    expect(detalhes).not.toBeNull();
    expect(detalhes!.open).toBe(false);
    expect(container.textContent).toContain("Salvar reabre a análise da IA");
    // Consequência sobre o que já foi decidido tem que estar dita.
    expect(container.textContent).toMatch(
      /aprovou, editou ou descartado|aprovou, editou ou descartou/i,
    );
  });

  test("o submit é de correção, não de primeira consolidação", () => {
    const botao = montar().querySelector("button[type='submit']");
    expect(botao!.textContent).toBe("Salvar correção");
  });
});
