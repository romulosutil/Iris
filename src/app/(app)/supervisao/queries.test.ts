import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tx } from "@/db/rls";

/**
 * PF-01 (#538) — oráculo de contagem de queries (padrão do PR #417).
 * `listarSupervisao` fazia até 3 SELECTs por alerta `reconhecido` sem sinal
 * vivo (patient, goal, protocol), dentro de `for (const alert of alertaRows)`.
 * Aqui o banco é um dublê que só conta e classifica cada `execute`: com N
 * alertas cessados o número de queries tem que ser constante.
 */
vi.mock("server-only", () => ({}));

const executeMock = vi.fn();
vi.mock("@/db/rls", () => ({
  withTenant: (_ctx: unknown, fn: (tx: Tx) => Promise<unknown>) =>
    fn({ execute: executeMock } as unknown as Tx),
}));

const { listarSupervisao } = await import("./queries");

afterEach(() => executeMock.mockReset());

/** Nome da tabela principal da query (`FROM x`), lido do objeto SQL do Drizzle. */
function tabelaDe(q: unknown): string {
  const texto = JSON.stringify(q);
  const m = /FROM\s+([a-z_]+)/.exec(texto);
  return m?.[1] ?? "?";
}

function uuid(n: number, faixa: string) {
  return `00000000-0000-0000-0000-${faixa}${String(n).padStart(8, "0")}`.slice(
    0,
    36,
  );
}

function cenario(nAlertas: number) {
  const ids = Array.from({ length: nAlertas }, (_, i) => ({
    patient: uuid(i, "a"),
    goal: uuid(i, "b"),
    protocol: uuid(i, "c"),
  }));
  executeMock.mockImplementation(async (q: unknown) => {
    switch (tabelaDe(q)) {
      case "clinic":
        return [{ faltas_limiar: 3, faltas_janela_semanas: 4 }];
      case "session_snapshot":
        return [];
      case "session":
        return [];
      case "alerta":
        return ids.map((x, i) => ({
          id: uuid(i, "d"),
          chave_natural: `estagnacao:${x.patient}:${x.goal}:${x.protocol}`,
          status: "reconhecido",
          patient_id: x.patient,
          tipo: "estagnacao",
          goal_id: x.goal,
          protocol_id: x.protocol,
          // Linha ANTIGA do jsonb: `metrica` na forma objeto, como
          // `materializar.ts` gravava antes do formatador (#567). Nada de
          // backfill — a formatação roda na leitura.
          detalhe: JSON.stringify({
            metrica: { eixo: "nivel_ajuda", ordinalRecente: 2 },
            tipoEstrutura: "marco_simples",
            sessionNumero: 7,
          }),
        }));
      case "patient":
        return ids.map((x, i) => ({ id: x.patient, nome: `Paciente ${i}` }));
      case "goal":
        return ids.map((x, i) => ({ id: x.goal, nome: `Meta ${i}` }));
      case "protocol":
        return ids.map((x, i) => ({ id: x.protocol, nome: `Protocolo ${i}` }));
      default:
        throw new Error(`query inesperada: ${tabelaDe(q)}`);
    }
  });
  return ids;
}

const ctx = {
  clinicId: "00000000-0000-0000-0000-0000000000c1",
  userId: "00000000-0000-0000-0000-00000000c0a1",
  role: "coordenador",
} as const;

describe("listarSupervisao — alertas reconhecidos sem sinal vivo (PF-01)", () => {
  it("resolve nomes em lote: número de queries é constante em N", async () => {
    cenario(1);
    await listarSupervisao(ctx);
    const comUm = executeMock.mock.calls.length;

    executeMock.mockReset();
    cenario(25);
    const { itens } = await listarSupervisao(ctx);
    const comVinteCinco = executeMock.mock.calls.length;

    expect(itens).toHaveLength(25);
    expect(comVinteCinco).toBe(comUm);
    // 4 fixas (clinic, session_snapshot, session, alerta) + 3 lotes
    // (patient, goal, protocol) = 7. Antes: 4 + 3 × N.
    expect(comVinteCinco).toBe(7);
  });

  it("os lotes trazem os nomes e cada item sai preenchido", async () => {
    cenario(3);
    const { itens } = await listarSupervisao(ctx);
    const porTabela = executeMock.mock.calls.map(([q]) => tabelaDe(q));
    expect(porTabela.filter((t) => t === "patient")).toHaveLength(1);
    expect(porTabela.filter((t) => t === "goal")).toHaveLength(1);
    expect(porTabela.filter((t) => t === "protocol")).toHaveLength(1);
    for (const [i, item] of itens.entries()) {
      expect(item.estado).toBe("reconhecido");
      expect(item.sinalPresente).toBe(false);
      expect(item.patientNome).toBe(`Paciente ${i}`);
      expect(item.goalNome).toBe(`Meta ${i}`);
      expect(item.protocolNome).toBe(`Protocolo ${i}`);
      expect(item.detalhe).toEqual({
        metrica: "Nível de ajuda: 2",
        tipoEstrutura: "marco_simples",
        sessionNumero: 7,
      });
    }
  });

  it("sem alerta cessado, nenhum lote é disparado", async () => {
    cenario(0);
    const { itens } = await listarSupervisao(ctx);
    expect(itens).toEqual([]);
    const porTabela = executeMock.mock.calls.map(([q]) => tabelaDe(q));
    expect(porTabela).not.toContain("patient");
    expect(porTabela).not.toContain("goal");
    expect(porTabela).not.toContain("protocol");
  });
});
