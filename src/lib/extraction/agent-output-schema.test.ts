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
    expect([...doDoc].sort()).toEqual([...SINALIZACAO_TIPO_CANONICOS].sort());
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

// ─── #390 R5 / D47 — fixtures reais: Modo Convencional (casos-de-teste-terapia-convencional.md)
// Fixtures sincronizadas com o contrato canônico unificado (D47):
// `alerta_risco: null` em ausência de risco (TC-1) e objeto completo
// `{categoria, severidade, certeza, trecho_fonte, detalhe}` quando presente (TC-2);
// `temas: string[]`. `tema_recorrente_sinalizado` e `padrao_participacao_verbal`
// são conceitos documentais da modalidade e não fazem parte do contrato de runtime
// (`CONVENTIONAL_SYSTEM_PROMPT` não os promete).
describe("fixtures reais — Modo Convencional (#390 R5 / D47)", () => {
  test("saída do Caso TC-1 (sem risco) valida contra agentOutputSchema", () => {
    const casoTc1 = {
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
    const r = agentOutputSchema.safeParse(casoTc1);
    expect(r.error).toBeUndefined();
    expect(r.success).toBe(true);
  });

  test("saída do Caso TC-2 (com alerta_risco unificado) valida contra agentOutputSchema", () => {
    const casoTc2 = {
      extracoes: [],
      resumo_sessao:
        "Paciente relatou episódio recente em que o marido a segurou pelo braço com força, deixando marca, para impedi-la de sair de casa durante uma discussão. Relatou que episódios semelhantes já ocorreram algumas vezes por ano desde o casamento, associados a consumo de álcool pelo marido. Minimizou a gravidade do relato e não expressou intenção de terminar o relacionamento. Mudou de assunto para comentar positivamente sobre novo emprego.",
      temas: ["violência física recorrente no relacionamento conjugal"],
      alerta_risco: {
        categoria: "violencia_sofrida",
        severidade: "violencia_sofrida",
        certeza: "explicito",
        trecho_fonte:
          "ele a segurou pelo braço com força para impedi-la de sair de casa e deixou marca",
        detalhe:
          "Paciente relata episódio recente de violência física por parte do cônjuge, com marca visível, e confirma recorrência ('algumas vezes por ano, desde o casamento'). Paciente minimiza a gravidade e não expressa intenção de buscar afastamento — registrado literalmente, sem inferir risco além do relatado.",
      },
      sinalizacoes: [
        {
          tipo: "texto_ambiguo",
          detalhe:
            "Paciente minimizou o relato ('meio rindo', 'não é nada novo') — o alerta é mantido integralmente apesar da minimização, conforme R5-TC (falso positivo aceitável, falso negativo não).",
        },
      ],
    };
    const r = agentOutputSchema.safeParse(casoTc2);
    expect(r.error).toBeUndefined();
    expect(r.success).toBe(true);
  });
});

// ─── D47 — guard executável contra re-drift do eval set ─────────────────────
// O que fechou o D47 foi um alinhamento MANUAL entre três artefatos
// (`agentOutputSchema`, o doc do protocolo e as fixtures do eval set). Sem um
// guard, o próximo edit em qualquer um dos três dessincroniza de novo em
// silêncio — foi exatamente assim que o D47 nasceu. Os testes acima usam CÓPIAS
// das fixtures: cópia não protege o doc, ela só protege a si mesma.
//
// Este bloco lê o arquivo do eval set e valida TODA saída esperada contra o
// schema de runtime. Ele não descreve o que o doc deveria conter; ele mede o
// que o doc contém.
describe("eval set do modo convencional valida contra agentOutputSchema (D47)", () => {
  const evalSet = readFileSync(
    path.join(
      process.cwd(),
      "docs/agente/casos-de-teste-terapia-convencional.md",
    ),
    "utf8",
  ).split(/\r?\n/);

  // Um bloco ```json só é "saída esperada" se o heading vigente disser isso —
  // os blocos de "Contexto" são transcrições de sessão, não saída do agente.
  const saidasEsperadas: { rotulo: string; corpo: string }[] = [];
  let headingVigente = "";
  let blocoAberto: { inicio: number; corpo: string[] } | null = null;
  evalSet.forEach((linha, i) => {
    if (blocoAberto === null) {
      if (linha.startsWith("#")) headingVigente = linha.replace(/^#+\s*/, "");
      if (linha.trim() === "```json")
        blocoAberto = { inicio: i + 1, corpo: [] };
      return;
    }
    const bloco: { inicio: number; corpo: string[] } = blocoAberto;
    if (linha.trim() !== "```") {
      bloco.corpo.push(linha);
      return;
    }
    if (/sa[íi]da esperada/i.test(headingVigente)) {
      saidasEsperadas.push({
        rotulo: `${headingVigente} (linha ${bloco.inicio})`,
        corpo: bloco.corpo.join("\n"),
      });
    }
    blocoAberto = null;
  });

  // Trava a contagem: um caso novo sem saída esperada, ou um heading renomeado
  // que faça o extrator parar de casar, zeraria a lista e deixaria este
  // describe verde sem validar nada.
  test("extrai as 6 saídas esperadas (TC-1..TC-5b)", () => {
    expect(saidasEsperadas).toHaveLength(6);
  });

  test.each(saidasEsperadas.map((s) => [s.rotulo, s.corpo]))(
    "%s valida contra agentOutputSchema",
    (_rotulo, corpo) => {
      const r = agentOutputSchema.safeParse(JSON.parse(corpo));
      expect(r.error).toBeUndefined();
      expect(r.success).toBe(true);
    },
  );
});
