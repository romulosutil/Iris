import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormularioAtivacao } from "./formulario-ativacao";
import type { AtivacaoState } from "./logic";

/**
 * O que estes casos discriminam:
 *
 * 1. **Ausência de escolha de método.** A tela oferecia cartão e Pix num
 *    radiogroup, com cartão pré-selecionado — e entregava Pix nos dois casos,
 *    porque `NovoVinculo.metodo` não é lido por adapter nenhum. O caso agora
 *    trava o negativo: nenhum controle de escolha e nenhum campo `metodo` no
 *    corpo enviado. Asserir só `queryAllByRole("radio")` vazio seria fraco —
 *    um `<select>` ou um SegmentedControl devolveria a ficção passando no teste.
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
  it("não oferece escolha de método — nenhum controle, nenhum campo `metodo`", () => {
    const { container } = render(
      <FormularioAtivacao acao={acaoQueDevolve({})} />,
    );

    // Não basta asserir a ausência de `radio`: trocar os radios por um
    // SegmentedControl (`aria-pressed`), um `<select>` ou um par de botões
    // passaria naquela asserção sozinha e devolveria a escolha ficcional à tela.
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    expect(screen.queryByText(/cartão de crédito/i)).toBeNull();

    // O oráculo mais forte é o CORPO enviado: nenhum controle chamado `metodo`
    // sai deste formulário, então a action não tem o que ignorar.
    expect(container.querySelectorAll('[name="metodo"]')).toHaveLength(0);
  });

  it("declara o trilho de pagamento real (Pix Automático) sem citar valor", () => {
    render(<FormularioAtivacao acao={acaoQueDevolve({})} />);

    // Casamento exato no título do bloco, não `/pix automático/i` solto: a dica
    // do campo de documento também nomeia o trilho, e uma regex frouxa passaria
    // a falhar por ambiguidade em vez de por regressão.
    expect(screen.getByText("Pagamento por Pix Automático")).toBeDefined();
    // Nenhum valor hardcoded nesta parte da tela: quem diz quanto a ativação
    // cobra é a autorização devolvida pelo provedor (D22). Um preço escrito aqui
    // seria uma segunda fonte da verdade, que envelhece sozinha.
    expect(screen.queryByText(/R\$/)).toBeNull();
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
          autorizacao: {
            forma: "pix_copia_e_cola",
            brCode,
            valorAtivacaoCentavos: 1,
          },
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
          autorizacao: {
            forma: "pix_copia_e_cola",
            brCode,
            valorAtivacaoCentavos: 1,
          },
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

  it("diz quanto o QR cobra, e por quê, antes do QR (D22)", async () => {
    const user = userEvent.setup();
    const brCode = "00020126330014BR.GOV.BCB.PIX0111copiaecola6304FFFF";
    render(
      <FormularioAtivacao
        acao={acaoQueDevolve({
          autorizacao: {
            forma: "pix_copia_e_cola",
            brCode,
            valorAtivacaoCentavos: 1,
          },
        })}
        navegar={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /ativar assinatura/i }),
    );

    // A divulgação vive DENTRO da mesma região do QR: o <Alert severidade=
    // "info" /> é `role=status` (live region polite), então um leitor de tela
    // recebe o preço junto com o resto, não como texto órfão ao lado. Por isso
    // a asserção parte da região, não do documento.
    const alerta = (
      await screen.findByText(/falta pagar para concluir/i)
    ).closest('[role="status"]')!;
    const texto = alerta.textContent ?? "";

    // O valor formatado, com o espaço não-quebrável do Intl normalizado.
    expect(texto.replace(/ /g, " ")).toMatch(/R\$ 0,01/);
    // Cobra AGORA, neste QR — não "pode cobrar", não "em algum momento".
    expect(texto).toMatch(/cobra .*agora/is);
    // O motivo: é o pagamento que registra a autorização no banco.
    expect(texto).toMatch(/registra a autorização/i);
    // E o que NÃO é: a mensalidade, que só nasce no fim do 1º ciclo.
    expect(texto).toMatch(/não é a mensalidade/i);
    expect(texto).toMatch(/primeiro ciclo fecha/i);

    // Ordem importa: dinheiro sai da conta antes de a pessoa ler o QR, então a
    // frase precisa vir antes dele no DOM — depois é aviso pós-fato.
    const qr = screen.getByRole("img", { name: /qr code do pix/i });
    const paragrafoValor = alerta.querySelector("strong")!.closest("p")!;
    expect(
      paragrafoValor.compareDocumentPosition(qr) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(paragrafoValor.textContent?.replace(/ /g, " ")).toMatch(/R\$ 0,01/);
  });

  /**
   * T8 — campo de documento. O que estes casos discriminam:
   *
   * - O corpo enviado carrega `cpfCnpj`. Sem isto, a ativação inteira responde
   *   "Documento deve ser um CPF (11 dígitos) ou um CNPJ (14 dígitos)" mesmo
   *   com tudo o mais certo — que é o bug que o T7 deixou aberto de propósito.
   * - O erro aparece JUNTO do campo e ligado por `aria-describedby`. Asserir só
   *   que o texto existe na tela passaria com a mensagem órfã no topo, que é
   *   exatamente o que o `<Field>` existe para evitar.
   * - O que foi digitado sobrevive à recusa. Formulário não-controlado + React
   *   19 limpa o campo depois da action: sem o `key`/`defaultValue`, corrigir
   *   um dígito viraria redigitar tudo.
   */
  it("envia o documento digitado no corpo da action", async () => {
    const user = userEvent.setup();
    const acao = vi.fn(
      async (_prev: AtivacaoState, _formData: FormData) =>
        ({}) as AtivacaoState,
    );
    render(<FormularioAtivacao acao={acao} />);

    await user.type(
      screen.getByLabelText(/cpf ou cnpj do titular/i),
      "29.811.201/0001-50",
    );
    await user.click(
      screen.getByRole("button", { name: /ativar assinatura/i }),
    );

    await waitFor(() => expect(acao).toHaveBeenCalledTimes(1));
    const corpo = acao.mock.calls[0]![1];
    expect(corpo.get("cpfCnpj")).toBe("29.811.201/0001-50");
  });

  it("erro de documento é renderizado no campo e ligado por aria-describedby", async () => {
    const user = userEvent.setup();
    const erro =
      "Documento deve ser um CPF (11 dígitos) ou um CNPJ (14 dígitos).";
    render(
      <FormularioAtivacao
        acao={acaoQueDevolve({
          error: erro,
          erroDocumento: erro,
          documento: "123",
        })}
      />,
    );

    // Digitar ANTES de submeter não é decoração: é o caminho real, e é o único
    // que exercita o input já "sujo". Renderizar o erro sem passar por aqui
    // testaria um campo intocado, que o navegador repopula por outro caminho.
    await user.type(screen.getByLabelText(/cpf ou cnpj do titular/i), "123");
    await user.click(
      screen.getByRole("button", { name: /ativar assinatura/i }),
    );

    const campo = await screen.findByLabelText(/cpf ou cnpj do titular/i);
    const descritores = (campo.getAttribute("aria-describedby") ?? "").split(
      /\s+/,
    );
    expect(descritores).toContain("cpfCnpj-error");
    expect(document.getElementById("cpfCnpj-error")?.textContent).toBe(erro);
    // Não repetido no topo: uma mensagem, um lugar.
    expect(screen.getAllByText(erro)).toHaveLength(1);
    // E o que foi digitado volta para o campo, com máscara e tudo.
    expect(campo).toHaveProperty("value", "123");
  });

  it("pré-preenche com o documento já gravado, sem travar a edição", async () => {
    const user = userEvent.setup();
    render(
      <FormularioAtivacao
        acao={acaoQueDevolve({})}
        documentoAtual="29811201000150"
      />,
    );

    const campo = screen.getByLabelText(/cpf ou cnpj do titular/i);
    expect(campo).toHaveProperty("value", "29811201000150");
    expect(campo).toHaveProperty("readOnly", false);
    expect(campo).toHaveProperty("disabled", false);

    await user.clear(campo);
    await user.type(campo, "11144477735");
    expect(campo).toHaveProperty("value", "11144477735");
  });

  it("falha de gateway continua no topo, não no campo de documento", async () => {
    const user = userEvent.setup();
    render(
      <FormularioAtivacao
        acao={acaoQueDevolve({
          error: "Não foi possível abrir o pagamento agora.",
          documento: "29811201000150",
        })}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /ativar assinatura/i }),
    );

    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toMatch(/não foi possível abrir o pagamento/i);
    // O campo não fica marcado como inválido por uma falha que não é dele.
    expect(document.getElementById("cpfCnpj-error")).toBeNull();
    expect(
      screen
        .getByLabelText(/cpf ou cnpj do titular/i)
        .getAttribute("aria-invalid"),
    ).toBeNull();
  });

  it("o ramo redirect não fala em cobrança de ativação", async () => {
    const user = userEvent.setup();
    render(
      <FormularioAtivacao
        acao={acaoQueDevolve({
          autorizacao: {
            forma: "redirect",
            url: "https://pagamento.exemplo/checkout/abc123",
          },
        })}
        navegar={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /ativar assinatura/i }),
    );

    // Prova do negativo: o checkout registra o meio de pagamento sem debitar.
    // Herdar a divulgação do Pix aqui seria afirmar uma cobrança que não
    // existe — mentira simétrica à que o D22 corrigiu.
    const alerta = (
      await screen.findByText(/falta pagar para concluir/i)
    ).closest('[role="status"]')!;
    const texto = (alerta.textContent ?? "").replace(/ /g, " ");
    expect(texto).not.toMatch(/R\$/);
    expect(texto).not.toMatch(/cobra .*agora/is);
  });
});
