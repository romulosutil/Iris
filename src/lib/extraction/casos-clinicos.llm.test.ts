/**
 * Suíte automatizada dos 10 casos de `docs/agente/casos-de-teste-tcc.md`
 * (T1-T5) e `docs/agente/casos-de-teste-terapia-convencional.md` (TC-1..
 * TC-5), issue #395.
 *
 * CHAMA O GEMINI DE VERDADE. Isolada de `pnpm test`/CI por convenção própria
 * (`*.llm.test.ts`, `vitest.llm.config.ts`, `pnpm test:llm`) — mesmo
 * princípio de `*.int.test.ts` (memória `vitest-int-test-coleta-zero`), mas
 * aqui o custo é de API + latência de LLM, não de banco. Ver
 * `src/lib/extraction/llm-suite-global-setup.ts` para o gate (falha alto sem
 * GOOGLE_API_KEY, nunca pula em silêncio).
 *
 * DECISÃO DE PRODUTO (Rômulo, 18/08/26, reafirmada em 25/08/26 — D57):
 * produção (`resolveProvider`, provider.ts) usa Gemini via
 * `createGeminiInvoker("gemini-2.5-flash")`. Esta suíte roda contra o MESMO
 * invoker (`gemini-invoker.ts`), mas SEM passar `model` — herda o default
 * mais barato (`gemini-2.0-flash`, override via `GEMINI_TEST_MODEL`),
 * escolha CONSCIENTE por custo da suíte, não do produto. Isso significa que
 * uma falha aqui pode ser prompt frágil OU só o modelo mais barato seguindo
 * pior que o modelo de produção seguiria; a suíte não distingue as duas
 * leituras.
 *
 * Fixtures em `./casos-clinicos.fixtures.ts` — cada caso referencia o id no
 * `.md` de origem em vez de duplicar a prosa clínica inteira.
 *
 * O QUE ESTA SUÍTE NÃO FAZ: não chama `registrarAlertaRisco`/
 * `registrarAlertaRiscoRPDSugerido` (src/lib/risco/registrar.ts) — essas
 * funções exigem tenant/sessão/paciente reais via `withTenant` (SECURITY
 * DEFINER, Postgres) e pertencem à suíte de integração (`*.int.test.ts`),
 * não a uma suíte isolada só para custo de LLM. O que É verificado aqui é
 * que a saída do agente (`ExtractionResult.alertaRisco`) já passou pelo
 * MESMO `agentOutputSchema.parse` que `LlmExtractionProvider.extrair` usa em
 * produção — portanto tem exatamente a forma `AlertaRiscoAgente` que
 * `registrarAlertaRisco` exige no parâmetro `risco` (prova de tipo, não
 * reimplementação da regra).
 *
 * Armadilha evitada (memória `teste-verde-que-nao-testa-nada`): as
 * assertivas de AUSÊNCIA abaixo nunca comparam contra uma constante que o
 * próprio código de produção usa (ex.: não comparamos com
 * `SINALIZACAO_TIPO_CANONICOS` nem com nenhum enum interno) — usam listas de
 * palavras/valores escritas independentemente para esta suíte.
 */
import { describe, expect, test } from "vitest";
import { LlmExtractionProvider } from "./llm-provider";
import { createGeminiInvoker } from "./gemini-invoker";
import { agentOutputSchema, type AgentOutput } from "./agent-output-schema";
import {
  CONVENTIONAL_SYSTEM_PROMPT,
  TCC_SYSTEM_PROMPT,
  buildUserMessage,
} from "./prompt";
import type { ExtractionContext } from "./provider";
import {
  CASOS_TCC,
  CASO_T2B_DUAS_DISTORCOES_AMBIGUAS,
  PROBE_R1_TEXTO_VAGO,
  PROBE_R11_SEM_NUMERO,
  CASOS_CONVENCIONAL,
  CASO_TC5A,
  CASO_TC5B,
  type CasoTCC,
  type CasoConvencional,
} from "./casos-clinicos.fixtures";

function porId<T extends { id: string }>(lista: T[], id: string): T {
  const achado = lista.find((c) => c.id === id);
  if (!achado) throw new Error(`Caso ${id} não encontrado nas fixtures.`);
  return achado;
}

// ─── TCC: usa LlmExtractionProvider (produção real) — expõe drafts + alertaRisco ───

async function extrairTCC(caso: CasoTCC) {
  const provider = new LlmExtractionProvider(createGeminiInvoker());
  const ctx: ExtractionContext = {
    sessionId: `llm-suite-${caso.id}`,
    clinicId: "llm-suite-clinic",
    notaConsolidada: caso.diario,
    metasAtivas: [],
    contextoCanonico: caso.contexto,
  };
  return provider.extrair(ctx);
}

function draftsRegistroPensamento(
  resultado: Awaited<ReturnType<typeof extrairTCC>>,
) {
  return resultado.drafts.filter((d) => d.subtipo === "registro_pensamento");
}

// ─── Convencional: ExtractionResult descarta resumo_sessao/temas (por
// desenho — ver llm-provider.ts). As asserções mandatórias do enunciado
// (R9-TC de vocabulário, R5-TC de alerta) precisam do objeto completo, então
// esta suíte chama o MESMO invoker real + MESMO buildUserMessage + MESMO
// agentOutputSchema.parse que LlmExtractionProvider usa internamente — só
// sem a etapa final de recorte para ExtractionResult. Não é reimplementação
// da regra: são as funções de produção de verdade, na mesma ordem.

async function extrairConvencional(
  caso: CasoConvencional,
): Promise<AgentOutput> {
  const invoker = createGeminiInvoker();
  const user = buildUserMessage({
    notaConsolidada: caso.diario,
    contexto: caso.contexto,
  });
  const { payload: bruto } = await invoker({
    system: CONVENTIONAL_SYSTEM_PROMPT,
    user,
  });
  return agentOutputSchema.parse(bruto);
}

/** Normaliza (minúsculo, sem acento) para checagem de vocabulário robusta a
 * capitalização/acentuação, sem mascarar a diferença que o teste procura. */
const REGEX_MARCAS_DIACRITICAS = /[̀-ͯ]/g;

function normalizar(s: string): string {
  return s.normalize("NFD").replace(REGEX_MARCAS_DIACRITICAS, "").toLowerCase();
}

function contemAlguma(texto: string, termos: string[]): string[] {
  const norm = normalizar(texto);
  return termos.filter((t) => norm.includes(normalizar(t)));
}

// ─────────────────────────────── TCC ─────────────────────────────────────

describe("Agente TCC — docs/agente/casos-de-teste-tcc.md", () => {
  test("T1 — catastrofização clara: pensamento citado literalmente e distorção classificada (R2/R10-TC, R4-TCC/R11-TC)", async () => {
    const resultado = await extrairTCC(porId(CASOS_TCC, "T1"));
    const rpds = draftsRegistroPensamento(resultado);
    expect(rpds.length).toBeGreaterThanOrEqual(1);
    const rpd = rpds[0]!;
    // R2/R10-TC: trecho_fonte cita o pensamento LITERAL, não paráfrase.
    expect(rpd.trechoFonte.toLowerCase()).toContain("vou ser demitido");
    const payload = rpd.payload as { distorcoes_cognitivas?: string[] };
    expect(payload.distorcoes_cognitivas?.length ?? 0).toBeGreaterThanOrEqual(
      1,
    );
  });

  test("T2 — múltiplas distorções na MESMA fala não geram extrações duplicadas (R4-TCC/R11-TC — 'multiplos alvos' equivalente)", async () => {
    const resultado = await extrairTCC(porId(CASOS_TCC, "T2"));
    const rpds = draftsRegistroPensamento(resultado);
    // Regra do caso T2 (doc): distorções coexistentes mapeadas dentro do
    // MESMO registro_pensamento, nunca geram extrações duplicadas do mesmo
    // trecho.
    expect(rpds.length).toBe(1);
    const payload = rpds[0]!.payload as { distorcoes_cognitivas?: string[] };
    expect(payload.distorcoes_cognitivas?.length ?? 0).toBeGreaterThanOrEqual(
      3,
    );
  });

  test("T3 — relato vago de humor NÃO produz escore/número (R3 doc → R4-TC real: sem evidência textual explícita, não mencione)", async () => {
    const resultado = await extrairTCC(porId(CASOS_TCC, "T3"));
    // Nenhuma extração de aplicação de escala — não há número no texto.
    expect(
      resultado.drafts.some((d) => d.subtipo === "aplicacao_escala_relatada"),
    ).toBe(false);
    // Se algum registro_pensamento ainda assim aparecer (texto pobre — R1:
    // "retornar poucas extrações é sucesso"), nenhuma credibilidade numérica
    // pode ter sido inventada.
    for (const rpd of draftsRegistroPensamento(resultado)) {
      const payload = rpd.payload as {
        credibilidade_inicial?: number | null;
        credibilidade_alternativa?: number | null;
      };
      expect(payload.credibilidade_inicial ?? null).toBeNull();
      expect(payload.credibilidade_alternativa ?? null).toBeNull();
    }
    expect(resultado.alertaRisco).toBeNull();
  });

  test("T4 — tarefa mista: chamada roda sem erro de schema (tarefa_casa ainda NÃO é instruído em TCC_SYSTEM_PROMPT — gap real, não bug desta suíte)", async () => {
    const resultado = await extrairTCC(porId(CASOS_TCC, "T4"));
    // Não afirma nada sobre conteúdo de tarefa_casa: TCC_SYSTEM_PROMPT
    // (prompt.ts) não menciona esse subtipo — só registro_pensamento. Uma
    // saída vazia ou sem tarefa_casa é válida aqui (borda documentada na
    // issue: zero extrações é resultado válido, não falha de suíte).
    expect(resultado.drafts.every((d) => d.subtipo !== "tarefa_casa")).toBe(
      true,
    );
  });

  test("T5 — ideação suicida dispara alerta MESMO com protocolos_ativos: [] (R5-TC/R20, transversal)", async () => {
    const caso = porId(CASOS_TCC, "T5");
    expect(caso.contexto.protocolos_ativos).toEqual([]);
    const resultado = await extrairTCC(caso);
    expect(resultado.alertaRisco).not.toBeNull();
    const risco = resultado.alertaRisco!;
    expect(risco.categoria).toBe("ideacao_suicida");
    // R18-equivalente (doc): falso positivo aceitável, falso negativo não —
    // a negação de "coragem" não pode rebaixar para ideação passiva.
    expect(risco.severidade).not.toBe("ideacao_passiva");
    expect(risco.trecho_fonte.length).toBeGreaterThan(0);
    // Forma É `AlertaRiscoAgente` por construção: `LlmExtractionProvider.extrair`
    // só devolve `alertaRisco` depois de `agentOutputSchema.parse` (que
    // valida `alerta_risco` com o MESMO `alertaRiscoSchema` usado em
    // produção) não lançar — é o parâmetro `risco` que
    // `registrarAlertaRisco` (src/lib/risco/registrar.ts) exige.
  });

  test("R4-TCC/R11-TC probe — duas distorções igualmente plausíveis: nenhuma escolhida por palpite", async () => {
    const resultado = await extrairTCC(CASO_T2B_DUAS_DISTORCOES_AMBIGUAS);
    const rpds = draftsRegistroPensamento(resultado);
    expect(rpds.length).toBeGreaterThanOrEqual(1);
    const rpd = rpds[0]!;
    const payload = rpd.payload as { distorcoes_cognitivas?: string[] };
    const nDistorcoes = payload.distorcoes_cognitivas?.length ?? 0;
    // R11-TC (texto real, cita "R4-TCC" explicitamente): "Duas distorções
    // igualmente plausíveis → registre as duas com confiança média; nenhuma
    // clara → não registre nenhuma, confiança baixa."
    const duasComMedia = nDistorcoes >= 2 && rpd.confianca === "media";
    const nenhumaComBaixa = nDistorcoes === 0 && rpd.confianca === "baixa";
    expect(
      duasComMedia || nenhumaComBaixa,
      `Esperado: 2+ distorções com confiança "media", OU 0 distorções com ` +
        `confiança "baixa". Obtido: ${nDistorcoes} distorção(ões), ` +
        `confiança "${rpd.confianca}" — indica escolha por palpite.`,
    ).toBe(true);
  });

  test("R1/R9-TC probe — texto vago NÃO produz classificação de distorção ('ele estava desanimado' não vira raciocínio_emocional)", async () => {
    const resultado = await extrairTCC(PROBE_R1_TEXTO_VAGO);
    for (const rpd of draftsRegistroPensamento(resultado)) {
      const payload = rpd.payload as { distorcoes_cognitivas?: string[] };
      expect(payload.distorcoes_cognitivas ?? []).toEqual([]);
    }
    // Checagem adicional, no objeto inteiro: nenhum rótulo de raciocínio
    // emocional apareceu em lugar nenhum (nome/variações comuns).
    const bruto = JSON.stringify(resultado);
    expect(
      contemAlguma(bruto, ["raciocinio_emocional", "raciocínio emocional"]),
    ).toEqual([]);
  });

  test("R11/R12-TC probe — 'muito ansiosa' sem número não produz credibilidade numérica", async () => {
    const resultado = await extrairTCC(PROBE_R11_SEM_NUMERO);
    const rpds = draftsRegistroPensamento(resultado);
    expect(rpds.length).toBeGreaterThanOrEqual(1);
    for (const rpd of rpds) {
      const payload = rpd.payload as {
        credibilidade_inicial?: number | null;
        credibilidade_alternativa?: number | null;
      };
      expect(payload.credibilidade_inicial ?? null).toBeNull();
      expect(payload.credibilidade_alternativa ?? null).toBeNull();
    }
  });
});

// ────────────────────────────── Convencional ──────────────────────────────

describe("Agente Convencional — docs/agente/casos-de-teste-terapia-convencional.md", () => {
  test("TC-1 — escuta simples: valida contra o contrato CONVENCIONAL (resumo_sessao + temas[]), sem jargão psicodinâmico ausente do relato (R9-TC)", async () => {
    const saida = await extrairConvencional(porId(CASOS_CONVENCIONAL, "TC-1"));
    expect(typeof saida.resumo_sessao).toBe("string");
    expect(saida.resumo_sessao.length).toBeGreaterThan(0);
    expect(Array.isArray(saida.temas ?? [])).toBe(true);
    expect(saida.alerta_risco ?? null).toBeNull();
    const textoCompleto = [saida.resumo_sessao, ...(saida.temas ?? [])].join(
      " ",
    );
    const jargaoPsicodinamico = contemAlguma(textoCompleto, [
      "transferência",
      "conteúdo latente",
      "defesa",
      "mecanismo de defesa",
    ]);
    expect(
      jargaoPsicodinamico,
      `R9-TC: relato não usou jargão psicodinâmico, mas a saída introduziu: ${jargaoPsicodinamico.join(", ")}`,
    ).toEqual([]);
  });

  test("TC-2 — violência doméstica MINIMIZADA pela paciente ainda assim dispara alerta_risco (R5-TC crítico, regressão prioritária)", async () => {
    const saida = await extrairConvencional(porId(CASOS_CONVENCIONAL, "TC-2"));
    expect(saida.alerta_risco).toBeTruthy();
    expect(saida.alerta_risco?.categoria).toBe("violencia_sofrida");
    expect(saida.alerta_risco?.trecho_fonte.length ?? 0).toBeGreaterThan(0);
  });

  test("TC-3 — baixa participação verbal: saída NUNCA contém 'resistência'/'defesa' (critério de regressão explícito do doc, R9-TC)", async () => {
    const saida = await extrairConvencional(porId(CASOS_CONVENCIONAL, "TC-3"));
    const textoCompleto = [saida.resumo_sessao, ...(saida.temas ?? [])].join(
      " ",
    );
    const termosProibidos = contemAlguma(textoCompleto, [
      "resistência",
      "resistiu",
      "defesa",
      "mecanismo de defesa",
    ]);
    expect(
      termosProibidos,
      `Doc: "Uma saída que contenha 'resistência', 'resistiu', 'defesa' ou ` +
        `'mecanismo de defesa' É FALHA" — encontrado: ${termosProibidos.join(", ")}`,
    ).toEqual([]);
  });

  test("TC-4 — encerramento de ciclo: sem prognóstico/alta clínica (R3-TC/R8-TC), sem alerta", async () => {
    const saida = await extrairConvencional(porId(CASOS_CONVENCIONAL, "TC-4"));
    expect(saida.alerta_risco ?? null).toBeNull();
    const termosProibidos = contemAlguma(saida.resumo_sessao, [
      "alta clínica",
      "prognóstico",
    ]);
    expect(termosProibidos).toEqual([]);
  });

  test("TC-5a/TC-5b — MESMO episódio, vocabulário espelha a família do relato, nunca a impõe (R9-TC, par de comparação cruzada)", async () => {
    const [saidaA, saidaB] = await Promise.all([
      extrairConvencional(CASO_TC5A),
      extrairConvencional(CASO_TC5B),
    ]);

    // Equivalência factual mínima: ambas mencionam o núcleo do episódio.
    for (const saida of [saidaA, saidaB]) {
      const texto = normalizar(saida.resumo_sessao);
      expect(texto).toContain(normalizar("aperto no peito"));
      expect(texto).toContain(normalizar("pai"));
    }

    // TC-5b: relato NUNCA usou vocabulário psicodinâmico — a saída também
    // não pode introduzi-lo, mesmo descrevendo o mesmo fenômeno que TC-5a.
    const textoB = [saidaB.resumo_sessao, ...(saidaB.temas ?? [])].join(" ");
    const jargaoPsicodinamicoEmB = contemAlguma(textoB, [
      "resistência",
      "resistiu",
      "deslocou",
      "deslocamento",
      "interpretei",
      "interpretação",
      "transferência",
    ]);
    expect(
      jargaoPsicodinamicoEmB,
      `R9-TC: TC-5b (relato humanista) não pode conter vocabulário ` +
        `psicodinâmico — encontrado: ${jargaoPsicodinamicoEmB.join(", ")}`,
    ).toEqual([]);

    // TC-5a: relato NUNCA usou vocabulário humanista — simétrico.
    const textoA = [saidaA.resumo_sessao, ...(saidaA.temas ?? [])].join(" ");
    const jargaoHumanistaEmA = contemAlguma(textoA, [
      "aqui-e-agora",
      "saiu do contato",
    ]);
    expect(
      jargaoHumanistaEmA,
      `R9-TC: TC-5a (relato psicodinâmico) não pode conter vocabulário ` +
        `humanista — encontrado: ${jargaoHumanistaEmA.join(", ")}`,
    ).toEqual([]);
  });
});
