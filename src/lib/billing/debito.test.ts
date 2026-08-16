import { describe, it, expect } from "vitest";
import { decidirGate, PISO_COBRANCA_AVULSA_CENTAVOS } from "./debito";

/**
 * A decisão do gate de reativação (#290), isolada do banco e do gateway.
 *
 * As três faixas não são simetria de código, são três políticas diferentes — e
 * a do meio é a única que não se deduz do enunciado "quem cancela vira devedor":
 *
 * - **zero** → não há dívida, a reativação segue como sempre foi;
 * - **abaixo do piso** → dívida real que nenhum gateway aceita cobrar. Bloquear
 *   aqui seria deadlock (a clínica não conseguiria voltar por dever R$ 2,60);
 *   perdoar contradiria o "débito não caduca" e devolveria uns dias grátis por
 *   volta ao loop cancela-usa-cancela. Adiar preserva as duas coisas;
 * - **no piso ou acima** → cobra antes de reabrir. É o que torna o loop inútil.
 *
 * O caso EXATAMENTE no piso é o que separa `<` de `<=` — a fronteira onde um
 * off-by-one deixaria a cobrança mínima presa em "adiar" para sempre, e o
 * débito acumulando sem nunca ser cobrado.
 */
describe("decidirGate", () => {
  it("sem débito segue o fluxo normal de ativação", () => {
    expect(decidirGate(0)).toBe("sem_debito");
  });

  it("valor negativo é tratado como ausência de débito, não como crédito", () => {
    // Não existe caminho produtor hoje (`billing_cycle_valor_nao_negativo`),
    // mas a alternativa seria cair na faixa "adiar" e prometer cobrar depois um
    // valor que ninguém deve.
    expect(decidirGate(-100)).toBe("sem_debito");
  });

  it("um centavo já é dívida — e dívida abaixo do piso é adiada, não perdoada", () => {
    expect(decidirGate(1)).toBe("adiar");
  });

  it("adia o débito típico de cancelamento no 2º dia (~R$ 2,60)", () => {
    expect(decidirGate(260)).toBe("adiar");
  });

  it("um centavo abaixo do piso ainda é adiamento", () => {
    expect(decidirGate(PISO_COBRANCA_AVULSA_CENTAVOS - 1)).toBe("adiar");
  });

  it("EXATAMENTE no piso já cobra", () => {
    expect(decidirGate(PISO_COBRANCA_AVULSA_CENTAVOS)).toBe("cobrar");
  });

  it("a fronteira está em R$ 5,00 — o literal existe porque o piso é medido", () => {
    // Os dois casos acima importam a constante, então provam `<` vs `<=` e não
    // o NÚMERO: trocar 500 por 400 os mantém verdes. R$ 5,00 é o piso medido no
    // sandbox do Asaas (15/08/2026, Medição 6 do runbook em `infra/README.md`);
    // mudar a constante tem que ficar vermelho aqui, porque quem muda o número
    // está contradizendo uma medição do gateway, não uma escolha nossa.
    expect(decidirGate(499)).toBe("adiar");
    expect(decidirGate(500)).toBe("cobrar");
  });

  it("acima do piso cobra", () => {
    expect(decidirGate(1300)).toBe("cobrar");
  });

  it("dois débitos pequenos que somam acima do piso passam a ser cobráveis", () => {
    // É a acumulação inteira em uma linha: 260 sozinho adia; 260 + 260 cobra.
    // Sem isso, cancelar de dois em dois dias seria uso gratuito ilimitado.
    expect(decidirGate(260)).toBe("adiar");
    expect(decidirGate(260 + 260)).toBe("cobrar");
  });

  it("aceita piso injetado, para o dia em que o gateway mudar o piso", () => {
    // `PISO_COBRANCA_AVULSA_CENTAVOS` é medição (R$ 5,00, sandbox do Asaas em
    // 15/08/2026), não escolha conservadora. O parâmetro segue existindo porque
    // o piso é do gateway: se o Asaas mudá-lo, acompanhar o número não pode
    // exigir tocar na regra.
    expect(decidirGate(300, 100)).toBe("cobrar");
    expect(decidirGate(300, 1000)).toBe("adiar");
  });
});
