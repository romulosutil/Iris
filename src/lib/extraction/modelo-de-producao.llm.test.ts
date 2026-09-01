/**
 * Smoke test do provider REAL de extração contra a API do Gemini (#510).
 *
 * POR QUE ESTE ARQUIVO EXISTE: em 31/08/2026 o Google aposentou o id
 * `gemini-2.5-flash`, que estava chumbado em `provider.ts`. Toda extração de
 * produção passou a responder `404 NOT_FOUND`. 2260 testes unitários + 1281 de
 * RLS ficaram VERDES durante todo o tempo em que produção esteve quebrada
 * (PR #508, memória do repo `gate-de-flag-cega-a-suite-inteira`).
 *
 * O motivo do ponto cego: `pnpm test` roda com `EXTRACTION_LLM_ENABLED=false`
 * (guardrail LGPD/D57, correto), então `resolveProvider` devolve `NullProvider`
 * ou `DemoStubProvider` — nenhum dos dois faz chamada de rede nem pode falhar
 * como o provider real falha. E a suíte `casos-clinicos.llm.test.ts` (#395)
 * chama `createGeminiInvoker()` SEM argumento, herdando o default BARATO
 * (`gemini-2.0-flash`): ela nunca tocou o id de produção, então também não
 * pegaria a aposentadoria.
 *
 * Este arquivo fecha exatamente esse buraco: exercita `modeloDeExtracao()` —
 * a MESMA resolução que `resolveProvider` usa em produção — através do MESMO
 * `LlmExtractionProvider` + `createGeminiInvoker`, contra a API de verdade.
 *
 * SEM DADO DE PACIENTE: a nota abaixo é sintética, escrita para este teste.
 * Nenhum texto de prontuário real sai daqui para o Google — o gate de D57
 * protege o dado de produção, e este teste não pode ser a porta dos fundos
 * dele.
 *
 * ONDE RODA: agendado (`.github/workflows/smoke-provider-extracao.yml`, diário),
 * nunca no `pnpm test` nem no CI de PR — segue a convenção `*.llm.test.ts`
 * (excluída em `vitest.config.ts`, isolada em `vitest.llm.config.ts`). Local:
 * `pnpm test:smoke`.
 */
import { describe, expect, test } from "vitest";
import { LlmExtractionProvider } from "./llm-provider";
import { createGeminiInvoker } from "./gemini-invoker";
import {
  MODELO_EXTRACAO_PADRAO,
  modeloDeExtracao,
  type ExtractionContext,
} from "./provider";

// Nota SINTÉTICA — inventada para este teste, sem PHI. Curta de propósito: o
// oráculo aqui é o contrato de produção responder, não a qualidade clínica da
// extração (isso é escopo de `casos-clinicos.llm.test.ts`). Ainda assim
// descreve um comportamento observável com antecedente e consequência, para
// que o modelo tenha algo real a estruturar e o schema seja de fato
// exercitado ponta a ponta.
const NOTA_SINTETICA = [
  "Sessão de demonstração com dados fictícios, usada apenas para verificar",
  "a saúde da integração com o modelo. Nenhum paciente real está descrito.",
  "",
  "O aprendiz fictício desta nota recebeu a instrução de guardar os blocos na",
  "caixa. Após o pedido, empurrou a caixa para longe e vocalizou protesto por",
  "cerca de dez segundos. O terapeuta aguardou em silêncio e repetiu a",
  "instrução uma vez. Na segunda tentativa, o aprendiz guardou três blocos com",
  "ajuda física parcial e recebeu elogio imediato.",
].join("\n");

describe("smoke: provider de extração de PRODUÇÃO contra a API real (#510)", () => {
  /**
   * Guarda contra a deriva que cegou a suíte #395: se alguém trocar este teste
   * para `createGeminiInvoker()` sem argumento, ele passa a exercitar o modelo
   * barato e deixa de cobrir o id de produção — verde, e cego de novo. Este
   * teste não custa chamada: fixa que a resolução usada abaixo é a MESMA de
   * `resolveProvider`.
   */
  test("o modelo exercitado é o de produção, não o default barato do invoker", () => {
    const modelo = modeloDeExtracao();
    expect(modelo).toBe(
      process.env.GOOGLE_EXTRACTION_MODEL?.trim() || MODELO_EXTRACAO_PADRAO,
    );
    // O default do `createGeminiInvoker` (sem argumento) é o modelo BARATO da
    // suíte #395. Se os dois convergirem, este smoke perdeu o propósito.
    expect(modelo).not.toBe(
      process.env.GEMINI_TEST_MODEL || "gemini-2.0-flash",
    );
  });

  /**
   * O ORÁCULO É "NÃO LANÇA".
   *
   * Cada modo de falha que este smoke existe para pegar chega como exceção no
   * caminho de produção:
   * - id de modelo aposentado → `404 NOT_FOUND` do SDK;
   * - chave inválida/sem cota → erro de autenticação/429;
   * - schema da ferramenta recusado pela API → erro do SDK na chamada;
   * - modelo não devolve a function call → `createGeminiInvoker` lança
   *   ("Gemini não retornou function call...");
   * - forma da resposta fora do contrato → `agentOutputSchema.parse` lança
   *   dentro de `LlmExtractionProvider.extrair`.
   *
   * Por isso NÃO asserimos conteúdo clínico: o que o modelo extraiu desta nota
   * é legitimamente variável e assertar nisso tornaria o smoke intermitente —
   * um smoke que dá falso vermelho é desligado, e aí volta o ponto cego.
   */
  test("extração real ponta a ponta responde dentro do contrato", async () => {
    const provider = new LlmExtractionProvider(
      createGeminiInvoker(modeloDeExtracao()),
    );
    const ctx: ExtractionContext = {
      sessionId: "smoke-510",
      clinicId: "smoke-510-clinic",
      notaConsolidada: NOTA_SINTETICA,
      metasAtivas: [],
    };

    const resultado = await provider.extrair(ctx);

    // Chegou aqui = o modelo respondeu, devolveu a function call e a saída
    // passou pelo `agentOutputSchema`. Contrato de produção intacto.
    expect(Array.isArray(resultado.drafts)).toBe(true);
    // `alertaRisco` é `AlertaRiscoAgente | null` — `undefined` significaria que
    // o recorte de `LlmExtractionProvider` mudou de forma sem este teste ver.
    expect(resultado.alertaRisco !== undefined).toBe(true);
  });
});
