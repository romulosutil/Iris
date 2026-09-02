import { describe, expect, it } from "vitest";
import { estadoDoMarco, type EstadoDasMetas } from "./logic";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";

describe("estadoDoMarco — status oficial, não heurística (PR #556, revisão 03/09)", () => {
  it("[meta nível 2 ativa, meta dominada] → conquistado (o melhor entre as metas)", () => {
    const metas: EstadoDasMetas = {
      [A]: { estado: "ativa", candidataOficial: false },
      [B]: { estado: "dominada", candidataOficial: false },
    };
    expect(estadoDoMarco(metas, [A, B])).toBe("conquistado");
  });

  it("[candidata oficial, sem entrada para a outra] → candidato", () => {
    const metas: EstadoDasMetas = {
      [A]: { estado: "ativa", candidataOficial: true },
    };
    expect(estadoDoMarco(metas, [A, B])).toBe("candidato");
  });

  it("[só heurística is_candidata no repertorio_state] → não atingido: a heurística não entra", () => {
    // O repertorio_state nem é consultado — só o status oficial.
    const metas: EstadoDasMetas = {
      [A]: { estado: "ativa", candidataOficial: false },
    };
    expect(estadoDoMarco(metas, [A])).toBe("nao_atingido");
  });

  it("nível de ajuda 0 sem `dominada` NÃO é conquistado (domínio exige N consecutivas)", () => {
    const metas: EstadoDasMetas = {
      [A]: { estado: "ativa", candidataOficial: false },
    };
    expect(estadoDoMarco(metas, [A])).toBe("nao_atingido");
  });

  it("milestone_candidacy oficial marca candidato mesmo sem meta mapeada; dominada ainda vence", () => {
    expect(estadoDoMarco({}, [], true)).toBe("candidato");
    const metas: EstadoDasMetas = {
      [A]: { estado: "dominada", candidataOficial: false },
    };
    expect(estadoDoMarco(metas, [A], true)).toBe("conquistado");
  });

  it("marco sem metas mapeadas e sem candidatura → não atingido", () => {
    expect(estadoDoMarco({}, [])).toBe("nao_atingido");
  });
});
