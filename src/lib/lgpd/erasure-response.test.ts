import { describe, it, expect } from "vitest";
import { gerarMensagemConfirmacaoEliminacao } from "./erasure-response";

describe("gerarMensagemConfirmacaoEliminacao", () => {
  it("menciona o titular, a data/hora e o ciclo de 30 dias do backup", () => {
    const dataHora = new Date("2026-08-02T14:30:00Z");
    const msg = gerarMensagemConfirmacaoEliminacao("Maria Souza", dataHora);
    expect(msg).toContain("Maria Souza");
    expect(msg).toContain("2026-08-02T14:30:00.000Z");
    expect(msg).toContain("30 dias");
  });
});
