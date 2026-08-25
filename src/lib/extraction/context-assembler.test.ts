import { describe, expect, test } from "vitest";
import { buildCanonicalContext } from "./context-assembler";

const input = {
  paciente: { idadeMeses: 60 },
  protocolos: [
    {
      familia: "vbmapp",
      nome: "VB-MAPP",
      disciplina: "ABA",
      taxonomiaAjuda: ["independente", "dica_verbal", "dica_ecoica"],
      dominios: [
        { dominioId: "mando", nome: "Mando", nivel: "1" },
        { dominioId: "tato", nome: "Tato", nivel: "1" },
      ],
    },
  ],
  metas: [
    {
      id: "g_01",
      descricao: "Emitir mando vocal para 5 itens",
      disciplina: "ABA",
      mapeamentos: [{ familia: "vbmapp", dominioId: "mando", nivel: "1" }],
    },
  ],
  historico: [
    {
      dominioId: "tato",
      protocolFamilia: "vbmapp",
      resumo: "nunca sem dica ecoica",
    },
  ],
};

describe("buildCanonicalContext", () => {
  test("monta o contrato canônico (protocolos-e-agente.md Parte 2)", () => {
    const ctx = buildCanonicalContext(input);
    expect(ctx.paciente.idade_meses).toBe(60);
    expect(ctx.protocolos_ativos[0]!.protocol_id).toBe("vbmapp");
    expect(ctx.protocolos_ativos[0]!.taxonomia_ajuda).toContain("dica_ecoica");
    expect(ctx.protocolos_ativos[0]!.dominios[0]!.dominio_id).toBe("mando");
  });

  test("mapeia metas ativas com mapeamento a protocol_id/dominio_id do agente", () => {
    const ctx = buildCanonicalContext(input);
    const meta = ctx.paciente.metas_ativas[0]!;
    expect(meta.goal_id).toBe("g_01");
    expect(meta.mapeamentos[0]!.protocol_id).toBe("vbmapp");
    expect(meta.mapeamentos[0]!.dominio_id).toBe("mando");
  });

  test("historico_relevante usa protocol_id (familia), habilitando R14", () => {
    const ctx = buildCanonicalContext(input);
    expect(ctx.historico_relevante[0]!.protocol_id).toBe("vbmapp");
    expect(ctx.historico_relevante[0]!.dominio_id).toBe("tato");
  });

  test("historico vazio é válido (1ªs sessões do paciente: R14 dormente)", () => {
    const ctx = buildCanonicalContext({ ...input, historico: [] });
    expect(ctx.historico_relevante).toEqual([]);
  });

  test("protocolo ABA sem tipoColeta explícito mapeia para 'por_sessao' (#393, default explícito)", () => {
    const ctx = buildCanonicalContext(input);
    expect(ctx.protocolos_ativos[0]!.tipo_coleta).toBe("por_sessao");
  });

  test("protocolo com tipoColeta='escala_padronizada_intervalar' preserva o valor (#393, instrumento PHQ-9/GAD-7)", () => {
    const ctx = buildCanonicalContext({
      ...input,
      protocolos: [
        {
          ...input.protocolos[0]!,
          familia: "phq9",
          nome: "PHQ-9",
          disciplina: "TCC",
          tipoColeta: "escala_padronizada_intervalar",
        },
      ],
    });
    expect(ctx.protocolos_ativos[0]!.tipo_coleta).toBe(
      "escala_padronizada_intervalar",
    );
  });

  test("familiaAbordagem presente vira familia_abordagem no contrato (#331)", () => {
    const ctx = buildCanonicalContext({
      ...input,
      familiaAbordagem: "psicodinamica",
    });
    expect(ctx.familia_abordagem).toBe("psicodinamica");
  });

  test("familiaAbordagem ausente nunca vira null explícito — chave omitida (#331)", () => {
    const ctx = buildCanonicalContext(input);
    expect(ctx.familia_abordagem).toBeUndefined();
    expect("familia_abordagem" in ctx).toBe(false);
  });
});
