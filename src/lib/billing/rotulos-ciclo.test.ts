import { describe, expect, it } from "vitest";
import { billingCycleStatus } from "@/db/schema";
import { ROTULOS_CICLO } from "./rotulos-ciclo";

describe("ROTULOS_CICLO", () => {
  it("cobre TODO valor do enum billing_cycle_status", () => {
    // Enum novo sem rótulo renderiza o status cru do banco na tela da clínica.
    // Este caso é o que impede isso — e ele lê o enum do schema, não uma cópia.
    expect(Object.keys(ROTULOS_CICLO).sort()).toEqual(
      [...billingCycleStatus.enumValues].sort(),
    );
  });

  it("não usa a variante de sucesso para estado de falha", () => {
    expect(ROTULOS_CICLO.falhou.variante).toBe("error");
    expect(ROTULOS_CICLO.devido.variante).toBe("warning");
    expect(ROTULOS_CICLO.pago.variante).toBe("success");
  });
});
