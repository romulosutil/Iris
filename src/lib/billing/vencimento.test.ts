import { describe, expect, it } from "vitest";
import { diasUteisEntre } from "./calendario-bancario";
import {
  ANTECEDENCIA_MAXIMA_DIAS_CORRIDOS,
  ANTECEDENCIA_MINIMA_DIAS_UTEIS,
  vencimentoCobrancaDeCiclo,
} from "./vencimento";

const dia = (iso: string) => new Date(`${iso}T12:00:00Z`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

describe("vencimento da cobrança de ciclo", () => {
  it("mantém os 5 dias corridos quando eles já satisfazem a janela", () => {
    // sexta 2026-08-14 + 5 = quarta 2026-08-19; seg/ter úteis no meio = 2
    expect(ymd(vencimentoCobrancaDeCiclo(dia("2026-08-14")))).toBe(
      "2026-08-19",
    );
  });

  it("nunca vence em sábado, domingo ou feriado", () => {
    // segunda 2026-08-17 + 5 = sábado 2026-08-22 → empurra para segunda 24
    expect(ymd(vencimentoCobrancaDeCiclo(dia("2026-08-17")))).toBe(
      "2026-08-24",
    );
    // 2026-09-02 + 5 = 2026-09-07 (Independência) → 2026-09-08
    expect(ymd(vencimentoCobrancaDeCiclo(dia("2026-09-02")))).toBe(
      "2026-09-08",
    );
  });

  it("estica a antecedência quando o Carnaval come os dias úteis", () => {
    // Carnaval 2026: 16 e 17/02. Fechamento em 2026-02-13 (sexta):
    // +5 = 18/02 (quarta), com 0 dias úteis no meio → precisa esticar.
    const vencimento = vencimentoCobrancaDeCiclo(dia("2026-02-13"));
    expect(
      diasUteisEntre(dia("2026-02-13"), vencimento),
    ).toBeGreaterThanOrEqual(ANTECEDENCIA_MINIMA_DIAS_UTEIS);
    expect(ymd(vencimento)).toBe("2026-02-20");
  });

  it("garante a janela em todo dia de dois anos, sem estourar o teto", () => {
    // O bug que esta issue conserta é sazonal: passa o ano inteiro verde e
    // falha em janeiro. Varrer o calendário é o único teste que o pega.
    for (let i = 0; i < 730; i += 1) {
      const base = new Date(dia("2026-01-01"));
      base.setUTCDate(base.getUTCDate() + i);
      const vencimento = vencimentoCobrancaDeCiclo(base);
      expect(diasUteisEntre(base, vencimento)).toBeGreaterThanOrEqual(
        ANTECEDENCIA_MINIMA_DIAS_UTEIS,
      );
      const corridos = Math.round(
        (vencimento.getTime() - Number(dia(ymd(base)))) / 86_400_000,
      );
      expect(corridos).toBeLessThanOrEqual(ANTECEDENCIA_MAXIMA_DIAS_CORRIDOS);
    }
  });
});
