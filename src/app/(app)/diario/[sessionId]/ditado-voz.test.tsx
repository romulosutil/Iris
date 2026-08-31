import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DitadoVoz } from "./ditado-voz";

// #72 T11/T12 — a régua aqui é comportamento, não render. Cada teste nomeia a
// mutação que ele mata; o repo NÃO tem jest-dom, então as assertivas são
// nativas sobre o DOM cru (`toBeNull`, `textContent`), nunca `toBeInTheDocument`.

const enviarLoteAsrAction = vi.fn();
const obterEstadoLoteAction = vi.fn();
const obterLoteMaisRecenteAction = vi.fn();
const aceitarTranscricaoLoteAction = vi.fn();

vi.mock("./actions", () => ({
  enviarLoteAsrAction: (...a: unknown[]) => enviarLoteAsrAction(...a),
  obterEstadoLoteAction: (...a: unknown[]) => obterEstadoLoteAction(...a),
  obterLoteMaisRecenteAction: (...a: unknown[]) =>
    obterLoteMaisRecenteAction(...a),
  aceitarTranscricaoLoteAction: (...a: unknown[]) =>
    aceitarTranscricaoLoteAction(...a),
}));

const salvarAudioLocal = vi.fn().mockResolvedValue(undefined);
const apagarAudioLocal = vi.fn().mockResolvedValue(undefined);
const purgarLote = vi.fn().mockResolvedValue(undefined);
const lerAudioLocal = vi.fn().mockResolvedValue(null);

vi.mock("@/lib/audio/local-store", () => ({
  salvarAudioLocal: (...a: unknown[]) => salvarAudioLocal(...a),
  apagarAudioLocal: (...a: unknown[]) => apagarAudioLocal(...a),
  purgarLote: (...a: unknown[]) => purgarLote(...a),
  lerAudioLocal: (...a: unknown[]) => lerAudioLocal(...a),
  chaveClipe: (loteId: string, ordem: number) => `${loteId}:${ordem}`,
  escolherCodec: () => "audio/webm;codecs=opus",
}));

type RecorderFake = {
  start: () => void;
  stop: () => void;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  mimeType: string;
};

let recorders: RecorderFake[] = [];

function instalarMediaRecorder() {
  recorders = [];
  // `function`, nunca arrow: `new X()` sobre uma arrow estoura "is not a
  // constructor" e a exceção cairia no catch do gravador, deixando o teste
  // verde pelo caminho errado (memória `duble-arrow-nao-e-construtor`).
  (globalThis as { MediaRecorder?: unknown }).MediaRecorder = vi
    .fn()
    .mockImplementation(function criarRecorderFake() {
      const r: RecorderFake = {
        mimeType: "audio/webm;codecs=opus",
        ondataavailable: null,
        onstop: null,
        start() {
          // um chunk imediato: o blob precisa ter tamanho para ser gravado
          queueMicrotask(() =>
            r.ondataavailable?.({
              data: new Blob(["a"], { type: "audio/webm" }),
            }),
          );
        },
        stop() {
          r.onstop?.();
        },
      };
      recorders.push(r);
      return r;
    });
}

/** Grava um clipe do começo ao fim: clica em gravar, espera o recorder, para. */
async function gravarClipe(user: ReturnType<typeof userEvent.setup>) {
  const antes = recorders.length;
  await user.click(
    screen.getByRole("button", { name: /gravar (clipe|mais um clipe)/i }),
  );
  await waitFor(() => expect(recorders.length).toBe(antes + 1));
  await user.click(screen.getByRole("button", { name: /parar clipe/i }));
  await waitFor(() =>
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(antes),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  obterLoteMaisRecenteAction.mockResolvedValue({ loteId: null });
  obterEstadoLoteAction.mockResolvedValue({ clipes: [] });
  enviarLoteAsrAction.mockResolvedValue({ loteId: "lote-1" });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) },
  });
  globalThis.URL.createObjectURL = vi.fn(() => "blob:fake");
  globalThis.URL.revokeObjectURL = vi.fn();
  instalarMediaRecorder();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("DitadoVoz — montagem do lote (T11)", () => {
  it("o clipe encerra sozinho no teto de 2 minutos, sem clique em parar", async () => {
    // Mutação que este teste mata: remover o `setTimeout(tetoMs)` de
    // `usarGravador`, ou afrouxar TETO_CLIPE_MS. Sem o teto, nenhum item
    // aparece na lista porque ninguém chamou `stop()`.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DitadoVoz sessionId="sess-1" aoAceitar={() => {}} />);

    await user.click(screen.getByRole("button", { name: /gravar clipe/i }));
    await waitFor(() => expect(recorders.length).toBe(1));
    expect(screen.queryAllByRole("listitem").length).toBe(0);

    await vi.advanceTimersByTimeAsync(120_000);

    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBe(1));
  });

  it("nenhum clipe sobe ao terminar de gravar — só o clique explícito envia", async () => {
    const user = userEvent.setup();
    render(<DitadoVoz sessionId="sess-1" aoAceitar={() => {}} />);

    await gravarClipe(user);
    await gravarClipe(user);

    expect(enviarLoteAsrAction).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: /enviar pra iris analisar/i }),
    );
    await waitFor(() => expect(enviarLoteAsrAction).toHaveBeenCalledTimes(1));
  });

  it("a ordem enviada é a ordem da lista", async () => {
    const user = userEvent.setup();
    render(<DitadoVoz sessionId="sess-1" aoAceitar={() => {}} />);

    await gravarClipe(user);
    await gravarClipe(user);
    await gravarClipe(user);
    await user.click(
      screen.getByRole("button", { name: /enviar pra iris analisar/i }),
    );

    await waitFor(() => expect(enviarLoteAsrAction).toHaveBeenCalledTimes(1));
    const [arg] = enviarLoteAsrAction.mock.calls[0] as [
      { clipes: Array<{ ordem: number }> },
    ];
    expect(arg.clipes.map((c) => c.ordem)).toEqual([1, 2, 3]);
  });

  it("clique duplo em Enviar dispara uma única chamada (R24)", async () => {
    // Mutação que este teste mata: tirar o `disabled`/`fase === "enviando"` do
    // botão — o lote inteiro, não um clipe.
    const user = userEvent.setup();
    let liberar: (v: { loteId: string }) => void = () => {};
    enviarLoteAsrAction.mockImplementation(
      () => new Promise((r) => (liberar = r)),
    );
    render(<DitadoVoz sessionId="sess-1" aoAceitar={() => {}} />);

    await gravarClipe(user);
    const botao = screen.getByRole("button", {
      name: /enviar pra iris analisar/i,
    });
    await user.click(botao);
    await user.click(botao);

    expect(enviarLoteAsrAction).toHaveBeenCalledTimes(1);
    liberar({ loteId: "lote-1" });
  });

  it("descartar remove o item da lista e apaga o blob do IndexedDB", async () => {
    const user = userEvent.setup();
    render(<DitadoVoz sessionId="sess-1" aoAceitar={() => {}} />);

    await gravarClipe(user);
    await gravarClipe(user);
    expect(screen.getAllByRole("listitem").length).toBe(2);

    const [primeiro] = screen.getAllByRole("listitem") as [HTMLElement];
    await user.click(
      within(primeiro).getByRole("button", { name: /descartar/i }),
    );

    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBe(1));
    expect(apagarAudioLocal).toHaveBeenCalled();
  });

  it("descartar o primeiro de 3 renumera e AINDA envia os dois blobs restantes", async () => {
    // Mutação que este teste mata: renumerar os blobs dentro do updater de
    // `setClipes`. A lista na tela fica certa e o mapa de blobs esvazia — o
    // lote sairia com 0 clipes e a tela não denunciaria nada.
    const user = userEvent.setup();
    render(<DitadoVoz sessionId="sess-1" aoAceitar={() => {}} />);

    await gravarClipe(user);
    await gravarClipe(user);
    await gravarClipe(user);

    const [primeiro] = screen.getAllByRole("listitem") as [HTMLElement];
    await user.click(
      within(primeiro).getByRole("button", { name: /descartar/i }),
    );
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBe(2));

    await user.click(
      screen.getByRole("button", { name: /enviar pra iris analisar/i }),
    );
    await waitFor(() => expect(enviarLoteAsrAction).toHaveBeenCalledTimes(1));
    const [arg] = enviarLoteAsrAction.mock.calls[0] as [
      { clipes: Array<{ ordem: number }> },
    ];
    expect(arg.clipes.map((c) => c.ordem)).toEqual([1, 2]);
  });

  it("clipe já enviado perde descartar e regravar (R27)", async () => {
    // Mutação que este teste mata: renderizar as ações de edição sem checar a
    // fase do lote.
    const user = userEvent.setup();
    render(<DitadoVoz sessionId="sess-1" aoAceitar={() => {}} />);

    await gravarClipe(user);
    expect(screen.queryByRole("button", { name: /descartar/i })).not.toBeNull();

    await user.click(
      screen.getByRole("button", { name: /enviar pra iris analisar/i }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /descartar/i })).toBeNull(),
    );
    expect(screen.queryByRole("button", { name: /regravar/i })).toBeNull();
  });
});

describe("DitadoVoz — resultado no editor (T12)", () => {
  async function enviarEChegarNoResultado(
    user: ReturnType<typeof userEvent.setup>,
  ) {
    await gravarClipe(user);
    await user.click(
      screen.getByRole("button", { name: /enviar pra iris analisar/i }),
    );
  }

  it("lote com 1 falha entre 3: 2 parágrafos com texto e 1 marcado como não transcrito", async () => {
    const user = userEvent.setup();
    obterEstadoLoteAction.mockResolvedValue({
      clipes: [
        {
          ordem: 1,
          asrStatus: "transcrito",
          transcricaoTexto: "Primeiro trecho.",
        },
        { ordem: 2, asrStatus: "falhou", transcricaoTexto: null },
        {
          ordem: 3,
          asrStatus: "transcrito",
          transcricaoTexto: "Terceiro trecho.",
        },
      ],
    });
    render(<DitadoVoz sessionId="sess-1" aoAceitar={() => {}} />);
    await enviarEChegarNoResultado(user);

    await waitFor(() =>
      expect(screen.queryByText("Primeiro trecho.")).not.toBeNull(),
    );
    expect(screen.queryByText("Terceiro trecho.")).not.toBeNull();
    expect(screen.getAllByText(/não transcrito/i).length).toBe(1);
  });

  it("o marcador de IA é texto visível, não só rótulo de leitor de tela (R17)", async () => {
    const user = userEvent.setup();
    obterEstadoLoteAction.mockResolvedValue({
      clipes: [
        { ordem: 1, asrStatus: "transcrito", transcricaoTexto: "Trecho." },
      ],
    });
    render(<DitadoVoz sessionId="sess-1" aoAceitar={() => {}} />);
    await enviarEChegarNoResultado(user);

    const selo = await screen.findByText(/transcrito pela ia/i);
    expect(selo).not.toBeNull();
    // um `aria-label` sozinho não satisfaz R17: tem que haver texto no nó.
    expect(selo.textContent?.trim().length).toBeGreaterThan(0);
  });

  it("nada entra no diário sem o clique em 'Usar no diário' (R18)", async () => {
    const user = userEvent.setup();
    const aoAceitar = vi.fn();
    obterEstadoLoteAction.mockResolvedValue({
      clipes: [
        { ordem: 1, asrStatus: "transcrito", transcricaoTexto: "Trecho um." },
        { ordem: 2, asrStatus: "transcrito", transcricaoTexto: "Trecho dois." },
      ],
    });
    aceitarTranscricaoLoteAction.mockResolvedValue({
      paragrafos: ["Trecho um.", "Trecho dois."],
    });
    render(<DitadoVoz sessionId="sess-1" aoAceitar={aoAceitar} />);
    await enviarEChegarNoResultado(user);

    await screen.findByRole("button", { name: /usar no diário/i });
    expect(aoAceitar).not.toHaveBeenCalled();
    expect(aceitarTranscricaoLoteAction).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /usar no diário/i }));

    await waitFor(() =>
      expect(aoAceitar).toHaveBeenCalledWith(["Trecho um.", "Trecho dois."]),
    );
    // R19/T25 — aceitar é o gesto que apaga a transcrição do servidor.
    expect(aceitarTranscricaoLoteAction).toHaveBeenCalledWith("lote-1");
  });

  it("erro de leitura do polling renderiza erro, não lista vazia", async () => {
    // Mutação que este teste mata: `catch { setEstados([]) }` — transformar
    // falha de rede em afirmação clínica de que nada foi transcrito.
    const user = userEvent.setup();
    obterEstadoLoteAction.mockResolvedValue({
      error: "Não foi possível consultar o estado da transcrição.",
    });
    render(<DitadoVoz sessionId="sess-1" aoAceitar={() => {}} />);
    await enviarEChegarNoResultado(user);

    await waitFor(() =>
      expect(
        screen.queryByText(/não foi possível consultar o estado/i),
      ).not.toBeNull(),
    );
    expect(
      screen.queryByRole("button", { name: /usar no diário/i }),
    ).toBeNull();
  });
});

describe("DitadoVoz — acessibilidade", () => {
  it("não tem violação de WCAG 2.1 AA em nenhuma das duas telas do fluxo", async () => {
    // Duas telas porque a segunda (rascunho da IA) tem estrutura própria — selo,
    // lista de parágrafos e dois botões — que a primeira não exercita. Contraste
    // fica de fora: jsdom não renderiza cor (mesma exclusão de `a11y.test.tsx`).
    const regras = {
      runOnly: {
        type: "tag" as const,
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
      rules: {
        region: { enabled: false },
        "landmark-one-main": { enabled: false },
        "page-has-heading-one": { enabled: false },
        "color-contrast": { enabled: false },
      },
    };

    const user = userEvent.setup();
    obterEstadoLoteAction.mockResolvedValue({
      clipes: [
        { ordem: 1, asrStatus: "transcrito", transcricaoTexto: "Trecho um." },
        { ordem: 2, asrStatus: "falhou", transcricaoTexto: null },
      ],
    });
    const { container } = render(
      <DitadoVoz sessionId="sess-1" aoAceitar={() => {}} />,
    );

    await gravarClipe(user);
    expect((await axe.run(container, regras)).violations).toEqual([]);

    await user.click(
      screen.getByRole("button", { name: /enviar pra iris analisar/i }),
    );
    await screen.findByRole("button", { name: /usar no diário/i });
    expect((await axe.run(container, regras)).violations).toEqual([]);
  });
});
