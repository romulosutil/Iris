import { describe, expect, it } from "vitest";

import {
  CHAVES_PII,
  VALOR_REDIGIDO,
  chaveEhPII,
  normalizarChave,
  redigirContexto,
} from "./redacao";

/**
 * Oráculo da redaction por chave (#560, F1).
 *
 * **A lista abaixo é escrita à mão de propósito.** Iterar `CHAVES_PII` para
 * provar `CHAVES_PII` é mutante equivalente: tirar uma chave do módulo de
 * produção também a tiraria da iteração, e o teste continuaria verde
 * enquanto o campo passa a vazar. O oráculo tem que ser independente da
 * coisa medida.
 *
 * Consequência combinada: mexer na lista de produção obriga a mexer aqui, e a
 * revisão vê as duas metades no mesmo diff. É o comportamento desejado.
 */
const CHAVES_QUE_DEVEM_SER_REDIGIDAS = [
  // identificadores diretos
  "nome",
  "cpf",
  "email",
  "nascimento",
  "telefone",
  "celular",
  "responsavel_contato",
  // texto livre clínico
  "texto",
  "observacoes",
  "descricao",
  "justificativa",
  "motivo",
  "motivo_descarte",
  "diagnostico",
  "queixa",
  // saída do agente de extração (PHI por construção)
  "trecho_fonte",
  "producao_literal",
  "resumo_sessao",
  "contexto",
  "antecedente",
  "comportamento",
  "evidencia",
  "justificativa_confianca",
  // herdadas da #546
  "message",
  "mensagem",
  "stack",
  "params",
  // famílias por padrão
  "cpf_hash",
  "cpf_cnpj",
  "responsavel_cpf",
  "senha",
  "senha_atual",
  "password",
  "client_secret",
  "api_key",
  "access_token",
  "refresh_token",
  "id_token",
  "token_hash",
  "transcricao_texto",
  "resposta_texto",
  "instrumento_item_texto",
  "endereco_logradouro",
  "endereco_cep",
  "endereco_bairro",
];

/**
 * O outro lado do oráculo: um conjunto exato precisa da chave que ENTRA e da
 * que SAI. Sem isto, `chaveEhPII = () => true` passaria — e mataria o log.
 */
const CHAVES_QUE_DEVEM_PASSAR = [
  "id",
  "clinic_id",
  "patient_id",
  "session_id",
  "correlacaoId",
  "requestId",
  "nivel",
  "evento",
  "codigo",
  "constraint",
  "causaNome",
  "httpStatus",
  "hashMensagem",
  "duracao_ms",
  "modelo",
  "provider",
  "versao_prompt",
  // Métrica de billing do provider (#555, W7). Se um "contains token"
  // entrar no lugar do "ends with token", estes dois viram `[redigido]`
  // e o F5 (contadores) nasce cego.
  "tokens_entrada",
  "tokens_saida",
];

const VALOR_SENSIVEL = "Maria da Silva relatou crise às 14h";

describe("normalizarChave", () => {
  it("colapsa snake_case, camelCase e kebab-case na mesma forma", () => {
    expect(normalizarChave("trecho_fonte")).toBe("trechofonte");
    expect(normalizarChave("trechoFonte")).toBe("trechofonte");
    expect(normalizarChave("trecho-fonte")).toBe("trechofonte");
  });
});

describe("chaveEhPII", () => {
  it.each(CHAVES_QUE_DEVEM_SER_REDIGIDAS)("recusa %s", (chave) => {
    expect(chaveEhPII(chave)).toBe(true);
  });

  it.each(CHAVES_QUE_DEVEM_SER_REDIGIDAS)(
    "recusa %s também em camelCase",
    (chave) => {
      const camel = chave.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
      expect(chaveEhPII(camel)).toBe(true);
    },
  );

  it.each(CHAVES_QUE_DEVEM_PASSAR)("deixa passar %s", (chave) => {
    expect(chaveEhPII(chave)).toBe(false);
  });

  it("mantém no módulo de produção toda chave exata que o oráculo exige", () => {
    // Casa as duas metades: se alguém tirar uma chave de `CHAVES_PII` sem
    // tocar no oráculo, isto aponta exatamente qual sumiu.
    const exatas = CHAVES_QUE_DEVEM_SER_REDIGIDAS.map(normalizarChave).filter(
      (k) => CHAVES_PII.includes(k),
    );
    expect(exatas.length).toBeGreaterThan(20);
    for (const chave of exatas) expect(CHAVES_PII).toContain(chave);
  });
});

describe("redigirContexto", () => {
  it.each(CHAVES_QUE_DEVEM_SER_REDIGIDAS)(
    "redige %s no primeiro nível",
    (chave) => {
      const saida = redigirContexto({ [chave]: VALOR_SENSIVEL }) as Record<
        string,
        unknown
      >;
      expect(saida[chave]).toBe(VALOR_REDIGIDO);
      expect(JSON.stringify(saida)).not.toContain("Maria");
    },
  );

  it.each(CHAVES_QUE_DEVEM_SER_REDIGIDAS)("redige %s aninhado", (chave) => {
    const saida = redigirContexto({
      paciente: { dados: { [chave]: VALOR_SENSIVEL } },
    });
    expect(JSON.stringify(saida)).not.toContain("Maria");
    expect(JSON.stringify(saida)).toContain(VALOR_REDIGIDO);
  });

  it.each(CHAVES_QUE_DEVEM_SER_REDIGIDAS)(
    "redige %s dentro de array",
    (chave) => {
      const saida = redigirContexto({
        extracoes: [{ [chave]: VALOR_SENSIVEL }],
      });
      expect(JSON.stringify(saida)).not.toContain("Maria");
    },
  );

  it("substitui o valor inteiro, não percorre, quando a chave é proibida", () => {
    const saida = redigirContexto({
      nome: { primeiro: "Maria", ultimo: "Silva" },
    }) as Record<string, unknown>;
    expect(saida.nome).toBe(VALOR_REDIGIDO);
  });

  it("preserva as chaves úteis com o valor original", () => {
    const saida = redigirContexto({
      clinic_id: "c-1",
      tokens_entrada: 1200,
      duracao_ms: 42,
    }) as Record<string, unknown>;
    expect(saida).toEqual({
      clinic_id: "c-1",
      tokens_entrada: 1200,
      duracao_ms: 42,
    });
  });

  it("nunca serializa instância de classe — só o nome dela", () => {
    // `DrizzleQueryError.message` é o SQL + os VALORES vinculados. Percorrer
    // a instância reabriria esse caminho por uma chave fora da lista.
    class DrizzleQueryError extends Error {}
    const err = new DrizzleQueryError(
      "Failed query: insert into diario ...\nparams: Maria da Silva relatou",
    );
    const saida = redigirContexto({ erro: err }) as Record<string, unknown>;
    expect(saida.erro).toBe("[DrizzleQueryError]");
    expect(JSON.stringify(saida)).not.toContain("Maria");
  });

  it("corta em profundidade em vez de seguir referência circular", () => {
    const ciclo: Record<string, unknown> = {};
    ciclo.eu = ciclo;
    expect(() => JSON.stringify(redigirContexto(ciclo))).not.toThrow();
  });
});
