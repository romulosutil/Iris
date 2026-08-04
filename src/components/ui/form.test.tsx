import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Form } from "./form";
import { Input } from "./input";

/**
 * O bug que estes testes travam: o `<Alert>` de erro nasce no TOPO do
 * formulário, fora do campo de visão de quem já rolou a página, e o foco fica
 * onde estava — no botão de envio. A pessoa clica em "salvar", nada se move, e
 * o formulário parece quebrado.
 *
 * Todos os casos abaixo **falham contra a versão anterior do `<Form>`**, que só
 * renderizava o Alert condicionalmente, sem ref, sem `tabIndex`, sem
 * `scrollIntoView` e sem live region.
 *
 * Uso `rerender` em vez de submeter de verdade porque é exatamente essa a forma
 * do bug em produção: `useActionState` devolve um estado novo com `error`
 * preenchido, e o React re-renderiza o `<Form>` com a prop nova. Simular o
 * submit traria o servidor para dentro de um teste de componente sem cobrir
 * nada a mais.
 */
function regiaoDeErro(container: HTMLElement): HTMLElement {
  const regiao = container.querySelector<HTMLElement>('[aria-live="assertive"]');
  if (!regiao) throw new Error("região de erro (aria-live) não encontrada");
  return regiao;
}

describe("Form — erro visível e alcançável", () => {
  let scrollIntoView: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // jsdom não implementa `scrollIntoView`. O dublê serve para os dois lados:
    // deixa o componente rodar e permite asserir COMO ele foi chamado.
    scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView as unknown as typeof Element.prototype.scrollIntoView;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("leva o foco para a região do erro quando o erro aparece", () => {
    const { container, rerender } = render(
      <Form>
        <Input name="nome" aria-label="Nome" />
        <button type="submit">Salvar</button>
      </Form>,
    );

    // Ponto de partida realista: o foco está no botão, no fim do formulário.
    const botao = screen.getByRole("button", { name: "Salvar" });
    botao.focus();
    expect(document.activeElement).toBe(botao);

    rerender(
      <Form error="CPF já cadastrado nesta clínica.">
        <Input name="nome" aria-label="Nome" />
        <button type="submit">Salvar</button>
      </Form>,
    );

    // É ISTO que a versão antiga não fazia: o foco continuava no botão.
    expect(document.activeElement).toBe(regiaoDeErro(container));
  });

  it("a região do erro é focável por código, mas fora da ordem de Tab", () => {
    const { container } = render(<Form error="Falhou">{null}</Form>);

    // `tabIndex={-1}` é o que torna o `focus()` acima possível sem inserir um
    // parágrafo de erro na navegação por Tab de todo formulário do sistema.
    expect(regiaoDeErro(container).getAttribute("tabindex")).toBe("-1");
  });

  it("rola até o erro centralizado no viewport", () => {
    const { rerender } = render(<Form>{null}</Form>);

    rerender(<Form error="Falhou">{null}</Form>);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    // `center` e não `start`: alinhar no topo esconde a mensagem atrás de
    // header fixo.
    expect(scrollIntoView.mock.calls[0]?.[0]).toMatchObject({ block: "center" });
  });

  it("respeita prefers-reduced-motion: reduce (salto instantâneo)", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }));

    const { rerender } = render(<Form>{null}</Form>);
    rerender(<Form error="Falhou">{null}</Form>);

    // Rolagem animada é gatilho vestibular (WCAG 2.3.3). Quem pediu menos
    // movimento recebe `auto`.
    expect(scrollIntoView.mock.calls[0]?.[0]).toMatchObject({ behavior: "auto" });
  });

  it("anima a rolagem quando não há preferência por menos movimento", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }));

    const { rerender } = render(<Form>{null}</Form>);
    rerender(<Form error="Falhou">{null}</Form>);

    expect(scrollIntoView.mock.calls[0]?.[0]).toMatchObject({
      behavior: "smooth",
    });
  });

  it("a live region existe ANTES do erro, senão o leitor de tela não anuncia", () => {
    const { container } = render(<Form>{null}</Form>);

    // Live region criada junto com o conteúdo não é anunciada: o leitor precisa
    // já estar observando o nó. Por isso ela é renderizada sempre.
    const regiao = regiaoDeErro(container);
    expect(regiao.textContent).toBe("");
    // Vazia, fica fora do fluxo (`sr-only` é `position:absolute`) — sem
    // espaçamento fantasma no topo do formulário.
    expect(regiao.className).toContain("sr-only");
  });

  it("não rouba o foco em re-render que não traz erro novo", () => {
    // Regressão que o fix poderia introduzir: se o efeito disparasse a cada
    // render, digitar num campo controlado jogaria o foco de volta ao topo e o
    // formulário ficaria impossível de preencher.
    const { container, rerender } = render(<Form error="Falhou">{null}</Form>);
    expect(document.activeElement).toBe(regiaoDeErro(container));

    const outro = document.createElement("button");
    document.body.appendChild(outro);
    outro.focus();

    rerender(
      <Form error="Falhou">
        <span>conteúdo novo</span>
      </Form>,
    );

    expect(document.activeElement).toBe(outro);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    outro.remove();
  });

  it("sem erro não há foco roubado nem rolagem", () => {
    render(<Form>{null}</Form>);

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("continua exibindo a mensagem no Alert do design system", () => {
    render(<Form error="CPF já cadastrado nesta clínica.">{null}</Form>);

    const alerta = screen.getByRole("alert");
    expect(alerta.textContent).toContain("Não foi possível continuar");
    expect(alerta.textContent).toContain("CPF já cadastrado nesta clínica.");
  });
});
