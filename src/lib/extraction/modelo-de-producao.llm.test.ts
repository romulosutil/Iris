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
 * Este arquivo fecha exatamente esse buraco: chama `resolveProvider` — a
 * função que produção usa para escolher provider E modelo — e extrai com o
 * que ela devolver, contra a API de verdade. Não remonta a fiação nem escolhe
 * modelo por conta própria: escolher o modelo no teste é precisamente o que
 * deixou a #395 cega.
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
import { resolveProvider, type ExtractionContext } from "./provider";

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
   * A FIAÇÃO É A DE PRODUÇÃO, não uma remontagem parecida.
   *
   * `resolveProvider` é quem escolhe o provider e o modelo em produção. Se
   * este smoke montasse o `LlmExtractionProvider` à mão — mesmo passando
   * `modeloDeExtracao()` explicitamente — ele testaria a MINHA cópia da
   * decisão, não a decisão. Foi exatamente assim que a suíte #395 ficou cega:
   * ela chama o Gemini de verdade, mas escolhe o modelo por conta própria
   * (`createGeminiInvoker()` sem argumento → default barato), então nunca
   * tocou o id que produção usa.
   *
   * Chamando `resolveProvider`, não existe modelo a derivar: quem decide é o
   * código de produção. Uma troca de modelo no painel passa a valer aqui de
   * graça, e não há asserção sobre QUAL id é o certo — que seria tautologia
   * (restatar `modeloDeExtracao()`) e daria falso vermelho no dia em que
   * produção legitimamente adotasse o mesmo id que a suíte #395 usa.
   *
   * `EXTRACTION_LLM_ENABLED` é setada aqui, e só aqui: é o gate de D57, que em
   * produção protege PROTUÁRIO REAL de sair para o Google. O que sai deste
   * arquivo é a nota sintética acima. O gate segue desligado em `pnpm test` —
   * este arquivo não entra lá (convenção `*.llm.test.ts`).
   */
  function providerDeProducao(): LlmExtractionProvider {
    const anterior = process.env.EXTRACTION_LLM_ENABLED;
    process.env.EXTRACTION_LLM_ENABLED = "true";
    try {
      const provider = resolveProvider({ isDemo: false });
      // Se cair em NullProvider/DemoStubProvider, o smoke não chamaria a API e
      // passaria verde sem provar nada — o modo de falha original da #510.
      // Falha alto em vez de virar smoke de mentira.
      expect(provider).toBeInstanceOf(LlmExtractionProvider);
      return provider as LlmExtractionProvider;
    } finally {
      if (anterior === undefined) delete process.env.EXTRACTION_LLM_ENABLED;
      else process.env.EXTRACTION_LLM_ENABLED = anterior;
    }
  }

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
    const provider = providerDeProducao();
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
