import { describe, expect, it } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { TrilhaTabela } from "./trilha-tabela";
import type { LinhaTrilha } from "./queries";

const LINHAS: LinhaTrilha[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    quando: "23/08/2026, 14:02",
    ator: "Ana Coordenadora",
    acao: "Paciente arquivado",
    entidade: "Paciente",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    quando: "23/08/2026, 09:15",
    ator: "Sistema",
    acao: "Paciente arquivado pelo sistema",
    entidade: "Paciente",
  },
];

describe("TrilhaTabela", () => {
  it("renderiza uma linha por registro, com rótulo humano e não o slug", () => {
    render(<TrilhaTabela linhas={LINHAS} />);
    expect(screen.getByText("Paciente arquivado")).toBeTruthy();
    expect(screen.getByText("Sistema")).toBeTruthy();
    expect(screen.queryByText(/paciente_arquivado/)).toBeNull();
  });

  /**
   * A régua do vazamento. O tipo `LinhaTrilha` não tem `detalhe`, `patientId`
   * nem `entidadeId` — e este teste afirma que o HTML servido também não os
   * carrega. Foi exatamente por aqui que o PR #448 vazou: campo presente no
   * objeto, ausente na tela, legível no `view-source`.
   */
  it("não emite campo que a tela não desenha", () => {
    const { container } = render(<TrilhaTabela linhas={LINHAS} />);
    const html = container.innerHTML;
    for (const proibido of [
      "detalhe",
      "patient_id",
      "patientId",
      "entidade_id",
    ]) {
      expect(html).not.toContain(proibido);
    }
    // Nenhum UUID no HTML: `id` é chave de React, não conteúdo renderizado.
    expect(html).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
    );
  });

  it("página vazia é empty state, e diz por que pode estar vazia", () => {
    render(<TrilhaTabela linhas={[]} />);
    expect(screen.getByText("Nenhum registro nesta página")).toBeTruthy();
    expect(screen.getByText(/180 dias/)).toBeTruthy();
  });

  it("cabeçalhos de coluna têm escopo declarado", () => {
    render(<TrilhaTabela linhas={LINHAS} />);
    for (const rotulo of ["Quando", "Quem", "O que aconteceu", "Onde"]) {
      expect(
        screen
          .getByRole("columnheader", { name: rotulo })
          .getAttribute("scope"),
      ).toBe("col");
    }
  });

  it("não tem violação de acessibilidade", async () => {
    const { container } = render(<TrilhaTabela linhas={LINHAS} />);
    const resultado = await axe.run(container, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
      rules: {
        region: { enabled: false },
        "landmark-one-main": { enabled: false },
        "page-has-heading-one": { enabled: false },
        // jsdom não renderiza cores; contraste é validado à parte (paleta AAA).
        "color-contrast": { enabled: false },
      },
    });
    expect(resultado.violations).toEqual([]);
  });
});
