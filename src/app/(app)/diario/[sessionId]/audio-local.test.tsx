import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { AudioLocal } from "./audio-local";
import * as actions from "./actions";
import * as localStore from "@/lib/audio/local-store";

vi.mock("./actions", () => ({
  enviarLoteAsrAction: vi.fn(function () {
    return Promise.resolve({ loteId: "lote-123" });
  }),
  obterEstadoLoteAction: vi.fn(function () {
    return Promise.resolve({ clipes: [] });
  }),
  obterLoteMaisRecenteAction: vi.fn(function () {
    return Promise.resolve({ loteId: null });
  }),
  limparTranscricaoLoteAction: vi.fn(function () {
    return Promise.resolve({ ok: true });
  }),
}));

vi.mock("@/lib/audio/local-store", () => ({
  salvarAudioLocal: vi.fn(function () {
    return Promise.resolve();
  }),
  apagarAudioLocal: vi.fn(function () {
    return Promise.resolve();
  }),
  purgarLote: vi.fn(function () {
    return Promise.resolve();
  }),
  escolherCodec: vi.fn(function () {
    return "audio/webm";
  }),
}));

describe("AudioLocal — UI multi-clipe (T11)", () => {
  let getUserMediaMock: ReturnType<typeof vi.fn>;
  let mockRecorder: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    ondataavailable: ((e: { data: Blob }) => void) | null;
    onstop: (() => void) | null;
    mimeType: string;
    state: string;
  };

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    mockRecorder = {
      start: vi.fn(function (this: typeof mockRecorder) {
        this.state = "recording";
      }),
      stop: vi.fn(function (this: typeof mockRecorder) {
        this.state = "inactive";
        if (this.onstop) this.onstop();
      }),
      ondataavailable: null,
      onstop: null,
      mimeType: "audio/webm",
      state: "inactive",
    };

    getUserMediaMock = vi.fn(function () {
      return Promise.resolve({
        getTracks: () => [{ stop: vi.fn() }],
      });
    });

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: getUserMediaMock },
    });

    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = vi
      .fn()
      .mockImplementation(function () {
        return mockRecorder;
      });

    if (typeof URL.createObjectURL !== "function") {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: vi.fn(function () {
          return "blob:http://localhost/test-audio";
        }),
      });
    }
    if (typeof URL.revokeObjectURL !== "function") {
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: vi.fn(),
      });
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("clicar em 'Gravar áudio' chama getUserMedia com áudio habilitado", async () => {
    render(<AudioLocal sessionId="sess-1" />);

    await userEvent.click(
      screen.getByRole("button", { name: /gravar áudio/i }),
    );

    await waitFor(() => expect(getUserMediaMock).toHaveBeenCalledTimes(1));
    expect(getUserMediaMock).toHaveBeenCalledWith({ audio: true });
  });

  it("gravação encerra automaticamente ao atingir o teto de 2 minutos (120s)", async () => {
    render(<AudioLocal sessionId="sess-1" />);

    await userEvent.click(
      screen.getByRole("button", { name: /gravar áudio/i }),
    );

    await waitFor(() => expect(mockRecorder.start).toHaveBeenCalled());

    act(() => {
      vi.advanceTimersByTime(120_000);
    });

    await waitFor(() => expect(mockRecorder.stop).toHaveBeenCalled());
  });

  it("descartar clipe remove o item da lista e apaga do IndexedDB", async () => {
    render(<AudioLocal sessionId="sess-1" />);

    await userEvent.click(
      screen.getByRole("button", { name: /gravar áudio/i }),
    );
    await waitFor(() => expect(mockRecorder.start).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("button", { name: /parar clipe/i }));

    await waitFor(() => expect(screen.getByText(/clipe 1/i)).not.toBeNull());

    await userEvent.click(screen.getByRole("button", { name: /descartar/i }));

    await waitFor(() =>
      expect(localStore.apagarAudioLocal).toHaveBeenCalledTimes(1),
    );
    expect(screen.queryByText(/clipe 1/i)).toBeNull();
  });

  it("envio do lote chama enviarLoteAsrAction e desabilita o botão no primeiro clique", async () => {
    render(<AudioLocal sessionId="sess-1" />);

    await userEvent.click(
      screen.getByRole("button", { name: /gravar áudio/i }),
    );
    await waitFor(() => expect(mockRecorder.start).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: /parar clipe/i }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /enviar pra iris analisar/i }),
      ).not.toBeNull(),
    );

    const botaoEnviar = screen.getByRole("button", {
      name: /enviar pra iris analisar/i,
    });
    await userEvent.click(botaoEnviar);

    await waitFor(() =>
      expect(actions.enviarLoteAsrAction).toHaveBeenCalledTimes(1),
    );
  });
});

describe("AudioLocal — Resultado no editor e Polling (T12)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("polling consulta o lote e renderiza resultado transcrito por IA em parágrafos", async () => {
    vi.mocked(actions.obterLoteMaisRecenteAction).mockResolvedValueOnce({
      loteId: "lote-999",
    });
    vi.mocked(actions.obterEstadoLoteAction).mockResolvedValueOnce({
      clipes: [
        {
          ordem: 0,
          asrStatus: "transcrito",
          transcricaoTexto: "Primeira frase transcrita.",
        },
        {
          ordem: 1,
          asrStatus: "transcrito",
          transcricaoTexto: "Segunda frase transcrita.",
        },
      ],
    });

    render(<AudioLocal sessionId="sess-1" />);

    await waitFor(() =>
      expect(screen.getByText(/transcrito por ia/i)).not.toBeNull(),
    );
    expect(screen.getByText(/primeira frase transcrita/i)).not.toBeNull();
    expect(screen.getByText(/segunda frase transcrita/i)).not.toBeNull();
  });

  it("clipe falho no lote exibe aviso de trecho não transcrito", async () => {
    vi.mocked(actions.obterLoteMaisRecenteAction).mockResolvedValueOnce({
      loteId: "lote-falho",
    });
    vi.mocked(actions.obterEstadoLoteAction).mockResolvedValueOnce({
      clipes: [
        {
          ordem: 0,
          asrStatus: "transcrito",
          transcricaoTexto: "Trecho OK.",
        },
        {
          ordem: 1,
          asrStatus: "falhou",
          transcricaoTexto: null,
        },
      ],
    });

    render(<AudioLocal sessionId="sess-1" />);

    await waitFor(() =>
      expect(screen.getByText(/\[trecho não transcrito\]/i)).not.toBeNull(),
    );
  });

  it("clicar em 'Inserir rascunho no diário' chama onAplicarTexto e limpa a transcrição no banco (R19)", async () => {
    vi.mocked(actions.obterLoteMaisRecenteAction).mockResolvedValueOnce({
      loteId: "lote-inserir",
    });
    vi.mocked(actions.obterEstadoLoteAction).mockResolvedValueOnce({
      clipes: [
        {
          ordem: 0,
          asrStatus: "transcrito",
          transcricaoTexto: "Texto para o diário.",
        },
      ],
    });

    const onAplicarTextoMock = vi.fn();
    render(
      <AudioLocal sessionId="sess-1" onAplicarTexto={onAplicarTextoMock} />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /inserir rascunho no diário/i }),
      ).not.toBeNull(),
    );

    await userEvent.click(
      screen.getByRole("button", { name: /inserir rascunho no diário/i }),
    );

    await waitFor(() =>
      expect(onAplicarTextoMock).toHaveBeenCalledWith("Texto para o diário."),
    );
    expect(actions.limparTranscricaoLoteAction).toHaveBeenCalledWith(
      "lote-inserir",
    );
  });
});
