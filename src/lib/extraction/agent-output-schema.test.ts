import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  agentOutputSchema,
  SINALIZACAO_TIPO_CANONICOS,
  tipoExtracaoEnum,
} from "./agent-output-schema";

// Saída mínima válida — sessão sem evidências (Caso 5: `extracoes: []` é sucesso).
const vazio = {
  extracoes: [],
  resumo_sessao: "Diário genérico, nada a extrair sem inferir.",
  sinalizacoes: [
    { tipo: "texto_ambiguo", detalhe: "Registro sem evento concreto." },
  ],
};

// Extração de evidência bem-formada (fatia do Caso 2, Sofia).
const comEvidencia = {
  extracoes: [
    {
      tipo: "evidencia",
      confianca: "alta",
      trecho_fonte: "Inicialmente ela só puxava minha mão",
      evidencia: {
        descricao: "Mando não-verbal para pedir continuação do balanço",
        polaridade: "positiva",
        funcao: "mando",
        alvos: [{ protocol_id: "vbmapp", dominio_id: "mando" }],
        nivel_ajuda: "independente",
        resultado: "acerto",
        topografia: "fisico",
        ambiente: "estruturado",
      },
    },
  ],
  resumo_sessao: "1 mando não-verbal independente.",
};

describe("agentOutputSchema", () => {
  test("aceita saída vazia (sessão sem evidências) com sinalização", () => {
    expect(agentOutputSchema.safeParse(vazio).success).toBe(true);
  });

  test("aceita extração de evidência bem-formada", () => {
    expect(agentOutputSchema.safeParse(comEvidencia).success).toBe(true);
  });

  test("aceita sinalizacoes ausente (opcional)", () => {
    const { sinalizacoes, ...semSinal } = vazio;
    expect(agentOutputSchema.safeParse(semSinal).success).toBe(true);
  });

  test("rejeita quando falta resumo_sessao (required)", () => {
    const r = agentOutputSchema.safeParse({ extracoes: [] });
    expect(r.success).toBe(false);
  });

  test("rejeita confianca fora do enum", () => {
    const bad = {
      ...comEvidencia,
      extracoes: [{ ...comEvidencia.extracoes[0], confianca: "altíssima" }],
    };
    expect(agentOutputSchema.safeParse(bad).success).toBe(false);
  });

  test("rejeita tipo de extração fora do enum", () => {
    const bad = {
      ...comEvidencia,
      extracoes: [{ ...comEvidencia.extracoes[0], tipo: "pontuacao" }],
    };
    expect(agentOutputSchema.safeParse(bad).success).toBe(false);
  });

  test("tolera sinalizacao com tipo desconhecido (modelo inventa rótulo) sem afundar a saída", () => {
    // Achado do teste vivo: o modelo às vezes cria um tipo de sinalização fora
    // dos 3 canônicos. Sinalizações são advisory — não podem invalidar a
    // extração clínica inteira.
    const drift = {
      extracoes: [],
      resumo_sessao: "Registro pobre.",
      sinalizacoes: [
        {
          tipo: "registro_pobre_em_detalhes",
          detalhe: "Poucos eventos concretos.",
        },
      ],
    };
    expect(agentOutputSchema.safeParse(drift).success).toBe(true);
  });

  test("rejeita extração sem trecho_fonte (R2: sem trecho, não há extração)", () => {
    const semTrecho = { ...comEvidencia.extracoes[0] } as Record<
      string,
      unknown
    >;
    delete semTrecho.trecho_fonte;
    const bad = { ...comEvidencia, extracoes: [semTrecho] };
    expect(agentOutputSchema.safeParse(bad).success).toBe(false);
  });
});

// ─── #390 — sincronização doc-vs-Zod (R1) ─────────────────────────────────────
// O doc (output-schema.json) deve ser subconjunto/igual ao que o Zod aceita em
// extracoes[].tipo e sinalizacoes[].tipo. Escopo comparado é Zod-vs-doc, não
// Zod-vs-PG: `pendente` (legado do NullProvider) nunca esteve no doc nem no
// Zod, então nem aparece nesta comparação — não precisa de exceção.
describe("sincronização doc-vs-Zod (#390 R1)", () => {
  const outputSchemaJson = JSON.parse(
    readFileSync(
      path.join(process.cwd(), "docs/agente/output-schema.json"),
      "utf8",
    ),
  ) as {
    properties: {
      extracoes: { items: { properties: { tipo: { enum: string[] } } } };
      sinalizacoes: { items: { properties: { tipo: { enum: string[] } } } };
      alerta_risco: unknown;
    };
  };

  test("extracoes[].tipo do doc é exatamente o enum aceito pelo Zod", () => {
    const doZod = [...tipoExtracaoEnum.options].sort();
    const doDoc = [
      ...outputSchemaJson.properties.extracoes.items.properties.tipo.enum,
    ].sort();
    expect(doDoc).toEqual(doZod);
  });

  test("sinalizacoes[].tipo do doc é subconjunto dos canônicos conhecidos pelo Zod (campo é string livre em runtime)", () => {
    const doDoc =
      outputSchemaJson.properties.sinalizacoes.items.properties.tipo.enum;
    for (const tipo of doDoc) {
      expect(SINALIZACAO_TIPO_CANONICOS).toContain(tipo);
    }
    // E o inverso: todo canônico conhecido pelo Zod está documentado.
    expect([...doDoc].sort()).toEqual(
      [...SINALIZACAO_TIPO_CANONICOS].sort(),
    );
  });

  test("doc documenta alerta_risco (antes ausente do doc)", () => {
    expect(outputSchemaJson.properties.alerta_risco).toBeDefined();
  });
});

// ─── #390 R6 — item_risco_positivo: null sobrevive ao parse ──────────────────
describe("aplicacao_escala_relatada.item_risco_positivo (#390 R6)", () => {
  const base = {
    extracoes: [] as unknown[],
    resumo_sessao: "PHQ-9 aplicado, item de risco não respondido.",
  };

  test("null sobrevive ao parse como null, nunca vira false", () => {
    const entrada = {
      ...base,
      extracoes: [
        {
          tipo: "aplicacao_escala_relatada",
          confianca: "alta",
          trecho_fonte: "Paciente pulou o item de risco do PHQ-9.",
          aplicacao_escala_relatada: {
            protocol_id: "phq9",
            escore_relatado: null,
            fonte_do_escore: "nao_informado",
            item_risco_positivo: null,
          },
        },
      ],
    };
    const r = agentOutputSchema.parse(entrada) as {
      extracoes: Array<{
        aplicacao_escala_relatada?: { item_risco_positivo: unknown };
      }>;
    };
    const extracao = r.extracoes[0]!;
    expect(extracao.aplicacao_escala_relatada?.item_risco_positivo).toBeNull();
    expect(extracao.aplicacao_escala_relatada?.item_risco_positivo).not.toBe(
      false,
    );
  });

  test("false explícito permanece false (não é o mesmo que null)", () => {
    const entrada = {
      ...base,
      extracoes: [
        {
          tipo: "aplicacao_escala_relatada",
          confianca: "alta",
          trecho_fonte: "Item de risco respondido com '0 - nenhuma vez'.",
          aplicacao_escala_relatada: {
            item_risco_positivo: false,
          },
        },
      ],
    };
    const r = agentOutputSchema.parse(entrada) as {
      extracoes: Array<{
        aplicacao_escala_relatada?: { item_risco_positivo: unknown };
      }>;
    };
    expect(r.extracoes[0]!.aplicacao_escala_relatada?.item_risco_positivo).toBe(
      false,
    );
  });
});

// ─── #390 R7 — regressão: risco_seguranca continua promovido a alerta_risco ──
describe("promoção de sinalizacoes[risco_seguranca] para alerta_risco (#390 R7)", () => {
  test("sinalização risco_seguranca vira alerta_risco estruturado", () => {
    const entrada = {
      extracoes: [],
      resumo_sessao: "Paciente relatou ideação suicida ativa sem plano.",
      sinalizacoes: [
        {
          tipo: "risco_seguranca",
          categoria: "ideacao_suicida",
          severidade: "ideacao_ativa_sem_plano",
          trecho_fonte: "penso em morrer, mas não tenho um plano",
          detalhe: "Ideação ativa sem plano relatada explicitamente.",
        },
      ],
    };
    const r = agentOutputSchema.parse(entrada) as {
      alerta_risco: { categoria: string; severidade: string } | null;
    };
    expect(r.alerta_risco).not.toBeNull();
    expect(r.alerta_risco?.categoria).toBe("ideacao_suicida");
    expect(r.alerta_risco?.severidade).toBe("ideacao_ativa_sem_plano");
  });

  test("alerta_risco já presente não é sobrescrito pela sinalização", () => {
    const entrada = {
      extracoes: [],
      resumo_sessao: "Duplo sinal de risco.",
      sinalizacoes: [
        {
          tipo: "risco_seguranca",
          categoria: "autolesao",
          severidade: "autolesao_recente",
          trecho_fonte: "trecho da sinalização",
          detalhe: "detalhe da sinalização",
        },
      ],
      alerta_risco: {
        categoria: "violencia_sofrida",
        severidade: "violencia_sofrida",
        trecho_fonte: "trecho do alerta direto",
        detalhe: "detalhe do alerta direto",
      },
    };
    const r = agentOutputSchema.parse(entrada) as {
      alerta_risco: { categoria: string } | null;
    };
    expect(r.alerta_risco?.categoria).toBe("violencia_sofrida");
  });
});

// ─── #390 R5 — fixture real: Caso TC-1 (casos-de-teste-terapia-convencional.md)
// A fixture do doc usa a forma ANTIGA de alerta_risco
// (`{presente: boolean, categoria, trecho_fonte, detalhe}`) e `temas[]` como
// array de OBJETOS ({tema, trecho_fonte}) — ambos predatam #122/R20 e a
// decisão desta issue. Adaptados aqui: `presente: false` → `alerta_risco:
// null`; `temas[]` de objeto → array de strings (só o texto do tema, forma
// fechada em #390). `tema_recorrente_sinalizado` e `padrao_participacao_verbal`
// não fazem parte do contrato atual (CONVENTIONAL_SYSTEM_PROMPT não os
// promete) e foram omitidos da fixture adaptada.
describe("fixture real — Caso TC-1 (#390 R5)", () => {
  test("saída adaptada do Caso TC-1 valida contra agentOutputSchema", () => {
    const casoTc1Adaptado = {
      extracoes: [],
      resumo_sessao:
        "Paciente relatou primeiro contato com pertences do pai sem chorar durante o processo, embora tenha chorado depois, sozinha. Retomou o tema da culpa por não ter chegado a tempo ao hospital, já presente em sessões anteriores. Segue retomando gradualmente as atividades de trabalho, evitando especificamente situações de falar em público. Encerrou a sessão relatando sensação de melhora.",
      temas: [
        "luto do pai — culpa por ausência no momento da morte",
        "retomada gradual da rotina de trabalho",
      ],
      alerta_risco: null,
      sinalizacoes: [],
    };
    const r = agentOutputSchema.safeParse(casoTc1Adaptado);
    // Usar `r.error` no assert expõe o motivo real caso o Zod rejeite, em vez
    // de devolver apenas `expected true, received false` (nit Jules #399).
    expect(r.error).toBeUndefined();
    expect(r.success).toBe(true);

  });
});
