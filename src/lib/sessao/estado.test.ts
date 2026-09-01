import { describe, expect, test } from "vitest";
import { deriveEstadoSessao, type EntradaSessao } from "./estado";

// Fonte da regra: docs/ux/jornada-sessao-unificada.md §3.1 (tabela de
// derivação) e §3.3 (gesto primário por estado).

const AGORA = new Date("2026-09-01T12:00:00.000Z");

// Base "neutra": sessão agendada, sem notas, sem extrações, fora da fila.
// Cada teste sobrescreve só o que precisa para isolar a regra exercida.
function base(overrides: Partial<EntradaSessao> = {}): EntradaSessao {
  return {
    estado: "agendada",
    agendadaPara: AGORA,
    temNotaConsolidada: false,
    extracoes: [],
    itensNaFilaValidacao: 0,
    ...overrides,
  };
}

describe("deriveEstadoSessao — tabela de derivação (§3.1)", () => {
  test("agendada: session.estado = 'agendada'", () => {
    const r = deriveEstadoSessao(base({ estado: "agendada" }), AGORA);
    expect(r.estado).toBe("agendada");
    expect(r.gesto).toBe("registrar_sessao");
  });

  test("realizada: session.estado = 'realizada' e sem nota_consolidada", () => {
    const r = deriveEstadoSessao(
      base({ estado: "realizada", temNotaConsolidada: false }),
      AGORA,
    );
    expect(r.estado).toBe("realizada");
    expect(r.gesto).toBe("documentar");
  });

  test("documentada: existe nota_consolidada e existe extraction sugerida", () => {
    const r = deriveEstadoSessao(
      base({
        estado: "realizada",
        temNotaConsolidada: true,
        extracoes: [{ estado: "sugerida" }],
      }),
      AGORA,
    );
    expect(r.estado).toBe("documentada");
    expect(r.gesto).toBe("revisar_evidencias");
  });

  test("revisada: toda extraction decidida, mas ainda pendente na fila de validação (caminho normal rumo a no_acervo)", () => {
    const r = deriveEstadoSessao(
      base({
        estado: "realizada",
        temNotaConsolidada: true,
        extracoes: [
          { estado: "aprovada" },
          { estado: "editada" },
          { estado: "descartada" },
        ],
        itensNaFilaValidacao: 1, // ainda pendente na fila -> não é no_acervo
      }),
      AGORA,
    );
    expect(r.estado).toBe("revisada");
    expect(r.gesto).toBe("ver_no_acervo");
  });

  test("no_acervo: revisada e nenhum item da sessão pendente na fila", () => {
    const r = deriveEstadoSessao(
      base({
        estado: "realizada",
        temNotaConsolidada: true,
        extracoes: [{ estado: "aprovada" }],
        itensNaFilaValidacao: 0,
      }),
      AGORA,
    );
    expect(r.estado).toBe("no_acervo");
    expect(r.gesto).toBe("ver_no_acervo");
  });

  test("falta: session.estado = 'falta_paciente'", () => {
    const r = deriveEstadoSessao(base({ estado: "falta_paciente" }), AGORA);
    expect(r.estado).toBe("falta");
    expect(r.gesto).toBeNull();
  });

  test("falta: session.estado = 'falta_terapeuta'", () => {
    const r = deriveEstadoSessao(base({ estado: "falta_terapeuta" }), AGORA);
    expect(r.estado).toBe("falta");
    expect(r.gesto).toBeNull();
  });

  test("cancelada: session.estado = 'cancelada'", () => {
    const r = deriveEstadoSessao(base({ estado: "cancelada" }), AGORA);
    expect(r.estado).toBe("cancelada");
    expect(r.gesto).toBeNull();
  });
});

describe("deriveEstadoSessao — precedência de precisa_atencao", () => {
  test("vence 'realizada' (extração travada)", () => {
    const r = deriveEstadoSessao(
      base({
        estado: "realizada",
        extracoes: [{ estado: "pendente_reprocessamento" }],
      }),
      AGORA,
    );
    expect(r.estado).toBe("precisa_atencao");
    if (r.estado === "precisa_atencao") {
      expect(r.motivo).toBe("extracao_travada");
      expect(r.gesto).toBe("reprocessar_extracao");
    }
  });

  test("vence 'documentada' (extração travada)", () => {
    const r = deriveEstadoSessao(
      base({
        estado: "realizada",
        temNotaConsolidada: true,
        extracoes: [{ estado: "sugerida" }, { estado: "erro_validacao" }],
      }),
      AGORA,
    );
    expect(r.estado).toBe("precisa_atencao");
    if (r.estado === "precisa_atencao") {
      expect(r.motivo).toBe("extracao_travada");
    }
  });

  test("vence 'documentada' (item na fila de validação antes de revisar tudo)", () => {
    // "na_fila_validacao" só é exceção enquanto a sessão ainda não terminou a
    // revisão das extrações — aqui há uma extração ainda 'sugerida' junto de
    // um item na fila, então a sessão travou antes de virar revisada.
    const r = deriveEstadoSessao(
      base({
        estado: "realizada",
        temNotaConsolidada: true,
        extracoes: [{ estado: "sugerida" }],
        itensNaFilaValidacao: 1,
      }),
      AGORA,
    );
    expect(r.estado).toBe("precisa_atencao");
    if (r.estado === "precisa_atencao") {
      expect(r.motivo).toBe("na_fila_validacao");
      expect(r.gesto).toBe("revisar_evidencias");
    }
  });

  test("vence 'no_acervo' — mesmo já revisada e fora da fila, extração travada ainda pesa", () => {
    // Cenário: extração remanescente em erro_validacao junto de outras já
    // decididas. A sessão pareceria "no_acervo" olhando só para a fila, mas
    // precisa_atencao é ramo de exceção e vence mesmo aqui.
    const r = deriveEstadoSessao(
      base({
        estado: "realizada",
        temNotaConsolidada: true,
        extracoes: [{ estado: "aprovada" }, { estado: "erro_validacao" }],
        itensNaFilaValidacao: 0,
      }),
      AGORA,
    );
    expect(r.estado).toBe("precisa_atencao");
    if (r.estado === "precisa_atencao") {
      expect(r.motivo).toBe("extracao_travada");
    }
  });

  test("vence 'agendada' — não se aplica (agendada não tem extração), mas sem_nota_apos_24h não incide sobre agendada", () => {
    // Sessão agendada nunca é 'realizada', então a janela de 24h de
    // sem_nota_apos_24h não se aplica; confirma que o estado permanece agendada.
    const r = deriveEstadoSessao(
      base({
        estado: "agendada",
        agendadaPara: new Date("2026-08-01T00:00:00.000Z"),
      }),
      AGORA,
    );
    expect(r.estado).toBe("agendada");
  });
});

describe("deriveEstadoSessao — terminais vencem precisa_atencao (decisão de projeto)", () => {
  // Falta/cancelada são desfechos, não falha: não há mais trabalho clínico a
  // fazer numa sessão cancelada, então nenhum ramo de exceção deve reabri-la
  // como pendência. A ordem real de avaliação é: terminais primeiro, depois
  // precisa_atencao, depois o resto da tabela.
  test("cancelada com extração travada continua cancelada", () => {
    const r = deriveEstadoSessao(
      base({
        estado: "cancelada",
        extracoes: [{ estado: "erro_validacao" }],
        itensNaFilaValidacao: 1,
      }),
      AGORA,
    );
    expect(r.estado).toBe("cancelada");
    expect(r.gesto).toBeNull();
  });

  test("falta com item na fila de validação continua falta", () => {
    const r = deriveEstadoSessao(
      base({
        estado: "falta_paciente",
        itensNaFilaValidacao: 1,
      }),
      AGORA,
    );
    expect(r.estado).toBe("falta");
    expect(r.gesto).toBeNull();
  });
});

describe("deriveEstadoSessao — os 3 motivos de precisa_atencao, isolados", () => {
  test("extracao_travada: pendente_reprocessamento", () => {
    const r = deriveEstadoSessao(
      base({
        estado: "realizada",
        extracoes: [{ estado: "pendente_reprocessamento" }],
      }),
      AGORA,
    );
    expect(r.estado).toBe("precisa_atencao");
    if (r.estado === "precisa_atencao")
      expect(r.motivo).toBe("extracao_travada");
  });

  test("extracao_travada: erro_validacao", () => {
    const r = deriveEstadoSessao(
      base({
        estado: "realizada",
        extracoes: [{ estado: "erro_validacao" }],
      }),
      AGORA,
    );
    expect(r.estado).toBe("precisa_atencao");
    if (r.estado === "precisa_atencao")
      expect(r.motivo).toBe("extracao_travada");
  });

  test("sem_nota_apos_24h: realizada, sem nota, agendada há mais de 24h", () => {
    const r = deriveEstadoSessao(
      base({
        estado: "realizada",
        temNotaConsolidada: false,
        agendadaPara: new Date("2026-08-31T11:00:00.000Z"), // 25h antes de AGORA
      }),
      AGORA,
    );
    expect(r.estado).toBe("precisa_atencao");
    if (r.estado === "precisa_atencao") {
      expect(r.motivo).toBe("sem_nota_apos_24h");
      expect(r.gesto).toBe("documentar");
    }
  });

  test("na_fila_validacao: item pendente na fila, sem outros motivos", () => {
    const r = deriveEstadoSessao(
      base({
        estado: "realizada",
        temNotaConsolidada: true,
        extracoes: [{ estado: "sugerida" }],
        itensNaFilaValidacao: 2,
      }),
      AGORA,
    );
    expect(r.estado).toBe("precisa_atencao");
    if (r.estado === "precisa_atencao")
      expect(r.motivo).toBe("na_fila_validacao");
  });
});

describe("deriveEstadoSessao — precedência entre motivos quando 2+ aplicam", () => {
  test("extracao_travada vence sem_nota_apos_24h e na_fila_validacao", () => {
    const r = deriveEstadoSessao(
      base({
        estado: "realizada",
        temNotaConsolidada: false,
        agendadaPara: new Date("2026-08-31T00:00:00.000Z"), // > 24h
        extracoes: [{ estado: "erro_validacao" }],
        itensNaFilaValidacao: 1,
      }),
      AGORA,
    );
    expect(r.estado).toBe("precisa_atencao");
    if (r.estado === "precisa_atencao")
      expect(r.motivo).toBe("extracao_travada");
  });

  test("sem_nota_apos_24h vence na_fila_validacao quando extracao_travada não aplica", () => {
    const r = deriveEstadoSessao(
      base({
        estado: "realizada",
        temNotaConsolidada: false,
        agendadaPara: new Date("2026-08-31T00:00:00.000Z"), // > 24h
        extracoes: [],
        itensNaFilaValidacao: 1,
      }),
      AGORA,
    );
    expect(r.estado).toBe("precisa_atencao");
    if (r.estado === "precisa_atencao")
      expect(r.motivo).toBe("sem_nota_apos_24h");
  });
});

describe("deriveEstadoSessao — fronteira exata de 24h", () => {
  test("23h59 antes de agora: NÃO é sem_nota_apos_24h", () => {
    const agendadaPara = new Date(AGORA.getTime() - (24 * 60 - 1) * 60 * 1000);
    const r = deriveEstadoSessao(
      base({
        estado: "realizada",
        temNotaConsolidada: false,
        agendadaPara,
      }),
      AGORA,
    );
    expect(r.estado).toBe("realizada");
  });

  test("24h01 antes de agora: É sem_nota_apos_24h", () => {
    const agendadaPara = new Date(AGORA.getTime() - (24 * 60 + 1) * 60 * 1000);
    const r = deriveEstadoSessao(
      base({
        estado: "realizada",
        temNotaConsolidada: false,
        agendadaPara,
      }),
      AGORA,
    );
    expect(r.estado).toBe("precisa_atencao");
    if (r.estado === "precisa_atencao")
      expect(r.motivo).toBe("sem_nota_apos_24h");
  });

  test("exatamente 24h antes de agora: NÃO é sem_nota_apos_24h (limiar é 'mais de 24h')", () => {
    const agendadaPara = new Date(AGORA.getTime() - 24 * 60 * 60 * 1000);
    const r = deriveEstadoSessao(
      base({
        estado: "realizada",
        temNotaConsolidada: false,
        agendadaPara,
      }),
      AGORA,
    );
    expect(r.estado).toBe("realizada");
  });
});

describe("deriveEstadoSessao — gesto primário por estado (§3.3)", () => {
  test("agendada -> registrar_sessao", () => {
    expect(deriveEstadoSessao(base({ estado: "agendada" }), AGORA).gesto).toBe(
      "registrar_sessao",
    );
  });

  test("realizada -> documentar", () => {
    expect(deriveEstadoSessao(base({ estado: "realizada" }), AGORA).gesto).toBe(
      "documentar",
    );
  });

  test("documentada -> revisar_evidencias", () => {
    expect(
      deriveEstadoSessao(
        base({
          estado: "realizada",
          temNotaConsolidada: true,
          extracoes: [{ estado: "sugerida" }],
        }),
        AGORA,
      ).gesto,
    ).toBe("revisar_evidencias");
  });

  test("revisada -> ver_no_acervo", () => {
    expect(
      deriveEstadoSessao(
        base({
          estado: "realizada",
          temNotaConsolidada: true,
          extracoes: [{ estado: "aprovada" }],
          itensNaFilaValidacao: 1,
        }),
        AGORA,
      ).gesto,
    ).toBe("ver_no_acervo");
  });

  test("no_acervo -> ver_no_acervo", () => {
    expect(
      deriveEstadoSessao(
        base({
          estado: "realizada",
          temNotaConsolidada: true,
          extracoes: [{ estado: "aprovada" }],
        }),
        AGORA,
      ).gesto,
    ).toBe("ver_no_acervo");
  });

  test("falta -> null", () => {
    expect(
      deriveEstadoSessao(base({ estado: "falta_paciente" }), AGORA).gesto,
    ).toBeNull();
  });

  test("cancelada -> null", () => {
    expect(
      deriveEstadoSessao(base({ estado: "cancelada" }), AGORA).gesto,
    ).toBeNull();
  });

  test("precisa_atencao/extracao_travada -> reprocessar_extracao", () => {
    const r = deriveEstadoSessao(
      base({
        estado: "realizada",
        extracoes: [{ estado: "pendente_reprocessamento" }],
      }),
      AGORA,
    );
    expect(r.gesto).toBe("reprocessar_extracao");
  });

  test("precisa_atencao/sem_nota_apos_24h -> documentar", () => {
    const r = deriveEstadoSessao(
      base({
        estado: "realizada",
        temNotaConsolidada: false,
        agendadaPara: new Date("2026-08-31T00:00:00.000Z"),
      }),
      AGORA,
    );
    expect(r.gesto).toBe("documentar");
  });

  test("precisa_atencao/na_fila_validacao -> revisar_evidencias", () => {
    const r = deriveEstadoSessao(
      base({
        estado: "realizada",
        temNotaConsolidada: true,
        extracoes: [{ estado: "sugerida" }],
        itensNaFilaValidacao: 1,
      }),
      AGORA,
    );
    expect(r.gesto).toBe("revisar_evidencias");
  });
});
