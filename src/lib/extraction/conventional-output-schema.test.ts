import { describe, expect, test } from "vitest";
import { conventionalOutputSchema } from "./conventional-output-schema";
import {
  TC1,
  TC2,
  TC3,
  TC4,
  TC5A,
  TC5B,
} from "./__fixtures__/eval-terapia-convencional";

describe("conventionalOutputSchema — as 5 saídas do eval TC parseiam", () => {
  // Critério do P0/B3: antes da reconciliação do `alerta_risco`, TODAS as 5
  // saídas esperadas do doc falhavam no parse — inclusive a do TC-2, que é
  // violência. Este bloco é o oráculo dessa reconciliação.
  test.each([
    ["TC-1", TC1],
    ["TC-2", TC2],
    ["TC-3", TC3],
    ["TC-4", TC4],
    ["TC-5a", TC5A],
    ["TC-5b", TC5B],
  ])("%s parseia sem erro", (_nome, saida) => {
    expect(() => conventionalOutputSchema.parse(saida)).not.toThrow();
  });
});

describe("TC-4 — array vazio é resposta válida, não falha", () => {
  test("tema_recorrente_sinalizado: [] sobrevive ao parse como array vazio", () => {
    const out = conventionalOutputSchema.parse(TC4);
    // Mata a mutação "tratar [] como ausência e preencher com algo": se o
    // schema exigisse ao menos um item, o parse acima já teria lançado; se
    // aplicasse um default não-vazio, o length seria != 0.
    expect(out.tema_recorrente_sinalizado).toEqual([]);
  });
});

describe("TC-5a / TC-5b — nenhum campo é achatado ou perdido", () => {
  test("cada item de temas[] preserva o SEU trecho_fonte", () => {
    const out = conventionalOutputSchema.parse(TC5A);
    expect(out.temas).toHaveLength(2);
    // Achatar `temas` numa lista de strings (ou guardar um trecho único para o
    // conjunto) mataria esta asserção: os dois trechos são distintos.
    expect(out.temas[0]!.trecho_fonte).toBe(
      "o pai ligou na quarta, depois de uns oito meses sem nenhum contato",
    );
    expect(out.temas[1]!.trecho_fonte).toBe(
      "ele deslocou rapidamente para uma questão do trabalho — a mesma resistência de sempre quando o pai entra na sessão",
    );
    expect(out.temas[0]!.trecho_fonte).not.toBe(out.temas[1]!.trecho_fonte);
  });

  test("padrao_participacao_verbal continua OBJETO (presente + descricao), não booleano", () => {
    const out = conventionalOutputSchema.parse(TC5B);
    expect(out.padrao_participacao_verbal.presente).toBe(true);
    expect(out.padrao_participacao_verbal.descricao).toContain(
      "saiu do contato",
    );
  });

  test("tema_recorrente_sinalizado preserva observacao E trecho_fonte por item", () => {
    const out = conventionalOutputSchema.parse(TC5B);
    expect(out.tema_recorrente_sinalizado).toHaveLength(2);
    expect(out.tema_recorrente_sinalizado[1]!.observacao).toContain(
      "terceira vez seguida",
    );
    expect(out.tema_recorrente_sinalizado[1]!.trecho_fonte).toBe(
      "chegou 15 minutos atrasado, terceira vez seguida",
    );
  });
});

describe("TC-1 / TC-3 — presente:false com descricao:null", () => {
  test("TC-1: presente false + descricao null é forma válida", () => {
    const out = conventionalOutputSchema.parse(TC1);
    expect(out.padrao_participacao_verbal).toEqual({
      presente: false,
      descricao: null,
    });
  });

  test("TC-3: presente true exige descricao textual", () => {
    const out = conventionalOutputSchema.parse(TC3);
    expect(out.padrao_participacao_verbal.presente).toBe(true);
    expect(out.padrao_participacao_verbal.descricao).toContain(
      "verbalizou pouco",
    );
  });

  test("descricao ausente (undefined) NÃO passa por null — o campo é obrigatório", () => {
    const semDescricao = {
      ...(TC1 as Record<string, unknown>),
      padrao_participacao_verbal: { presente: false },
    };
    expect(() => conventionalOutputSchema.parse(semDescricao)).toThrow();
  });
});

describe("ausência de risco = campo omitido (não existe presente: boolean)", () => {
  test("TC-1 não traz alerta_risco e isso é sucesso", () => {
    const out = conventionalOutputSchema.parse(TC1);
    expect(out.alerta_risco).toBeUndefined();
  });

  test("a forma ANTIGA do doc (presente/categoria null) é REJEITADA", () => {
    // Regressão do achado B3: se alguém reintroduzir `presente: boolean` com
    // campos anuláveis, o parse tem que quebrar — não degradar em silêncio.
    const formaAntiga = {
      ...(TC1 as Record<string, unknown>),
      alerta_risco: {
        presente: false,
        categoria: null,
        trecho_fonte: null,
        detalhe: null,
      },
    };
    expect(() => conventionalOutputSchema.parse(formaAntiga)).toThrow();
  });
});

describe("alerta_risco é ESTRITO — nunca degrada em silêncio", () => {
  test("risco com severidade fora do domínio invalida a saída inteira", () => {
    const severidadeInventada = {
      ...(TC2 as Record<string, unknown>),
      alerta_risco: {
        categoria: "violencia_sofrida",
        severidade: "gravissima",
        trecho_fonte: "x",
        detalhe: "y",
      },
    };
    // Se isto passasse, `app_criar_alerta_risco` receberia uma severidade que
    // o banco não conhece e o prazo do alerta sairia errado.
    expect(() => conventionalOutputSchema.parse(severidadeInventada)).toThrow();
  });

  test("risco emitido na forma R20 (dentro de sinalizacoes) é LEVANTADO, não engolido", () => {
    // Mesmo preprocess do contrato ABA: o `.catch([])` de `sinalizacoes`
    // degradaria um risco malformado para vazio sem esta normalização.
    const viaSinalizacao = {
      ...(TC1 as Record<string, unknown>),
      sinalizacoes: [
        {
          tipo: "risco_seguranca",
          categoria: "ideacao_suicida",
          severidade: "ideacao_ativa_sem_plano",
          trecho_fonte: "disse que já pensou em se matar",
          detalhe: "Paciente relata ideação sem plano descrito.",
        },
      ],
    };
    const out = conventionalOutputSchema.parse(viaSinalizacao);
    expect(out.alerta_risco?.categoria).toBe("ideacao_suicida");
    expect(out.alerta_risco?.severidade).toBe("ideacao_ativa_sem_plano");
  });
});

describe("resumo_sessao é o artefato — vazio não passa", () => {
  test("resumo_sessao em branco lança (o bug B3 era gravar artefato oco)", () => {
    const vazio = { ...(TC4 as Record<string, unknown>), resumo_sessao: "" };
    expect(() => conventionalOutputSchema.parse(vazio)).toThrow();
  });

  test("resumo_sessao ausente lança", () => {
    const { resumo_sessao: _omitido, ...semResumo } = TC4 as Record<
      string,
      unknown
    >;
    expect(() => conventionalOutputSchema.parse(semResumo)).toThrow();
  });
});
