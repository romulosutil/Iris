import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ItemFila } from "./queries";

// #533 (`PR-01`) — `/validacao` volta a MONTAR a fila por evidência. Este
// teste é a régua por papel: coordenador vê a fila; terapeuta e
// `admin_recepcao` são redirecionados ANTES de qualquer leitura de banco.

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect }));

const getTenantContext = vi.fn();
vi.mock("@/auth/tenant", () => ({ getTenantContext }));

const listarFilaValidacao = vi.fn();
vi.mock("./queries", () => ({ listarFilaValidacao }));

// `withTenant` só entrega uma "tx" para `alvosValidosDoPaciente`; aqui nada
// toca o banco — a lista de alvos vem vazia (o picker de reclassificação fica
// sem opções, o que não muda o que a página decide mostrar).
vi.mock("@/db/rls", () => ({
  withTenant: vi.fn(async (_ctx: unknown, fn: (tx: unknown) => unknown) =>
    fn({}),
  ),
}));
vi.mock("./alvos", () => ({ alvosValidosDoPaciente: vi.fn(async () => []) }));

// `ValidacaoFila` importa as server actions ("use server" → getTenantContext →
// @/db/client). No jsdom só renderizamos.
vi.mock("./actions", () => ({
  confirmarEvidenciaAction: vi.fn(async () => ({})),
  invalidarEvidenciaAction: vi.fn(async () => ({})),
  devolverComDuvidaAction: vi.fn(async () => ({})),
  reclassificarEvidenciaAction: vi.fn(async () => ({})),
  aprovarLoteAction: vi.fn(async () => ({})),
}));

const { default: ValidacaoPage } = await import("./page");

const CTX_BASE = {
  userId: "00000000-0000-0000-0000-0000000000f1",
  clinicId: "00000000-0000-0000-0000-0000000000c1",
};

function item(parcial: Partial<ItemFila> & { evidenceId: string }): ItemFila {
  return {
    patientId: "00000000-0000-0000-0000-0000000000a1",
    patientNome: "Paciente A",
    sessionId: "00000000-0000-0000-0000-0000000000e1",
    sessionNumero: 3,
    trecho: "Pediu água sozinho.",
    classificacaoAtual: { dominio_id: "mando" },
    motivo: ["baixa_confianca"],
    protocolId: null,
    confianca: "baixa",
    inconsistenteComHistorico: false,
    nivelFriccao: "alto",
    podeLote: false,
    historicoAnterior: null,
    ...parcial,
  };
}

const ITEM_S1 = item({
  evidenceId: "00000000-0000-0000-0000-000000000001",
  patientNome: "Paciente da Sessão Um",
  sessionId: "00000000-0000-0000-0000-0000000000e1",
});
const ITEM_S2 = item({
  evidenceId: "00000000-0000-0000-0000-000000000002",
  patientId: "00000000-0000-0000-0000-0000000000a2",
  patientNome: "Paciente da Sessão Dois",
  sessionId: "00000000-0000-0000-0000-0000000000e2",
});

async function renderizar(
  searchParams: Record<string, string | undefined> = {},
) {
  const ui = await ValidacaoPage({
    searchParams: Promise.resolve(searchParams),
  });
  return render(ui);
}

beforeEach(() => {
  redirect.mockClear();
  listarFilaValidacao.mockReset();
  listarFilaValidacao.mockResolvedValue({
    itens: [ITEM_S1, ITEM_S2],
    total: 2,
  });
});
afterEach(cleanup);

describe("ValidacaoPage — guard por papel (#533 · PR-01)", () => {
  test("terapeuta é redirecionado para /sessoes sem ler a fila", async () => {
    getTenantContext.mockResolvedValue({ ...CTX_BASE, role: "terapeuta" });
    await expect(
      ValidacaoPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_REDIRECT:/sessoes");
    expect(redirect).toHaveBeenCalledWith("/sessoes");
    expect(listarFilaValidacao).not.toHaveBeenCalled();
  });

  test("admin_recepcao é redirecionada para /agenda sem ler a fila", async () => {
    getTenantContext.mockResolvedValue({
      ...CTX_BASE,
      role: "admin_recepcao",
    });
    await expect(
      ValidacaoPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_REDIRECT:/agenda");
    expect(listarFilaValidacao).not.toHaveBeenCalled();
  });

  test("coordenador vê a fila por evidência montada (ValidacaoFila), não um redirect", async () => {
    getTenantContext.mockResolvedValue({ ...CTX_BASE, role: "coordenador" });
    await renderizar();

    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Validação" })).toBeDefined();
    // Os dois itens da fila estão no DOM, com o gesto de confirmar de cada um.
    expect(screen.getByText("Paciente da Sessão Um")).toBeDefined();
    expect(screen.getByText("Paciente da Sessão Dois")).toBeDefined();
    expect(
      screen.getAllByRole("button", { name: "Aprovar Evidência" }),
    ).toHaveLength(2);
  });
});

describe("ValidacaoPage — recorte por ?sessao= (#533 · link de /sessoes/[id])", () => {
  beforeEach(() => {
    getTenantContext.mockResolvedValue({ ...CTX_BASE, role: "coordenador" });
  });

  test("com ?sessao=<id> mostra só os itens daquela sessão e o caminho de volta à fila inteira", async () => {
    await renderizar({ sessao: ITEM_S1.sessionId });

    expect(screen.getByText("Paciente da Sessão Um")).toBeDefined();
    expect(screen.queryByText("Paciente da Sessão Dois")).toBeNull();
    const voltar = screen.getByRole("link", {
      name: "Ver a fila inteira (2)",
    });
    expect(voltar.getAttribute("href")).toBe("/validacao");
  });

  test("com ?sessao= de sessão sem item pendente, diz isso por extenso e mostra a fila inteira (nunca um 'Tudo em dia' falso)", async () => {
    await renderizar({ sessao: "00000000-0000-0000-0000-0000000000ff" });

    expect(
      screen.getByText(/Esta sessão não tem item pendente na fila/),
    ).toBeDefined();
    expect(screen.getByText("Paciente da Sessão Um")).toBeDefined();
    expect(screen.getByText("Paciente da Sessão Dois")).toBeDefined();
    expect(screen.queryByText(/Tudo em dia/)).toBeNull();
  });

  test("sem ?sessao= a fila inteira aparece sem o aviso de recorte", async () => {
    await renderizar();
    expect(screen.queryByText(/Mostrando só/)).toBeNull();
    expect(screen.queryByText(/não tem item pendente/)).toBeNull();
  });
});
