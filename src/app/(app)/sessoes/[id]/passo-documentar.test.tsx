import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// PassoDocumentar → CapturaForm/ConsolidarForm → ./actions ("use server") →
// getTenantContext → @/db/client (abriria conexão Postgres no import). No
// jsdom só renderizamos; nenhuma action é de fato invocada.
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));

const { PassoDocumentar } = await import("./passo-documentar");

afterEach(cleanup);

const SESSION_ID = "00000000-0000-0000-0000-000000000000";

describe("PassoDocumentar — um passo, dois momentos (R-36, R-37, R-38)", () => {
  test("é UM heading 'Documentar' com dois sub-momentos, não duas seções irmãs", () => {
    render(
      <PassoDocumentar
        sessionId={SESSION_ID}
        protocolos={[]}
        protocolIdsPreSelecionados={[]}
        asrHabilitado={false}
        temCaptura={false}
        ehDono={true}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Documentar" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 3, name: "1. Capturar" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 3, name: "2. Consolidar" }),
    ).toBeTruthy();
  });

  test("R-38: sem captura, Consolidar fica desabilitado E explica o que falta", () => {
    render(
      <PassoDocumentar
        sessionId={SESSION_ID}
        protocolos={[]}
        protocolIdsPreSelecionados={[]}
        asrHabilitado={false}
        temCaptura={false}
        ehDono={true}
      />,
    );
    const botao = screen.getByRole("button", {
      name: /consolidar sessão/i,
    }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(
      screen.getByText(/ainda não há captura salva.*antes de consolidar/i),
    ).toBeTruthy();
  });

  test("R-38: com captura existente, Consolidar habilita e não mostra a explicação de bloqueio", () => {
    render(
      <PassoDocumentar
        sessionId={SESSION_ID}
        protocolos={[]}
        protocolIdsPreSelecionados={[]}
        asrHabilitado={false}
        temCaptura={true}
        ehDono={true}
      />,
    );
    const botao = screen.getByRole("button", {
      name: /consolidar sessão/i,
    }) as HTMLButtonElement;
    expect(botao.disabled).toBe(false);
    expect(
      screen.queryByText(/ainda não há captura salva.*antes de consolidar/i),
    ).toBeNull();
  });

  test("R-37: 'salvo localmente' é componente fixo (role=status), sempre montado — mesmo sem captura ainda", () => {
    render(
      <PassoDocumentar
        sessionId={SESSION_ID}
        protocolos={[]}
        protocolIdsPreSelecionados={[]}
        asrHabilitado={false}
        temCaptura={false}
        ehDono={true}
      />,
    );
    // Duas instâncias: aba texto + aba áudio, ambas sempre montadas
    // (Tabs mantém o conteúdo no DOM), nunca um toast que aparece/some.
    const status = screen.getAllByRole("status");
    expect(status.length).toBeGreaterThanOrEqual(1);
  });

  // #514 — `podeVer` (coordenação OU dono) não é `podeEscrever` (só dono). As
  // policies `session_note_insert`/`session_note_update`/`extraction_insert`
  // (0006_fase2_rls.sql) exigem
  // `app_session_terapeuta_id(session_id) = app.user_id`: um coordenador que
  // não é o terapeuta da sessão preencheria a nota inteira e só descobriria no
  // submit, via erro genérico de RLS, que não podia.
  test("#514: coordenador que não é o dono não recebe formulário de escrita nenhum", () => {
    render(
      <PassoDocumentar
        sessionId={SESSION_ID}
        protocolos={[]}
        protocolIdsPreSelecionados={[]}
        asrHabilitado={false}
        temCaptura={true}
        ehDono={false}
      />,
    );

    // Nada submetível: nem o botão de consolidar, nem o campo de captura.
    expect(
      screen.queryByRole("button", { name: /consolidar sessão/i }),
    ).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(
      screen.queryByRole("heading", { level: 3, name: "1. Capturar" }),
    ).toBeNull();
    expect(
      screen.queryByRole("heading", { level: 3, name: "2. Consolidar" }),
    ).toBeNull();

    // Continua sendo a tela "Documentar" — o passo é visível, só não é editável,
    // e a tela diz POR QUE (senão vira empty-state mudo).
    expect(
      screen.getByRole("heading", { level: 2, name: "Documentar" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/só o terapeuta desta sessão captura e consolida/i),
    ).toBeTruthy();
  });
});
