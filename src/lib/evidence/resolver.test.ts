import { describe, expect, test, vi } from "vitest";
import { type ResolverQueries, resolverAlvoParaFks } from "./resolver";

// Unidade pura do resolvedor slug→UUID (Fase 4) — sem banco, `ResolverQueries`
// é mockada para exercitar as 3 ramificações determinísticas descritas em
// docs/superpowers/specs/2026-07-13-fase-4-resolucao-slug-uuid.md §2.

const CTX = { clinicId: "clinic-1", patientId: "patient-1" };

function makeQueries(overrides: Partial<ResolverQueries> = {}): ResolverQueries {
  return {
    goalExists: vi.fn().mockResolvedValue(false),
    protocolosAtivos: vi.fn().mockResolvedValue([]),
    marcos: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("resolverAlvoParaFks", () => {
  test("goalId: aceita UUID existente no paciente (identidade)", async () => {
    const goalUuid = "11111111-1111-1111-1111-111111111111";
    const queries = makeQueries({ goalExists: vi.fn().mockResolvedValue(true) });
    const r = await resolverAlvoParaFks(queries, CTX, { goal_id: goalUuid });
    expect(r.goalId).toBe(goalUuid);
    expect(r.goalRef).toBe(goalUuid); // ref cru sempre preservado
    expect(queries.goalExists).toHaveBeenCalledWith(CTX.patientId, goalUuid);
  });

  test("goalId: null quando não é UUID (slug/texto livre)", async () => {
    const queries = makeQueries();
    const r = await resolverAlvoParaFks(queries, CTX, { goal_id: "meta-livre" });
    expect(r.goalId).toBeNull();
    expect(r.goalRef).toBe("meta-livre"); // preserva o ref cru mesmo sem resolver
  });

  test("goalId: null quando é UUID mas não existe para o paciente (não adivinha)", async () => {
    const goalUuid = "22222222-2222-2222-2222-222222222222";
    const queries = makeQueries({ goalExists: vi.fn().mockResolvedValue(false) });
    const r = await resolverAlvoParaFks(queries, CTX, { goal_id: goalUuid });
    expect(r.goalId).toBeNull();
  });

  test("protocolId: resolve quando há exatamente 1 protocolo ativo da família", async () => {
    const queries = makeQueries({
      protocolosAtivos: vi.fn().mockResolvedValue(["protocol-1"]),
    });
    const r = await resolverAlvoParaFks(queries, CTX, { protocol_id: "vbmapp" });
    expect(r.protocolId).toBe("protocol-1");
    expect(r.protocolSlug).toBe("vbmapp");
    expect(queries.protocolosAtivos).toHaveBeenCalledWith(CTX.clinicId, CTX.patientId, "vbmapp");
  });

  test("protocolId: null quando ambíguo (>1 protocolo ativo da mesma família)", async () => {
    const queries = makeQueries({
      protocolosAtivos: vi.fn().mockResolvedValue(["protocol-1", "protocol-2"]),
    });
    const r = await resolverAlvoParaFks(queries, CTX, { protocol_id: "vbmapp" });
    expect(r.protocolId).toBeNull();
  });

  test("protocolId: null quando não há protocolo ativo dessa família (0 linhas)", async () => {
    const queries = makeQueries({ protocolosAtivos: vi.fn().mockResolvedValue([]) });
    const r = await resolverAlvoParaFks(queries, CTX, { protocol_id: "denver" });
    expect(r.protocolId).toBeNull();
  });

  test("milestoneId: resolve só quando (protocolId, dominioId) tem EXATAMENTE 1 marco", async () => {
    const queries = makeQueries({
      protocolosAtivos: vi.fn().mockResolvedValue(["protocol-1"]),
      marcos: vi.fn().mockResolvedValue(["milestone-1"]),
    });
    const r = await resolverAlvoParaFks(queries, CTX, {
      protocol_id: "vbmapp",
      dominio_id: "mando",
    });
    expect(r.protocolId).toBe("protocol-1");
    expect(r.milestoneId).toBe("milestone-1");
    expect(queries.marcos).toHaveBeenCalledWith("protocol-1", "mando");
  });

  test("milestoneId: null quando o domínio tem múltiplos marcos (ambíguo por nível — decisão §3 opção C)", async () => {
    const queries = makeQueries({
      protocolosAtivos: vi.fn().mockResolvedValue(["protocol-1"]),
      marcos: vi.fn().mockResolvedValue(["milestone-1", "milestone-2"]),
    });
    const r = await resolverAlvoParaFks(queries, CTX, {
      protocol_id: "vbmapp",
      dominio_id: "mando",
    });
    expect(r.milestoneId).toBeNull();
  });

  test("milestoneId: null quando protocolId não resolveu (nem tenta consultar marcos)", async () => {
    const queries = makeQueries({
      protocolosAtivos: vi.fn().mockResolvedValue([]),
      marcos: vi.fn(),
    });
    const r = await resolverAlvoParaFks(queries, CTX, {
      protocol_id: "vbmapp",
      dominio_id: "mando",
    });
    expect(r.milestoneId).toBeNull();
    expect(queries.marcos).not.toHaveBeenCalled();
  });
});
