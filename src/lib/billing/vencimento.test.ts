/**
 * Os limites da janela aparecem aqui como LITERAIS (`2` úteis, `10` corridos),
 * nunca importados de `vencimento.ts` — mesma disciplina do topo de
 * `asaas.test.ts`: o teste vigia a constante, não a segue. Importar
 * `ANTECEDENCIA_MINIMA_DIAS_UTEIS` e `ANTECEDENCIA_MAXIMA_DIAS_CORRIDOS` faria
 * a asserção repetir a condição de saída da implementação, e a varredura de
 * 730 dias passava verde com o piso mutado de 2 para 0 e o teto de 10 para
 * 100. Se a janela mudar de verdade, estes números mudam à mão, com a doc do
 * Asaas na frente.
 */
import { describe, expect, it } from "vitest";
import { diasUteisEntre } from "./calendario-bancario";
import { verificarTetoDaJanela, vencimentoCobrancaDeCiclo } from "./vencimento";

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
    ).toBeGreaterThanOrEqual(2);
    expect(ymd(vencimento)).toBe("2026-02-20");
  });

  it("atravessa o cluster de fim de ano, incluindo a virada do ano", () => {
    // Dezembro/2026: 24 (qui) e 31 (qui) são fechamento bancário, 25 (sex) é
    // Natal, 26-27 fim de semana, 01/01/2027 (sex) feriado e 02-03 fim de
    // semana. Sobram úteis 21, 22, 23, 28, 29, 30 e depois só 04/01/2027.
    // Datas conferidas dia a dia contra o calendário, não geradas pelo código.
    // 21/12 (seg) +5 = 26 (sáb) → 28 (seg); úteis no meio 22 e 23 = 2.
    expect(ymd(vencimentoCobrancaDeCiclo(dia("2026-12-21")))).toBe(
      "2026-12-28",
    );
    // 22/12 (ter) +5 = 27 (dom) → 28; só 23 no meio = 1, estica para 29.
    expect(ymd(vencimentoCobrancaDeCiclo(dia("2026-12-22")))).toBe(
      "2026-12-29",
    );
    // 23/12 (qua) +5 = 28; nada útil no meio (24 a 27) → estica até 30.
    expect(ymd(vencimentoCobrancaDeCiclo(dia("2026-12-23")))).toBe(
      "2026-12-30",
    );
    // 26/12 (sáb) +5 = 31 (fechado) → 01/01 feriado, 02-03 fds → 04/01/2027.
    // Vencimento no ano seguinte ao fechamento; 9 dias corridos, dentro do teto.
    expect(ymd(vencimentoCobrancaDeCiclo(dia("2026-12-26")))).toBe(
      "2027-01-04",
    );
    // 28/12 (seg) +5 = 02/01 (sáb) → 04/01; úteis 29 e 30 = 2.
    expect(ymd(vencimentoCobrancaDeCiclo(dia("2026-12-28")))).toBe(
      "2027-01-04",
    );
    // 30/12 (qua) +5 = 04/01; nada útil no meio (31, 01, 02, 03) → 06/01.
    expect(ymd(vencimentoCobrancaDeCiclo(dia("2026-12-30")))).toBe(
      "2027-01-06",
    );
  });

  it("recusa candidato além do teto de dias corridos", () => {
    // Nenhum fechamento real chega ao teto (o pior caso medido é 9), então só
    // a função pura consegue exercitar o ramo. 11 corridos: estoura.
    expect(() =>
      verificarTetoDaJanela(dia("2026-08-14"), dia("2026-08-25")),
    ).toThrow(RangeError);
    expect(() =>
      verificarTetoDaJanela(dia("2026-08-14"), dia("2026-08-25")),
    ).toThrow(/11 dias corridos/);
    // 10 corridos é a borda que ainda passa; 9 e 0 idem.
    expect(() =>
      verificarTetoDaJanela(dia("2026-08-14"), dia("2026-08-24")),
    ).not.toThrow();
    expect(() =>
      verificarTetoDaJanela(dia("2026-08-14"), dia("2026-08-14")),
    ).not.toThrow();
  });

  it(
    "garante a janela em todo dia de dois anos, sem estourar o teto",
    () => {
      // O bug que esta issue conserta é sazonal: passa o ano inteiro verde e
      // falha em janeiro. Varrer o calendário é o único teste que o pega.
      for (let i = 0; i < 730; i += 1) {
        const base = new Date(dia("2026-01-01"));
        base.setUTCDate(base.getUTCDate() + i);
        const vencimento = vencimentoCobrancaDeCiclo(base);
        // Literais: ver o docblock do topo. Importar as constantes tornava esta
        // asserção uma cópia da condição de saída da implementação.
        expect(diasUteisEntre(base, vencimento)).toBeGreaterThanOrEqual(2);
        const corridos = Math.round(
          (vencimento.getTime() - Number(dia(ymd(base)))) / 86_400_000,
        );
        expect(corridos).toBeLessThanOrEqual(10);
      }
    },
    20000,
  );
});
