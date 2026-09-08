import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * #283 — visão padrão da agenda por largura de tela.
 *
 * O R-30 (#512 T12) já trocava a GRADE por lista cronológica abaixo de `md`,
 * mas só por dentro do `CalendarGrid`: o seletor continuava marcando "Matriz
 * Geral" enquanto a tela mostrava uma lista. Decisão do Rômolo (08/09/2026):
 * em tela estreita o default do coordenador passa a ser "Por Horário" — a
 * visão que a largura de fato renderiza.
 *
 * Mesma neutralização de `a11y.test.tsx`/`escala-toggle.test.tsx`: a cadeia
 * `./actions` ("use server") → `@/db/client` abre conexão no load.
 */
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const { AgendaViewCliente } = await import("./agenda-view-cliente");

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  cleanup();
});

// 3 terapeutas: o cenário do QA que abriu a #283.
const terapeutas = [
  { id: "t1", nome: "Dra. Sofia" },
  { id: "t2", nome: "Dr. Caio" },
  { id: "t3", nome: "Dra. Denise" },
];

const sessoes = terapeutas.map((t, i) => ({
  id: `0000000${i}-0000-0000-0000-000000000000`,
  agendadaPara: new Date(`2026-09-01T1${i}:00:00-03:00`),
  estado: "agendada" as const,
  terapeutaId: t.id,
  terapeutaNome: t.nome,
  pacienteNome: `Paciente ${i}`,
  patientId: `p${i}`,
  disciplina: "psicologia",
  checkInEm: null,
}));

function montar(props: { visaoInicial?: string } = {}) {
  return render(
    <AgendaViewCliente
      sessoes={sessoes}
      terapeutas={terapeutas}
      role="coordenador"
      userId="u1"
      podeGerir
      diaExtenso="terça, 1 de setembro"
      diaISO="2026-09-01"
      fuso="America/Sao_Paulo"
      {...props}
    />,
  );
}

/** O botão do seletor de visão marcado como ativo (`aria-pressed`). */
function visaoAtiva(): string {
  const ativo = screen
    .getAllByRole("button")
    .find(
      (b) =>
        b.getAttribute("aria-pressed") === "true" &&
        /Matriz|Terapeuta|Horário/.test(b.textContent ?? ""),
    );
  return ativo?.textContent ?? "";
}

test("mobile sem ?visao=: coordenador cai em 'Por Horário', não em 'Matriz'", () => {
  stubMatchMedia(true);
  montar();

  expect(visaoAtiva()).toContain("Por Horário");
  // A lista cronológica é a da própria visão "horario" (uma <li> por sessão),
  // não a lista de fallback do `CalendarGrid`.
  expect(screen.queryByTestId("calendar-day-grid")).toBeNull();
  expect(screen.queryByTestId("calendar-day-list")).toBeNull();
  expect(screen.getAllByRole("listitem")).toHaveLength(sessoes.length);
});

test("desktop sem ?visao=: coordenador continua em 'Matriz Geral'", () => {
  stubMatchMedia(false);
  montar();

  expect(visaoAtiva()).toContain("Matriz Geral");
  expect(screen.getByTestId("calendar-day-grid")).toBeTruthy();
});

test("mobile com ?visao=matriz: escolha explícita vence o default", () => {
  stubMatchMedia(true);
  montar({ visaoInicial: "matriz" });

  expect(visaoAtiva()).toContain("Matriz Geral");
  // Escolheu Matriz no celular: o R-30 entrega a lista do `CalendarGrid` no
  // lugar da grade — a rede continua armada.
  expect(screen.getByTestId("calendar-day-list")).toBeTruthy();
  expect(screen.queryByTestId("calendar-day-grid")).toBeNull();
});

test("mobile: escolher Matriz no toggle sobrescreve o default e persiste na URL", async () => {
  stubMatchMedia(true);
  const usuario = userEvent.setup();
  montar();

  await usuario.click(screen.getByRole("button", { name: /Matriz Geral/ }));

  expect(visaoAtiva()).toContain("Matriz Geral");
  expect(replace).toHaveBeenCalledWith(
    "/agenda?visao=matriz&dia=2026-09-01",
    expect.objectContaining({ scroll: false }),
  );
});

test("terapeuta: o default por papel não muda com a largura", () => {
  stubMatchMedia(true);
  render(
    <AgendaViewCliente
      sessoes={sessoes}
      terapeutas={terapeutas}
      role="terapeuta"
      userId="t1"
      podeGerir={false}
      diaExtenso="terça, 1 de setembro"
      diaISO="2026-09-01"
      fuso="America/Sao_Paulo"
    />,
  );

  expect(visaoAtiva()).toContain("Por Terapeuta");
});
