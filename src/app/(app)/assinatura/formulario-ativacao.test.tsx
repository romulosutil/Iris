import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormularioAtivacao } from "./formulario-ativacao";
import type { AtivacaoState } from "./logic";

/**
 * O que estes casos discriminam:
 *
 * 1. **Escolha exclusiva de método.** Um `role="group"` de botões
 *    `aria-pressed` (SegmentedControl) passaria numa asserção de texto, mas não
 *    em `getByRole("radio")` — e é a diferença entre o leitor de tela anunciar
 *    "opção 1 de 2" ou dois toggles independentes.
 * 2. **Botão travado durante o envio.** Sem isto, dois cliques = duas
 *    assinaturas criadas no provedor. O teste segura a promise da action
 *    aberta de propósito: com o `disabled` removido, o segundo clique chama a
 *    action de novo e o contador estoura.
 * 3. **Autorização `redirect` vira link visível.** O redirect por
 *    `window.location.assign` não existe no jsdom (nem sob bloqueio de popup
 *    no navegador real). Se a UI dependesse só dele, a pessoa ficaria presa
 *    sem caminho para pagar — o link é o que garante a saída.
 * 4. **Autorização `pix_copia_e_cola` NUNCA vira navegação nem `href`.** É a
 *    asserção que fecha o D21: o BR Code chegava na UI dentro de um campo
 *    chamado `checkoutUrl` e era tratado como URL — `window.location.assign`
 *    num texto EMV e um link quebrado na tela. Aqui o teste prova o negativo
 *    (`navegar` não é chamado, nenhum link aparece) além do positivo (QR +
 *    texto copiável). Só asserir o QR passaria mesmo com a navegação viva.
 */

function acaoQueDevolve(state: AtivacaoState) {
  return vi.fn(async () => state);
}

/** Action que só resolve quando o teste mandar — congela o estado pendente. */
function acaoSuspensa() {
  let liberar!: (s: AtivacaoState) => void;
  const promessa = new Promise<AtivacaoState>((resolve) => {
    liberar = resolve;
  });
  const acao = vi.fn(() => promessa);
  return { acao, liberar: () => liberar({}) };
}

describe("FormularioAtivacao", () => {
  it("oferece cartão e Pix como escolha exclusiva (radiogroup)", () => {
    render(<FormularioAtivacao acao={acaoQueDevolve({})} />);

    const opcoes = screen.getAllByRole("radio");
    expect(opcoes).toHaveLength(2);
    expect(
      screen.getByRole("radio", { name: /cartão de crédito/i }),
    ).toBeDefined();
    expect(screen.getByRole("radio", { name: /pix/i })).toBeDefined();
    // Todos precisam enviar o mesmo campo, senão a action não recebe `metodo`.
    for (const opcao of opcoes) {
      expect(opcao.getAttribute("name")).toBe("metodo");
    }
  });

  it("troca de método sem selecionar os dois ao mesmo tempo", async () => {
    const user = userEvent.setup();
    render(<FormularioAtivacao acao={acaoQueDevolve({})} />);

    const pix = screen.getByRole("radio", {
      name: /pix/i,
    }) as HTMLInputElement;
    const cartao = screen.getByRole("radio", {
      name: /cartão de crédito/i,
    }) as HTMLInputElement;

    await user.click(pix);
    expect(pix.checked).toBe(true);
    expect(cartao.checked).toBe(false);
  });

  it("desabilita o botão enquanto o envio está pendente (duplo clique não vira 2 assinaturas)", async () => {
    const user = userEvent.setup();
    const { acao, liberar } = acaoSuspensa();
    render(<FormularioAtivacao acao={acao} />);

    const botao = screen.getByRole("button", { name: /ativar assinatura/i });
    await user.click(botao);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /abrindo pagamento/i }),
      ).toHaveProperty("disabled", true);
    });

    // Segundo clique no botão travado não pode disparar a action de novo.
    await user.click(
      screen.getByRole("button", { name: /abrindo pagamento/i }),
    );
    expect(acao).toHaveBeenCalledTimes(1);

    liberar();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /ativar assinatura/i }),
      ).toHaveProperty("disabled", false);
    });
  });

  it("mostra o erro da action em role=alert", async () => {
    const user = userEvent.setup();
    render(
      <FormularioAtivacao
        acao={acaoQueDevolve({
          error: "Escolha a forma de pagamento: cartão ou Pix.",
        })}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /ativar assinatura/i }),
    );

    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toMatch(/escolha a forma de pagamento/i);
  });

  it("com autorização redirect no state, oferece link visível para o pagamento", async () => {
    const user = userEvent.setup();
    const url = "https://pagamento.exemplo/checkout/abc123";
    const navegar = vi.fn();
    render(
      <FormularioAtivacao
        acao={acaoQueDevolve({ autorizacao: { forma: "redirect", url } })}
        navegar={navegar}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /ativar assinatura/i }),
    );

    const link = await screen.findByRole("link", {
      name: /ir para o pagamento/i,
    });
    expect(link.getAttribute("href")).toBe(url);
  });

  it("o link de pagamento não depende do redirect automático ter funcionado", async () => {
    const user = userEvent.setup();
    // Navegação bloqueada (popup blocker / política do dispositivo): o efeito
    // estoura e a UI ainda precisa oferecer a saída manual.
    const navegar = vi.fn(() => {
      throw new Error("navegação bloqueada");
    });
    const url = "https://pagamento.exemplo/checkout/xyz";
    render(
      <FormularioAtivacao
        acao={acaoQueDevolve({ autorizacao: { forma: "redirect", url } })}
        navegar={navegar}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /ativar assinatura/i }),
    );

    const link = await screen.findByRole("link", {
      name: /ir para o pagamento/i,
    });
    expect(link.getAttribute("href")).toBe(url);
  });

  it("com Pix copia-e-cola, mostra QR e código — e NUNCA navega (D21)", async () => {
    const user = userEvent.setup();
    const navegar = vi.fn();
    const brCode =
      "00020126580014BR.GOV.BCB.PIX0136f5b1c0de-0000-4000-a000-000000000abc5204000053039865802BR5913CLINICA IRIS6008SAOPAULO62070503***6304AB12";
    render(
      <FormularioAtivacao
        acao={acaoQueDevolve({
          autorizacao: { forma: "pix_copia_e_cola", brCode },
        })}
        navegar={navegar}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /ativar assinatura/i }),
    );

    // O QR é uma renderização do MESMO texto — vem do DS (`QrCode`), com alt
    // de Pix (o default do componente fala de MFA).
    const qr = await screen.findByRole("img", { name: /qr code do pix/i });
    expect(qr).toBeDefined();

    // O BR Code precisa estar visível e selecionável: é o caminho manual de
    // quem não consegue ler o QR nem usar a área de transferência.
    expect(screen.getByText(brCode)).toBeDefined();

    // As duas asserções que fecham o débito: BR Code não é URL.
    expect(navegar).not.toHaveBeenCalled();
    expect(screen.queryByRole("link")).toBeNull();
    for (const el of document.querySelectorAll("[href]")) {
      expect(el.getAttribute("href")).not.toBe(brCode);
    }
  });

  it("o botão copiar entrega o BR Code exato à área de transferência", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const brCode = "00020126330014BR.GOV.BCB.PIX0111copiaecola6304FFFF";
    render(
      <FormularioAtivacao
        acao={acaoQueDevolve({
          autorizacao: { forma: "pix_copia_e_cola", brCode },
        })}
        navegar={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /ativar assinatura/i }),
    );
    await user.click(
      await screen.findByRole("button", { name: /copiar código pix/i }),
    );

    // Exato: um BR Code truncado ou com espaço a mais é recusado pelo banco.
    expect(writeText).toHaveBeenCalledWith(brCode);
  });
});
