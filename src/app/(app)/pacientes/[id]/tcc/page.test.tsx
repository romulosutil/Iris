import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #387 — `tcc/page.tsx` não tinha guard nenhum de modalidade: respondia por
 * URL direta a paciente `protocol_driven`/`conventional` sem checar nada.
 * Mesmo padrão de mock de `../layout.test.tsx` (mocka `@/db/rls` +
 * `@/db/schema` + `drizzle-orm`, sem tocar Postgres) — aqui o que importa é
 * que `notFound()` seja chamado quando a modalidade não é `cognitive_behavioral`,
 * não o layout resultante.
 */

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/auth/tenant", () => ({
  getTenantContext: vi.fn().mockResolvedValue({
    clinicId: "clinic_1",
    userId: "user_1",
    role: "terapeuta",
  }),
}));

const mockWithTenant = vi.fn();
vi.mock("@/db/rls", () => ({
  withTenant: (...args: unknown[]) => mockWithTenant(...args),
}));

vi.mock("@/db/schema", () => ({
  patient: { id: "id", clinicalModality: "clinicalModality" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("./logic", () => ({
  obterRPDEntries: vi.fn().mockResolvedValue([]),
}));

// #392 — fila de sugestões de RPD do agente: mockada como vazia, sem tocar
// `sugestoes.ts` (RLS/postgres real) neste teste de guard de modalidade.
vi.mock("./sugestoes", () => ({
  obterRPDSugestoes: vi.fn().mockResolvedValue([]),
}));

vi.mock("./rpd-form", () => ({ RpdForm: () => null }));
vi.mock("./rpd-sugestoes", () => ({ RpdSugestoes: () => null }));

// #393 — instrumentos padronizados (PHQ-9/GAD-7): mockados como vazios, sem
// tocar `instrumento-logic.ts` (RLS/postgres real) neste teste de guard de
// modalidade — mesmo racional de #392 acima para `./sugestoes`.
vi.mock("./instrumento-logic", () => ({
  obterInstrumentoAplicacoes: vi.fn().mockResolvedValue([]),
  obterInstrumentoItensTexto: vi.fn().mockResolvedValue([]),
}));
vi.mock("./instrumento-lista", () => ({ InstrumentoLista: () => null }));
vi.mock("./instrumento-form", () => ({ InstrumentoForm: () => null }));

function mockModalidade(clinicalModality: string | undefined) {
  mockWithTenant.mockImplementation(async (_ctx, fn) => {
    const mockTx = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi
        .fn()
        .mockResolvedValue(
          clinicalModality === undefined ? [] : [{ clinicalModality }],
        ),
    };
    return fn(mockTx);
  });
}

describe("TccPage — guard de modalidade (#387)", () => {
  // `notFound` e `withTenant` são mocks de módulo (persistem entre `it`s do
  // mesmo arquivo, o import de "./page" é cacheado) — limpar as CHAMADAS a
  // cada teste, sem tocar a implementação, é o que deixa
  // `not.toHaveBeenCalled()` do último teste confiável.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("chama notFound() para paciente protocol_driven acessando /tcc por URL direta", async () => {
    mockModalidade("protocol_driven");
    const { default: TccPage } = await import("./page");

    await expect(
      TccPage({ params: Promise.resolve({ id: "pac_1" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("chama notFound() para paciente conventional acessando /tcc por URL direta", async () => {
    mockModalidade("conventional");
    const { default: TccPage } = await import("./page");

    await expect(
      TccPage({ params: Promise.resolve({ id: "pac_2" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("chama notFound() quando o paciente não é visto pela RLS (id inexistente/outra clínica)", async () => {
    mockModalidade(undefined);
    const { default: TccPage } = await import("./page");

    await expect(
      TccPage({ params: Promise.resolve({ id: "pac_ghost" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renderiza a página para paciente cognitive_behavioral, sem chamar notFound()", async () => {
    const { notFound } = await import("next/navigation");
    mockModalidade("cognitive_behavioral");
    const { default: TccPage } = await import("./page");

    const result = await TccPage({
      params: Promise.resolve({ id: "pac_3" }),
    });

    expect(notFound).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });
});
