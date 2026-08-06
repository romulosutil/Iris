import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmarSobrealocacaoDialog } from "./confirmar-sobrealocacao-dialog";
import type { ConfirmacaoSobrealocacao } from "./prescricao-logic";

/**
 * O diálogo de §MV4 — o que estes casos discriminam:
 *
 * 1. **Dá para sair.** O `open` é derivado do estado da action, que só muda no
 *    próximo submit. Uma versão que não guarda o descarte fica aberta para
 *    sempre: Esc, X e clique no overlay disparam `onOpenChange` e o `open` não
 *    baixa — com o focus trap do Radix ligado, quem navega por teclado fica
 *    preso numa confirmação que ele já recusou.
 * 2. **Uma confirmação nova reabre.** Descartar não pode virar mudo: recusar
 *    uma vez e nunca mais ver o diálogo seria voltar ao "salva em silêncio" que
 *    a fatia existe para eliminar.
 * 3. **Não inventa teto anterior.** Sem prescrição vigente, "passa de 0h para
 *    10h" afirma uma prescrição que nunca existiu.
 * 4. **O confirm carrega o teto que foi lido.** Sem `horasAtuaisEsperadas` no
 *    corpo, o servidor não tem como recusar uma gravação por cima da
 *    represcrição que outro coordenador fez enquanto o diálogo estava aberto.
 */

const BASE: ConfirmacaoSobrealocacao = {
  disciplina: "Fonoaudiologia",
  horasAtuais: 15,
  horasNovas: 10,
  horasAlocadas: 15,
  texto:
    "15h de 10h alocadas (150%) — sobrealocação de 5h. Reduza as horas de um membro ou aumente a prescrição.",
};

function renderizar(confirmacao: ConfirmacaoSobrealocacao | undefined) {
  const formAction = vi.fn();
  const utils = render(
    <ConfirmarSobrealocacaoDialog
      confirmacao={confirmacao}
      formAction={formAction}
      isPending={false}
    />,
  );
  return { ...utils, formAction };
}

describe("ConfirmarSobrealocacaoDialog", () => {
  it("fecha com Esc sem precisar recarregar a página", async () => {
    const user = userEvent.setup();
    renderizar(BASE);
    expect(await screen.findByRole("dialog")).toBeTruthy();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("fecha no Cancelar e reabre quando chega uma confirmação nova", async () => {
    const user = userEvent.setup();
    const { rerender, formAction } = renderizar(BASE);

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    // Cancelar não desfaz nada: o servidor devolveu a confirmação NO LUGAR de
    // gravar. Se cancelar disparasse a action, cancelar salvaria.
    expect(formAction).not.toHaveBeenCalled();

    // Resposta nova do servidor = objeto novo. É o que reabre o diálogo, sem
    // efeito de reset e sem `key` artificial no componente.
    rerender(
      <ConfirmarSobrealocacaoDialog
        confirmacao={{ ...BASE, horasNovas: 8 }}
        formAction={formAction}
        isPending={false}
      />,
    );
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("sem prescrição vigente, não afirma um teto anterior", async () => {
    renderizar({ ...BASE, horasAtuais: undefined });

    const dialogo = await screen.findByRole("dialog");
    expect(dialogo.textContent).toContain("passa a ter 10h prescritas");
    expect(dialogo.textContent).not.toContain("passa de 0h");
  });

  it("repete o aviso de vínculo sem horas que a barra de destino mostra", async () => {
    const aviso =
      "1 vínculo sem horas definidas — a conta acima está incompleta até você defini-las.";
    renderizar({ ...BASE, avisoSemHoras: aviso });

    expect((await screen.findByRole("dialog")).textContent).toContain(aviso);
  });

  it("envia a flag e o teto que o coordenador leu", async () => {
    const { container } = renderizar(BASE);
    await screen.findByRole("dialog");

    const valores = Object.fromEntries(
      Array.from(
        document.querySelectorAll<HTMLInputElement>('input[type="hidden"]'),
      ).map((i) => [i.name, i.value]),
    );
    expect(valores).toMatchObject({
      disciplina: "Fonoaudiologia",
      horasAlvoSemana: "10",
      horasAtuaisEsperadas: "15",
      confirmarSobrealocacao: "1",
    });
    expect(container).toBeTruthy();
  });
});
