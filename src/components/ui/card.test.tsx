import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "./card";

/**
 * O selo do `Card` afirma um FATO sobre o conteúdo do cartão. Enquanto o
 * `badgeNode` nascia no `else` final da cadeia, todo cartão que não declarava
 * estado — a maioria: assinatura, briefing, relatórios, checklist de
 * onboarding — vinha com um `Pill` menta "Conquistado ✓" por cima de conteúdo
 * que dizia o contrário ("Nenhuma sessão anterior registrada ainda",
 * "0 de 5 concluídos").
 *
 * Estes testes fixam a regra: o selo é OPT-IN. Só quem declara o estado ganha
 * o selo correspondente; `fact` (o default) não afirma nada.
 */
describe("Card — selo de estado epistêmico", () => {
  it("cartão sem estado declarado não estampa selo de conquista", () => {
    render(
      <Card titulo="Última sessão">
        Nenhuma sessão anterior registrada ainda para este paciente.
      </Card>,
    );

    expect(screen.queryByText("Conquistado")).toBeNull();
  });

  it('estado "fact" é o default e continua sem selo', () => {
    render(
      <Card epistemicState="fact" titulo="Histórico de Exportações">
        Nenhuma exportação registrada.
      </Card>,
    );

    expect(screen.queryByText("Conquistado")).toBeNull();
  });

  it('estado "conquistado" estampa o selo — é o único que afirma feito', () => {
    render(
      <Card estado="conquistado" titulo="Protocolo VB-MAPP">
        Prescrito e vigente.
      </Card>,
    );

    expect(screen.queryByText("Conquistado")).not.toBeNull();
  });

  it("sugerida e candidata mantêm os próprios selos", () => {
    const { unmount } = render(
      <Card epistemicState="sugerida" titulo="Meta sugerida">
        Derivada da última sessão.
      </Card>,
    );
    expect(screen.queryByText("Sugerido")).not.toBeNull();
    unmount();

    render(
      <Card epistemicState="candidata" titulo="Marco candidato">
        Aguardando validação.
      </Card>,
    );
    expect(screen.queryByText("Candidato")).not.toBeNull();
  });
});
