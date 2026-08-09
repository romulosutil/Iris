import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BotaoCopiar } from "./botao-copiar";

/**
 * O que estes casos discriminam:
 *
 * 1. **Copia o valor exato.** Um componente que copiasse o texto renderizado
 *    (com quebra visual, elipse ou formatação) passaria numa asserção de
 *    "chamou writeText" e entregaria lixo ao banco.
 * 2. **A confirmação é anunciada, não só desenhada.** A troca do rótulo do
 *    botão não é evento confiável para leitor de tela; a região
 *    `aria-live="polite"` é o que garante o anúncio — por isso o teste olha
 *    `role="status"`, não só o texto do botão.
 * 3. **Sem `navigator.clipboard` não estoura.** Contexto não-seguro deixa a
 *    API `undefined`: chamar `.writeText` ali é TypeError síncrono, que um
 *    `try/catch` em volta de `await promessa` não pegaria se o componente
 *    presumisse a API. A falha precisa virar mensagem, não tela quebrada.
 */

function instalarClipboard(
  impl: { writeText: () => Promise<void> } | undefined,
) {
  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: impl,
    configurable: true,
  });
}

afterEach(() => {
  instalarClipboard(undefined);
});

describe("BotaoCopiar", () => {
  it("copia o valor exato para a área de transferência", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    instalarClipboard({ writeText });
    const valor = "  código-com-espaços-e-Maiúsculas  ";

    render(<BotaoCopiar valor={valor} rotulo="Copiar chave" />);
    await user.click(screen.getByRole("button", { name: /copiar chave/i }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(valor);
  });

  it("anuncia a confirmação em região aria-live após copiar", async () => {
    const user = userEvent.setup();
    instalarClipboard({ writeText: vi.fn(async () => {}) });

    render(<BotaoCopiar valor="abc" rotulo="Copiar chave" />);

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    // Região já montada ANTES da ação: inserir o nó junto com o texto costuma
    // não ser anunciado.
    expect(status.textContent).toBe("");

    await user.click(screen.getByRole("button", { name: /copiar chave/i }));

    expect(screen.getByRole("status").textContent).toMatch(/copiado/i);
    expect(screen.getByRole("button").textContent).toMatch(/copiado/i);
  });

  it("sem navigator.clipboard, avisa a falha em vez de estourar", async () => {
    const user = userEvent.setup();
    instalarClipboard(undefined);

    render(<BotaoCopiar valor="abc" rotulo="Copiar chave" />);
    await user.click(screen.getByRole("button", { name: /copiar chave/i }));

    // Nem sucesso silencioso nem tela quebrada: o valor segue na tela e a
    // pessoa é instruída a copiar à mão.
    expect(screen.getByRole("status").textContent).toMatch(
      /não foi possível copiar/i,
    );
    expect(screen.getByRole("button", { name: /copiar chave/i })).toBeDefined();
  });

  it("propaga a falha quando writeText rejeita (permissão negada)", async () => {
    const user = userEvent.setup();
    instalarClipboard({
      writeText: vi.fn(async () => {
        throw new Error("permissão negada");
      }),
    });

    render(<BotaoCopiar valor="abc" rotulo="Copiar chave" />);
    await user.click(screen.getByRole("button", { name: /copiar chave/i }));

    expect(screen.getByRole("status").textContent).toMatch(
      /não foi possível copiar/i,
    );
  });
});
