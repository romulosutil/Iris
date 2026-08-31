import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { AudioLocal } from "./audio-local";

// T16 (#72) — régua de mutação: "iniciar gravação" (tasks.md linha 318). A
// produção não tem ainda a UI multi-clipe de T11/T12 (teto de 2 min, lista de
// clipes, polling, parágrafo transcrito) — este componente ainda é a versão
// de 1 clipe só (D1, pré-#72). Este teste cobre o que EXISTE: clicar em
// "Gravar áudio" chama `getUserMedia`. Remover essa chamada em produção tem
// que derrubar exatamente este teste.

vi.mock("./actions", () => ({
  registrarAudioLocalAction: vi.fn(),
}));

vi.mock("@/lib/audio/local-store", () => ({
  salvarAudioLocal: vi.fn().mockResolvedValue(undefined),
  apagarAudioLocal: vi.fn().mockResolvedValue(undefined),
}));

describe("AudioLocal — iniciar gravação", () => {
  let getUserMediaMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getUserMediaMock = vi.fn().mockResolvedValue({
      getTracks: () => [],
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: getUserMediaMock },
    });
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = vi
      .fn()
      .mockImplementation(() => ({
        start: vi.fn(),
        stop: vi.fn(),
        ondataavailable: null,
        onstop: null,
      }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clicar em 'Gravar áudio' chama getUserMedia com áudio habilitado", async () => {
    render(<AudioLocal sessionId="sess-1" aoConfirmar={() => {}} />);

    await userEvent.click(
      screen.getByRole("button", { name: /gravar áudio/i }),
    );

    await waitFor(() => expect(getUserMediaMock).toHaveBeenCalledTimes(1));
    expect(getUserMediaMock).toHaveBeenCalledWith({ audio: true });
  });

  it("falha ao acessar o microfone mostra erro sem quebrar a página", async () => {
    getUserMediaMock.mockRejectedValueOnce(new Error("permissão negada"));
    render(<AudioLocal sessionId="sess-1" aoConfirmar={() => {}} />);

    await userEvent.click(
      screen.getByRole("button", { name: /gravar áudio/i }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(/não foi possível acessar o microfone/i),
      ).not.toBeNull(),
    );
  });
});
