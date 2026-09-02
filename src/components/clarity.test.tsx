/**
 * S-01 (#530) — o Clarity monta só no layout público, mas a navegação do
 * Next entre `(publico)` e `(auth)`/`(app)` é client-side: o script da
 * Microsoft, uma vez injetado, sobrevive à troca de rota. Desmontar o
 * componente tem de PARAR a gravação (`clarity("stop")`), senão o replay
 * segue gravando a tela clínica que vem depois do `/login`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  consentV2: vi.fn(),
  identify: vi.fn(),
}));
vi.mock("@microsoft/clarity", () => ({ default: sdk }));
vi.mock("@/auth/client", () => ({
  useSession: () => ({ data: null }),
}));

const { Clarity } = await import("./clarity");

describe("<Clarity/> — ciclo de vida da gravação", () => {
  const clarityGlobal = vi.fn();

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_CLARITY_PROJECT_ID", "proj-teste");
    (window as unknown as { clarity?: unknown }).clarity = clarityGlobal;
    clarityGlobal.mockClear();
    sdk.init.mockClear();
    sdk.consentV2.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    delete (window as unknown as { clarity?: unknown }).clarity;
  });

  it("inicializa uma vez ao montar e manda `stop` ao desmontar", () => {
    const { unmount } = render(<Clarity />);
    expect(sdk.init).toHaveBeenCalledWith("proj-teste");
    expect(sdk.consentV2).toHaveBeenCalledWith({
      ad_Storage: "denied",
      analytics_Storage: "granted",
    });
    expect(clarityGlobal).not.toHaveBeenCalledWith("stop");

    unmount();
    // Sair da rota pública = parar de gravar. É isto que impede o replay de
    // atravessar a navegação client-side até o prontuário.
    expect(clarityGlobal).toHaveBeenCalledWith("stop");
  });

  it("ao voltar para uma rota pública, retoma com `start` em vez de injetar o script de novo", () => {
    const primeira = render(<Clarity />);
    primeira.unmount();
    sdk.init.mockClear();
    clarityGlobal.mockClear();

    render(<Clarity />);
    expect(sdk.init).not.toHaveBeenCalled();
    expect(clarityGlobal).toHaveBeenCalledWith("start");
  });

  it("sem projectId não toca o SDK nem o global", () => {
    vi.stubEnv("NEXT_PUBLIC_CLARITY_PROJECT_ID", "");
    const { unmount } = render(<Clarity />);
    unmount();
    expect(sdk.init).not.toHaveBeenCalled();
    expect(clarityGlobal).not.toHaveBeenCalled();
  });
});
