import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormularioAtivacao } from "./formulario-ativacao";
import type { AtivacaoState } from "./logic";
import { formatarBRL } from "@/lib/moeda";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter() {
    return {
      refresh: refreshMock,
    };
  },
}));

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
  beforeEach(() => {
    refreshMock.mockReset();
  });

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

    // As asserções que fecham o débito: BR Code não é URL.
    expect(navegar).not.toHaveBeenCalled();
    for (const el of document.querySelectorAll("[href]")) {
      const href = el.getAttribute("href");
      expect(href).not.toBe(brCode);
      // Nem embutido: o BR Code virando query string ou fragmento seria a
      // mesma falha por outro caminho.
      expect(href ?? "").not.toContain(brCode);
    }
    // O único link deste ramo é a saída para o cadastro (T11). Antes esta
    // asserção era `queryByRole("link")` nulo — proxy para "BR Code não vira
    // href" que deixou de valer quando o CTA entrou. A forma exata abaixo é
    // mais apertada que a antiga, não mais frouxa.
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe("/pacientes/novo");
  });

  it("avisa sobre o teto do banco dentro do mesmo Alert e ANTES do QR Code", async () => {
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

    // O aviso existe e nomeia as duas coisas que o leitor precisa fazer:
    // não aceitar o valor da ativação como teto, e usar a conta de folga.
    const aviso = await screen.findByText(/valor máximo/i);
    const paragrafoAviso = aviso.closest("p");
    expect(paragrafoAviso?.textContent).toMatch(/R\$ 40/);
    // E precisa nomear o valor de VERDADE da ativação (via `formatarBRL`,
    // nunca hardcoded) — sem isso, trocar a interpolação por um texto
    // estático errado continuaria verde neste teste (D22).
    expect(paragrafoAviso?.textContent).toContain(formatarBRL(1));

    // Está DENTRO do mesmo Alert do QR Code — não é parágrafo solto ao lado.
    // O título do Alert é o âncora estável: `closest("div")` a partir do QR
    // casaria com a div de layout que só embrulha o QR, nunca com o Alert.
    const qr = screen.getByRole("img", {
      name: /QR Code do Pix para autorizar a assinatura/i,
    });
    const alerta = screen
      .getByText("Falta pagar para concluir")
      .closest("[role='status'], [role='alert']");
    expect(alerta).not.toBeNull();
    expect(alerta?.contains(aviso)).toBe(true);
    expect(alerta?.contains(qr)).toBe(true);

    // E vem ANTES do QR na ordem do DOM: depois de ler o código a pessoa já
    // está no app do banco e não volta para ler aviso nenhum.
    // DOCUMENT_POSITION_FOLLOWING = 4 → `qr` vem depois de `aviso`.
    expect(
      aviso.compareDocumentPosition(qr) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("depois do Pix, oferece caminho de volta ao cadastro — e não antes (T11)", async () => {
    const user = userEvent.setup();
    const brCode = "00020126330014BR.GOV.BCB.PIX0111copiaecola6304FFFF";

    const { unmount } = render(
      <FormularioAtivacao acao={acaoQueDevolve({})} navegar={vi.fn()} />,
    );
    // Antes de qualquer autorização o CTA não existe: oferecer "cadastrar
    // paciente" a quem ainda não pagou é o beco ao contrário — a tela de
    // destino recusaria o cadastro.
    expect(
      screen.queryByRole("link", { name: /cadastrar paciente/i }),
    ).toBeNull();
    unmount();

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

    const cta = await screen.findByRole("link", {
      name: /cadastrar paciente/i,
    });
    expect(cta.getAttribute("href")).toBe("/pacientes/novo");
  });

  it("no ramo redirect não há CTA de cadastro (o pagamento ainda nem abriu)", async () => {
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

    await screen.findByRole("link", { name: /ir para o pagamento/i });
    expect(
      screen.queryByRole("link", { name: /cadastrar paciente/i }),
    ).toBeNull();
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

  it("com Pix pendente, inicia polling de 5s e chama refreshMock (mutação: sem refresh o teste falha)", () => {
    vi.useFakeTimers();
    try {
      const brCode = "00020126330014BR.GOV.BCB.PIX0111copiaecola6304FFFF";
      render(
        <FormularioAtivacao
          acao={acaoQueDevolve({})}
          navegar={vi.fn()}
          estadoInicial={{
            autorizacao: {
              forma: "pix_copia_e_cola",
              brCode,
              valorAtivacaoCentavos: 1,
            },
          }}
          situacaoConta={{
            estado: "trial_expirado",
            podeEscrever: false,
            podeCadastrarPaciente: false,
            diasRestantesTrial: -1,
            statusAssinatura: "free_tier",
            debitoCentavos: 0,
          }}
        />,
      );

      // No Pix pendente, após renderizar o QR code, o polling deve começar.
      expect(refreshMock).not.toHaveBeenCalled();

      // Avança 5 segundos
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(refreshMock).toHaveBeenCalledTimes(1);

      // Avança mais 5 segundos (total 10s)
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(refreshMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("com Pix pendente, reage a visibilitychange com router.refresh() imediato", () => {
    const brCode = "00020126330014BR.GOV.BCB.PIX0111copiaecola6304FFFF";
    render(
      <FormularioAtivacao
        acao={acaoQueDevolve({})}
        navegar={vi.fn()}
        estadoInicial={{
          autorizacao: {
            forma: "pix_copia_e_cola",
            brCode,
            valorAtivacaoCentavos: 1,
          },
        }}
        situacaoConta={{
          estado: "trial_expirado",
          podeEscrever: false,
          podeCadastrarPaciente: false,
          diasRestantesTrial: -1,
          statusAssinatura: "free_tier",
          debitoCentavos: 0,
        }}
      />,
    );

    expect(refreshMock).not.toHaveBeenCalled();

    // Simula visibilitychange para 'visible'
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("quando situacaoConta indica 'ativa', renderiza mensagem de sucesso de assinatura ativada e botão de cadastrar paciente", () => {
    render(
      <FormularioAtivacao
        acao={acaoQueDevolve({})}
        navegar={vi.fn()}
        situacaoConta={{
          estado: "ativa",
          podeEscrever: true,
          podeCadastrarPaciente: true,
          diasRestantesTrial: null,
          statusAssinatura: "active",
          debitoCentavos: 0,
        }}
      />,
    );

    // Verifica que o banner/alerta de sucesso e o botão estão presentes
    const alert = screen.getByRole("status");
    expect(alert.textContent).toContain(
      "Sua assinatura foi ativada com sucesso!",
    );

    const link = screen.getByRole("link", { name: /cadastrar paciente/i });
    expect(link.getAttribute("href")).toBe("/pacientes/novo");

    // O formulário de ativação (input/botão de ativação) não deve mais ser exibido
    expect(screen.queryByLabelText(/cpf ou cnpj do titular/i)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /ativar assinatura/i }),
    ).toBeNull();
  });

  /**
   * Os três casos abaixo cobrem mutantes que sobreviviam à suíte original: com
   * `clearInterval`, o guard `estaAtiva` e o guard `document.visibilityState`
   * REMOVIDOS um a um do efeito, os testes continuavam 19/19 verdes. Ou seja: o
   * "pare de fazer polling" — que é item da definição de pronto da #285 — não
   * era verificado por CI nenhum.
   */

  it("para o polling ao desmontar — sem `clearInterval` o timer vaza e continua chamando refresh", () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(
        <FormularioAtivacao
          acao={acaoQueDevolve({})}
          navegar={vi.fn()}
          estadoInicial={{
            autorizacao: {
              forma: "pix_copia_e_cola",
              brCode: "00020126330014BR.GOV.BCB.PIX0111copiaecola6304FFFF",
              valorAtivacaoCentavos: 1,
            },
          }}
          situacaoConta={{
            estado: "trial_expirado",
            podeEscrever: false,
            podeCadastrarPaciente: false,
            diasRestantesTrial: -1,
            statusAssinatura: "free_tier",
            debitoCentavos: 0,
          }}
        />,
      );

      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(refreshMock).toHaveBeenCalledTimes(1);

      unmount();

      // Três ciclos inteiros depois do desmonte: o intervalo tem de estar morto.
      // Sem o `clearInterval` da limpeza, o `setInterval` sobrevive ao
      // componente e fica batendo no servidor até a aba fechar.
      act(() => {
        vi.advanceTimersByTime(15000);
      });
      expect(refreshMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("para o polling quando a conta vira `ativa` — item 2 da definição de pronto da #285", () => {
    vi.useFakeTimers();
    try {
      const autorizacaoPendente = {
        autorizacao: {
          forma: "pix_copia_e_cola" as const,
          brCode: "00020126330014BR.GOV.BCB.PIX0111copiaecola6304FFFF",
          valorAtivacaoCentavos: 1,
        },
      };

      const { rerender } = render(
        <FormularioAtivacao
          acao={acaoQueDevolve({})}
          navegar={vi.fn()}
          estadoInicial={autorizacaoPendente}
          situacaoConta={{
            estado: "trial_expirado",
            podeEscrever: false,
            podeCadastrarPaciente: false,
            diasRestantesTrial: -1,
            statusAssinatura: "free_tier",
            debitoCentavos: 0,
          }}
        />,
      );

      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(refreshMock).toHaveBeenCalledTimes(1);

      // É exatamente o que acontece em produção: um `router.refresh()` traz do
      // Server Component a `situacaoConta` nova, já `ativa`. A autorização Pix
      // do `useActionState` NÃO some — continua no estado do cliente —, então
      // quem tem de derrubar o intervalo é o guard `estaAtiva`, não a ausência
      // de autorização.
      act(() => {
        rerender(
          <FormularioAtivacao
            acao={acaoQueDevolve({})}
            navegar={vi.fn()}
            estadoInicial={autorizacaoPendente}
            situacaoConta={{
              estado: "ativa",
              podeEscrever: true,
              podeCadastrarPaciente: true,
              diasRestantesTrial: null,
              statusAssinatura: "active",
              debitoCentavos: 0,
            }}
          />,
        );
      });

      act(() => {
        vi.advanceTimersByTime(15000);
      });
      expect(refreshMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("não faz refresh no `visibilitychange` quando a aba ficou OCULTA", () => {
    render(
      <FormularioAtivacao
        acao={acaoQueDevolve({})}
        navegar={vi.fn()}
        estadoInicial={{
          autorizacao: {
            forma: "pix_copia_e_cola",
            brCode: "00020126330014BR.GOV.BCB.PIX0111copiaecola6304FFFF",
            valorAtivacaoCentavos: 1,
          },
        }}
        situacaoConta={{
          estado: "trial_expirado",
          podeEscrever: false,
          podeCadastrarPaciente: false,
          diasRestantesTrial: -1,
          statusAssinatura: "free_tier",
          debitoCentavos: 0,
        }}
      />,
    );

    // O jsdom já nasce com `visibilityState === "visible"`, então o caso
    // "visible" do teste acima passa mesmo se o guard for apagado. Só o caso
    // OCULTO discrimina o guard.
    try {
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));

      expect(refreshMock).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        writable: true,
        configurable: true,
      });
    }
  });
  /**
   * Débito de reativação (#290).
   *
   * O caso que fecha o beco sem saída é o do **polling**: pagar o débito NÃO
   * move `subscription.status` — a assinatura continua `canceled` até a clínica
   * autorizar o Pix Automático de novo. Um polling que esperasse
   * `estado === "ativa"` giraria para sempre sobre um QR já pago, a pessoa
   * concluiria que falhou e pagaria de novo. O sinal correto é
   * `debitoCentavos` chegando a zero, e é isso que os dois últimos casos
   * discriminam: com o guard trocado por `estado`, eles falham.
   */
  describe("débito de reativação", () => {
    const situacao = (debitoCentavos: number) => ({
      estado: "cancelada" as const,
      podeEscrever: false,
      podeCadastrarPaciente: false,
      diasRestantesTrial: -1,
      statusAssinatura: "canceled",
      debitoCentavos,
    });

    // Lista de uma entrada: o contrato do gate já é `cobrancas[]` (#310), mas a
    // política ainda emite uma cobrança só.
    const DEBITO = {
      valorCentavos: 1300,
      // Caso normal: tudo o que se deve está na tela (revisão do PR #339).
      residuoCentavos: 0,
      cobrancas: [
        {
          cicloId: "ciclo-1",
          providerChargeId: "pay_290",
          valorCentavos: 1300,
          reaproveitada: false,
          situacao: {
            estado: "pagavel" as const,
            pagamento: {
              forma: "pix_copia_e_cola" as const,
              brCode: "00020126…debito-290",
            },
          },
        },
      ],
    };

    /** Cobrança pagável por copia-e-cola. `reaproveitada` é parâmetro porque é
     *  ele que muda o nome do bloco na árvore de acessibilidade (#310). */
    const cobranca = (
      id: string,
      valorCentavos: number,
      brCode: string,
      reaproveitada = true,
    ) => ({
      cicloId: `ciclo-${id}`,
      providerChargeId: id,
      valorCentavos,
      reaproveitada,
      situacao: {
        estado: "pagavel" as const,
        pagamento: { forma: "pix_copia_e_cola" as const, brCode },
      },
    });

    const EM_PROCESSAMENTO = {
      cicloId: "ciclo-x",
      providerChargeId: "pay_x",
      valorCentavos: 1300,
      reaproveitada: true,
      situacao: { estado: "em_processamento" as const },
    };

    it("avisa o valor em aberto ANTES de a pessoa clicar em ativar", () => {
      render(
        <FormularioAtivacao
          acao={acaoQueDevolve({})}
          navegar={vi.fn()}
          situacaoConta={situacao(1300)}
        />,
      );

      expect(screen.getByText(/há um valor em aberto/i)).toBeTruthy();
      expect(document.body.textContent).toMatch(/13,00/);
    });

    it("quem não deve nada não vê aviso de débito", () => {
      render(
        <FormularioAtivacao
          acao={acaoQueDevolve({})}
          navegar={vi.fn()}
          situacaoConta={situacao(0)}
        />,
      );

      expect(screen.queryByText(/valor em aberto/i)).toBeNull();
    });

    it("com débito cobrado, mostra o copia-e-cola e NÃO o QR de ativação", () => {
      render(
        <FormularioAtivacao
          acao={acaoQueDevolve({})}
          navegar={vi.fn()}
          estadoInicial={{ debito: DEBITO }}
          situacaoConta={situacao(1300)}
        />,
      );

      expect(screen.getByText(/pague o valor em aberto/i)).toBeTruthy();
      expect(document.body.textContent).toMatch(/00020126…debito-290/);
      // A autorização de R$ 0,01 não pode existir ainda: o gate barrou antes.
      expect(screen.queryByText(/falta pagar para concluir/i)).toBeNull();
    });

    it("quitado o débito, troca o QR por confirmação em vez de girar para sempre", () => {
      render(
        <FormularioAtivacao
          acao={acaoQueDevolve({})}
          navegar={vi.fn()}
          estadoInicial={{ debito: DEBITO }}
          // O sinal que muda é o DÉBITO. `estado` continua `cancelada`.
          situacaoConta={situacao(0)}
        />,
      );

      expect(screen.getByText(/débito quitado/i)).toBeTruthy();
      expect(screen.queryByText(/pague o valor em aberto/i)).toBeNull();
      expect(document.body.textContent).not.toMatch(/00020126…debito-290/);
    });

    /**
     * Qual mutação este teste mata: renderizar só `cobrancas[0]`. A segunda
     * cobrança ficaria invisível, a clínica pagaria metade do que deve e
     * continuaria barrada por uma dívida que a tela não mostra.
     */
    it("com duas cobranças, mostra os dois códigos e os dois valores", () => {
      render(
        <FormularioAtivacao
          acao={acaoQueDevolve({})}
          navegar={vi.fn()}
          estadoInicial={{
            debito: {
              valorCentavos: 2000,
              residuoCentavos: 0,
              cobrancas: [
                cobranca("pay_a", 1300, "00020126-codigo-a"),
                cobranca("pay_b", 700, "00020126-codigo-b", false),
              ],
            },
          }}
          situacaoConta={situacao(2000)}
        />,
      );

      expect(document.body.textContent).toMatch(/00020126-codigo-a/);
      expect(document.body.textContent).toMatch(/00020126-codigo-b/);
      expect(document.body.textContent).toMatch(/13,00/);
      expect(document.body.textContent).toMatch(/7,00/);
      expect(
        screen.getAllByRole("button", { name: /copiar código pix/i }),
      ).toHaveLength(2);
    });

    /**
     * Qual mutação este teste mata: empilhar as cobranças como parágrafos soltos
     * dentro do mesmo bloco (sem `role="group"` + `aria-labelledby`). Visualmente
     * a separação continuaria de pé pela borda, mas quem usa leitor de tela
     * receberia dois QR Codes, dois valores e dois botões "Copiar código Pix"
     * numa sequência sem fronteira — e copiaria o código de uma cobrança
     * achando que era o da outra. Os nomes são o que cada bloco É (valor +
     * origem), não "cobrança 1 de 2": posição não diz qual delas pagar.
     */
    /**
     * Revisão do PR #339 — o resíduo é DITO, não escondido.
     *
     * Há estados em que parte da dívida não vira cobrança nesta tela (a
     * consolidada volta estornada, o gateway recusa, o resto fica abaixo do
     * piso) e outra parte é pagável. O total mostrado passou a ser o do que
     * está na mesa; sem esta frase a clínica pagaria o QR de R$ 13,00
     * acreditando ter quitado tudo, e continuaria barrada.
     *
     * Qual mutação este teste mata: apagar o parágrafo do resíduo (ou renderizá-lo
     * só quando há mais de uma cobrança). O valor é asserido junto do texto
     * porque uma frase genérica de "ainda há pendências" não diz quanto falta.
     */
    it("resíduo sem cobrança na tela é dito, com o valor", () => {
      render(
        <FormularioAtivacao
          acao={acaoQueDevolve({})}
          navegar={vi.fn()}
          estadoInicial={{
            debito: {
              valorCentavos: 1300,
              residuoCentavos: 700,
              cobrancas: [cobranca("pay_a", 1300, "00020126-codigo-a")],
            },
          }}
          situacaoConta={situacao(2000)}
        />,
      );

      // O total da cobrança na mesa continua sendo o do QR.
      expect(document.body.textContent).toMatch(
        /Esta cobrança é de R\$\s*13,00/,
      );
      // ...e o que sobrou aparece nomeado, com valor.
      expect(document.body.textContent).toMatch(/não estão nesta tela/i);
      expect(document.body.textContent).toMatch(/7,00/);
    });

    it("sem resíduo, a tela não inventa pendência nenhuma", () => {
      // O negativo do caso acima: com `residuoCentavos: 0` (o caminho de toda
      // clínica), a frase não pode aparecer — um aviso permanente de "ainda há
      // valor em aberto" treinaria a pessoa a ignorá-lo justamente quando é real.
      render(
        <FormularioAtivacao
          acao={acaoQueDevolve({})}
          navegar={vi.fn()}
          estadoInicial={{ debito: DEBITO }}
          situacaoConta={situacao(1300)}
        />,
      );

      expect(document.body.textContent).not.toMatch(/não estão nesta tela/i);
    });

    it("cada cobrança é um bloco nomeado, distinguível por leitor de tela", () => {
      render(
        <FormularioAtivacao
          acao={acaoQueDevolve({})}
          navegar={vi.fn()}
          estadoInicial={{
            debito: {
              valorCentavos: 2000,
              residuoCentavos: 0,
              cobrancas: [
                cobranca("pay_a", 1300, "00020126-codigo-a"),
                cobranca("pay_b", 700, "00020126-codigo-b", false),
              ],
            },
          }}
          situacaoConta={situacao(2000)}
        />,
      );

      expect(screen.getAllByRole("group")).toHaveLength(2);
      // Sem `R$` nas expressões: o separador do `Intl` pt-BR é espaço
      // inquebrável, e casá-lo aqui tornaria o teste refém do runtime de ICU.
      expect(
        screen.getByRole("group", {
          name: /13,00.*enviada antes e ainda válida/i,
        }),
      ).toBeTruthy();
      expect(
        screen.getByRole("group", { name: /7,00.*criada agora/i }),
      ).toBeTruthy();
    });

    /**
     * Qual mutação este teste mata: cair no ramo do QR com `brCode` indefinido —
     * um QR vazio e um copia-e-cola em branco, dentro exatamente da janela em
     * que pagar por fora significa pagar duas vezes. A asserção da região viva
     * mata a segunda mutação: mover a copy para fora do `<Alert>` (um `<div>`
     * qualquer) deixaria o estado visível mas NÃO anunciado — quem não olha a
     * tela nunca saberia que o código sumiu de propósito.
     */
    it("cobrança em processamento não mostra QR nem botão de copiar", () => {
      render(
        <FormularioAtivacao
          acao={acaoQueDevolve({})}
          navegar={vi.fn()}
          estadoInicial={{
            debito: {
              valorCentavos: 1300,
              residuoCentavos: 0,
              cobrancas: [EM_PROCESSAMENTO],
            },
          }}
          situacaoConta={situacao(1300)}
        />,
      );

      expect(screen.getByText(/em processamento no seu banco/i)).toBeTruthy();
      expect(document.body.textContent).toMatch(/não pague por outro meio/i);
      expect(
        screen.queryByRole("button", { name: /copiar código pix/i }),
      ).toBeNull();
      expect(screen.queryByRole("img", { name: /qr code do pix/i })).toBeNull();

      const regioesVivas = screen.getAllByRole("status");
      expect(
        regioesVivas.some((el) =>
          /em processamento no seu banco/i.test(el.textContent ?? ""),
        ),
      ).toBe(true);
    });

    /**
     * Qual mutação este teste mata: parar o polling quando não há código de
     * pagamento na tela (guard trocado por `situacao.estado === "pagavel"` ou
     * pela presença do BR Code). A cobrança aqui é `em_processamento` de
     * propósito — não há QR nenhum — e é justamente nesse estado que a tela
     * PRECISA continuar girando: o único jeito de a clínica saber que o débito
     * automático foi confirmado é esta tela revalidar sozinha. Com a mutação, a
     * pessoa fica olhando "em processamento" para sempre.
     */
    it("faz polling enquanto o débito não é quitado, mesmo sem código na tela", () => {
      vi.useFakeTimers();
      try {
        render(
          <FormularioAtivacao
            acao={acaoQueDevolve({})}
            navegar={vi.fn()}
            estadoInicial={{
              debito: {
                valorCentavos: 1300,
                residuoCentavos: 0,
                cobrancas: [EM_PROCESSAMENTO],
              },
            }}
            situacaoConta={situacao(1300)}
          />,
        );

        act(() => {
          vi.advanceTimersByTime(5000);
        });
        expect(refreshMock).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("para o polling assim que o débito zera — a assinatura segue cancelada", () => {
      vi.useFakeTimers();
      try {
        render(
          <FormularioAtivacao
            acao={acaoQueDevolve({})}
            navegar={vi.fn()}
            estadoInicial={{ debito: DEBITO }}
            situacaoConta={situacao(0)}
          />,
        );

        act(() => {
          vi.advanceTimersByTime(20000);
        });
        // Zero: sem este guard o timer vaza girando sobre um débito já pago.
        expect(refreshMock).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
