import { describe, expect, it } from "vitest";
import {
  classificarDivergenciaCiclo,
  classificarDivergenciaVinculo,
} from "./conciliacao";

function ciclo(
  over: Partial<Parameters<typeof classificarDivergenciaCiclo>[0]> = {},
) {
  return {
    statusLocal: "aguardando_pagamento",
    valorLocalCentavos: 10_000,
    agrupaDebito: false,
    remoto: {
      encontrada: true as const,
      status: "pendente" as const,
      valorCentavos: 10_000,
    },
    ...over,
  };
}

describe("classificarDivergenciaCiclo", () => {
  it("não acusa nada quando local e gateway concordam", () => {
    expect(classificarDivergenciaCiclo(ciclo())).toBeNull();
    expect(
      classificarDivergenciaCiclo(
        ciclo({
          statusLocal: "pago",
          remoto: { encontrada: true, status: "paga", valorCentavos: 10_000 },
        }),
      ),
    ).toBeNull();
    expect(
      classificarDivergenciaCiclo(
        ciclo({
          statusLocal: "falhou",
          remoto: {
            encontrada: true,
            status: "recusada",
            valorCentavos: 10_000,
          },
        }),
      ),
    ).toBeNull();
  });

  it("cobrança que o gateway não conhece tem precedência sobre tudo", () => {
    expect(
      classificarDivergenciaCiclo(
        ciclo({ statusLocal: "pago", remoto: { encontrada: false } }),
      ),
    ).toBe("cobranca_inexistente_no_gateway");
  });

  it("dinheiro entrou e o ciclo não virou pago", () => {
    for (const statusLocal of [
      "apurado",
      "cobrado",
      "falhou",
      "aguardando_pagamento",
      "devido",
    ]) {
      expect(
        classificarDivergenciaCiclo(
          ciclo({
            statusLocal,
            remoto: { encontrada: true, status: "paga", valorCentavos: 10_000 },
          }),
        ),
      ).toBe("pagamento_nao_conciliado");
    }
  });

  it("recusa no gateway que o ciclo ainda não registrou", () => {
    expect(
      classificarDivergenciaCiclo(
        ciclo({
          statusLocal: "aguardando_pagamento",
          remoto: {
            encontrada: true,
            status: "recusada",
            valorCentavos: 10_000,
          },
        }),
      ),
    ).toBe("recusa_nao_aplicada");
  });

  it("estorno tem precedência sobre pago_sem_lastro", () => {
    expect(
      classificarDivergenciaCiclo(
        ciclo({
          statusLocal: "pago",
          remoto: {
            encontrada: true,
            status: "estornada",
            valorCentavos: 10_000,
          },
        }),
      ),
    ).toBe("estorno_nao_tratado");
  });

  it("ciclo pago sem pagamento correspondente no gateway", () => {
    expect(
      classificarDivergenciaCiclo(
        ciclo({
          statusLocal: "pago",
          remoto: {
            encontrada: true,
            status: "pendente",
            valorCentavos: 10_000,
          },
        }),
      ),
    ).toBe("pago_sem_lastro");
  });

  it("valor divergente é a menor precedência", () => {
    expect(
      classificarDivergenciaCiclo(ciclo({ valorLocalCentavos: 9_900 })),
    ).toBe("valor_divergente");
  });

  it("NÃO compara valor quando o ciclo é âncora de débito agrupado", () => {
    // A cobrança da âncora carrega a soma de N ciclos `devido`; comparar com o
    // `valor_centavos` de UM deles acusaria divergência em todo agrupamento.
    expect(
      classificarDivergenciaCiclo(
        ciclo({ agrupaDebito: true, valorLocalCentavos: 9_900 }),
      ),
    ).toBeNull();
  });

  it("âncora de débito ainda é conferida por STATUS", () => {
    expect(
      classificarDivergenciaCiclo(
        ciclo({
          agrupaDebito: true,
          statusLocal: "devido",
          remoto: { encontrada: true, status: "paga", valorCentavos: 30_000 },
        }),
      ),
    ).toBe("pagamento_nao_conciliado");
  });
});

describe("classificarDivergenciaVinculo", () => {
  it("não acusa nada quando concordam", () => {
    expect(classificarDivergenciaVinculo("active", "autorizada")).toBeNull();
    expect(
      classificarDivergenciaVinculo("setup_pending", "pendente"),
    ).toBeNull();
    expect(classificarDivergenciaVinculo("past_due", "autorizada")).toBeNull();
  });

  it("vínculo cancelado no gateway com assinatura viva aqui", () => {
    expect(classificarDivergenciaVinculo("active", "cancelada")).toBe(
      "vinculo_cancelado_no_gateway",
    );
    expect(classificarDivergenciaVinculo("past_due", "cancelada")).toBe(
      "vinculo_cancelado_no_gateway",
    );
  });

  it("vínculo pausado no gateway com assinatura ativa aqui", () => {
    expect(classificarDivergenciaVinculo("active", "pausada")).toBe(
      "vinculo_pausado_no_gateway",
    );
  });

  it("ativação autorizada no gateway que nunca chegou aqui", () => {
    expect(classificarDivergenciaVinculo("setup_pending", "autorizada")).toBe(
      "ativacao_nao_aplicada",
    );
  });

  it("assinatura ativa aqui sobre autorização que o gateway não deu", () => {
    expect(classificarDivergenciaVinculo("active", "pendente")).toBe(
      "vinculo_nao_autorizado",
    );
  });
});
