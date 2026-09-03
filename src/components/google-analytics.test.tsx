/**
 * S-01 (#530) — o gtag, uma vez carregado na landing, sobrevive à navegação
 * client-side até `/login` → `/agenda` e, com "enhanced measurement" ligado
 * no painel, dispara `page_view` a cada troca de rota (com UUID de paciente
 * na URL). O desligamento oficial do Google é a flag
 * `window['ga-disable-<ID>'] = true`: desmontar o componente liga a flag;
 * montar de novo, desliga.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

// `next/script` tenta injetar no <head> fora do runtime do Next; aqui só
// importa o ciclo de vida do componente, não a tag.
vi.mock("next/script", () => ({
  default: () => null,
}));

const { GoogleAnalytics } = await import("./google-analytics");

const ID = "G-TESTE123";
const flag = () =>
  (window as unknown as Record<string, unknown>)[`ga-disable-${ID}`];

describe("<GoogleAnalytics/> — opt-out ao sair da rota pública", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_GA_ID", ID);
    delete (window as unknown as Record<string, unknown>)[`ga-disable-${ID}`];
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("habilita ao montar e DESLIGA o gtag ao desmontar", () => {
    const { unmount } = render(<GoogleAnalytics />);
    expect(flag()).toBe(false);

    unmount();
    expect(flag()).toBe(true);
  });

  it("montar de novo reabilita (volta à landing)", () => {
    render(<GoogleAnalytics />).unmount();
    expect(flag()).toBe(true);

    render(<GoogleAnalytics />);
    expect(flag()).toBe(false);
  });

  it("sem measurementId não toca a flag", () => {
    vi.stubEnv("NEXT_PUBLIC_GA_ID", "");
    render(<GoogleAnalytics />).unmount();
    expect(flag()).toBeUndefined();
  });
});
