import { describe, expect, test } from "vitest";
import type { TenantContext } from "@/db/rls";
import { avaliarFriccao } from "@/lib/extraction/review-policy";
import { podeAutoValidar, type SessaoParaAprovacao } from "./aprovacao";

// Fonte da regra: docs/ux/jornada-sessao-unificada.md §3.5, §7.5 e
// spec.md R-07/R-08/R-10/R-11. R-08 é a régua inegociável desta feature:
// `podeAutoValidar` recebe UMA sessão e deriva só de
// `ctx.role === "coordenador" && ctx.userId === session.terapeutaId`.

const CLINIC_ID = "clinica-1";
const COORDENADOR_ID = "user-coordenador";
const OUTRO_TERAPEUTA_ID = "user-outro-terapeuta";

function ctx(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    clinicId: CLINIC_ID,
    userId: COORDENADOR_ID,
    role: "coordenador",
    ...overrides,
  };
}

function sessao(
  overrides: Partial<SessaoParaAprovacao> = {},
): SessaoParaAprovacao {
  return { terapeutaId: COORDENADOR_ID, ...overrides };
}

describe("podeAutoValidar (R-07, R-08)", () => {
  // E1: coordenador que atende a própria sessão → colapsa.
  test("E1: coordenador é o terapeuta da própria sessão → colapsa", () => {
    const resultado = podeAutoValidar(
      ctx({ role: "coordenador", userId: COORDENADOR_ID }),
      sessao({ terapeutaId: COORDENADOR_ID }),
    );
    expect(resultado).toBe(true);
  });

  // E2 — o guarda do R-08. Um MESMO coordenador, em uma MESMA clínica, atende
  // parte de seus pacientes e encaminha outra parte. Uma régua derivada da
  // clínica (ex.: "sou o único coordenador") diria "sim" para as duas sessões
  // abaixo — é exatamente o defeito que R-08 proíbe. A régua correta olha só
  // `session.terapeutaId` e por isso diverge entre as duas.
  test("E2: mesmo coordenador — colapsa na própria sessão, não colapsa na de outro terapeuta (guarda do R-08)", () => {
    const contexto = ctx({ role: "coordenador", userId: COORDENADOR_ID });

    const proprioAtendimento = podeAutoValidar(
      contexto,
      sessao({ terapeutaId: COORDENADOR_ID }),
    );
    const atendimentoDeOutroTerapeuta = podeAutoValidar(
      contexto,
      sessao({ terapeutaId: OUTRO_TERAPEUTA_ID }),
    );

    expect(proprioAtendimento).toBe(true);
    expect(atendimentoDeOutroTerapeuta).toBe(false);
  });

  test("terapeuta puro (não coordenador) → nunca colapsa, mesmo na própria sessão", () => {
    const resultado = podeAutoValidar(
      ctx({ role: "terapeuta", userId: COORDENADOR_ID }),
      sessao({ terapeutaId: COORDENADOR_ID }),
    );
    expect(resultado).toBe(false);
  });

  test("coordenador que não atende a sessão → nunca colapsa", () => {
    const resultado = podeAutoValidar(
      ctx({ role: "coordenador", userId: COORDENADOR_ID }),
      sessao({ terapeutaId: OUTRO_TERAPEUTA_ID }),
    );
    expect(resultado).toBe(false);
  });

  test("admin_recepcao nunca colapsa, mesmo se terapeutaId coincidisse", () => {
    const resultado = podeAutoValidar(
      ctx({ role: "admin_recepcao", userId: COORDENADOR_ID }),
      sessao({ terapeutaId: COORDENADOR_ID }),
    );
    expect(resultado).toBe(false);
  });
});

describe("podeAutoValidar não sobrepõe fricção alta (R-10)", () => {
  // Fricção alta (inconsistência com histórico) exige justificativa escrita e
  // nunca vai a lote — independente de `podeAutoValidar` valer true. O
  // colapso da aprovação decide QUEM aprova, não SE a fricção é dispensada.
  test("coordenador colapsa a própria sessão, mas fricção alta continua exigindo justificativa e barra lote", () => {
    const colapsa = podeAutoValidar(
      ctx({ role: "coordenador", userId: COORDENADOR_ID }),
      sessao({ terapeutaId: COORDENADOR_ID }),
    );
    expect(colapsa).toBe(true);

    const friccao = avaliarFriccao({
      confianca: "alta",
      inconsistenteComHistorico: true,
    });
    expect(friccao.nivel).toBe("alto");
    expect(friccao.exigeFriccao).toBe(true);
    expect(friccao.podeLote).toBe(false);
  });
});
