import { describe, it, expect } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import { Alert } from "./alert";

/**
 * Guardrail visual e comportamental do componente Alert (Espectro Brutal):
 *
 * 1. **Borda uniforme sólida de 2px**: todo alerta possui `border-2` e cor de
 *    borda simétrica em todos os lados correspondente à severidade.
 * 2. **Proibição de side-stripe (D54)**: o componente NUNCA embute `border-l-[4px]`,
 *    `bordaEsquerda` ou bordas atenuadas (`border-y-.../40`, `border-r-.../40`).
 * 3. **Acessibilidade e Honestidade Epistêmica**: erro anuncia `role="alert"`,
 *    outros estados anunciam `role="status"`, e o texto do leitor de tela
 *    (`sr-only`) sempre identifica a severidade.
 */

describe("Alert — Design System Espectro Brutal", () => {
  it("renderiza com borda uniforme de 2px e sem side-stripe na severidade erro", () => {
    const { container } = render(
      <Alert severidade="erro" titulo="Erro no envio">
        Falha ao enviar áudio.
      </Alert>,
    );

    const alertEl = container.firstElementChild as HTMLElement;
    expect(alertEl.className).toContain("border-2");
    expect(alertEl.className).toContain("border-[var(--status-error-border)]");

    // Guardrail estrito: nada de side-stripe
    expect(alertEl.className).not.toContain("border-l-[4px]");
    expect(alertEl.className).not.toContain("border-y-");
    expect(alertEl.className).not.toContain("border-r-");
  });

  it.each([
    ["erro", "border-[var(--status-error-border)]", "alert", "Erro"],
    ["error", "border-[var(--status-error-border)]", "alert", "Erro"],
    ["warning", "border-[var(--status-warning-border)]", "status", "Aviso"],
    ["info", "border-[var(--status-info-border)]", "status", "Informação"],
    ["sucesso", "border-[var(--status-success-border)]", "status", "Sucesso"],
    ["success", "border-[var(--status-success-border)]", "status", "Sucesso"],
  ] as const)(
    "severidade %s: aplica borda %s, role=%s e rotulo sr-only=%s",
    (severidade, expectedBorderClass, expectedRole, expectedSrText) => {
      const { container } = render(
        <Alert severidade={severidade} titulo="Título do alerta">
          Mensagem de detalhe.
        </Alert>,
      );

      const alertEl = container.firstElementChild as HTMLElement;
      expect(alertEl.getAttribute("role")).toBe(expectedRole);
      expect(alertEl.className).toContain("border-2");
      expect(alertEl.className).toContain(expectedBorderClass);
      expect(alertEl.className).not.toContain("border-l-[4px]");

      const srOnlyEl = alertEl.querySelector(".sr-only");
      expect(srOnlyEl?.textContent).toContain(expectedSrText);
    },
  );

  it("aplica estilo destacado com sombra tridimensional", () => {
    const { container } = render(
      <Alert severidade="info" destacado titulo="Empty state">
        Sem itens no momento.
      </Alert>,
    );

    const alertEl = container.firstElementChild as HTMLElement;
    expect(alertEl.className).toContain("shadow-[var(--ds-shadow)]");
    expect(alertEl.className).toContain("p-8");
    expect(alertEl.className).not.toContain("border-l-[4px]");
  });

  it("encaminha ref e props HTML nativas corretamente", () => {
    const ref = React.createRef<HTMLDivElement>();
    render(
      <Alert ref={ref} id="alerta-teste" data-testid="meu-alerta">
        Conteúdo com ref
      </Alert>,
    );

    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.id).toBe("alerta-teste");
    expect(screen.getByTestId("meu-alerta")).toBe(ref.current);
  });

  it("mescla className customizada sem perder borda uniforme", () => {
    const { container } = render(
      <Alert severidade="erro" className="custom-class my-4">
        Mensagem customizada.
      </Alert>,
    );

    const alertEl = container.firstElementChild as HTMLElement;
    expect(alertEl.className).toContain("custom-class");
    expect(alertEl.className).toContain("my-4");
    expect(alertEl.className).toContain("border-2");
    expect(alertEl.className).not.toContain("border-l-[4px]");
  });
});
