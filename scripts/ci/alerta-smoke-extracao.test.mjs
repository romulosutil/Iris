import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  montarAlerta,
  TITULO_PROVIDER_QUEBRADO,
  TITULO_SEGREDO_AUSENTE,
} from "./alerta-smoke-extracao.mjs";

/**
 * Guard da #524.
 *
 * O smoke da #510 falhou seis dias seguidos (01→06/09/2026) no passo que checa
 * `GOOGLE_API_KEY` — ou seja, NUNCA chegou a chamar o Gemini. Mesmo assim o
 * alerta abriu a issue #524 dizendo "extração de produção pode estar quebrada"
 * e "o caminho de produção não conseguiu completar uma chamada real ao
 * Gemini". Diagnóstico afirmado sem medição, e caro justamente no dia de
 * incidente (memória do repo `mensagem-de-erro-que-afirma-causa`).
 *
 * O que estes testes prendem:
 *   1. o corpo do caso "segredo ausente" não afirma nada sobre o provider;
 *   2. os dois casos têm títulos DIFERENTES — o dedup do workflow casa por
 *      título, então título igual faria uma quebra real do Gemini chegar como
 *      comentário na issue do segredo e ser lida como "mais um dia do mesmo";
 *   3. a fiação: o workflow importa este módulo do caminho em que ele está.
 *
 * CRLF normalizado ao ler o YAML de propósito: o repo é editado no Windows e
 * uma asserção de substring falharia por fim de linha, não por conteúdo.
 */
const raiz = process.cwd();
const CAMINHO_MODULO = "scripts/ci/alerta-smoke-extracao.mjs";

const workflow = readFileSync(
  path.join(raiz, ".github/workflows/smoke-provider-extracao.yml"),
  "utf8",
).replace(/\r\n/g, "\n");

const URL_RUN = "https://github.com/romulosutil/Iris/actions/runs/34033761936";
const AGORA = "2026-09-06T12:40:03.000Z";

/** Frases que só podem aparecer quando o Gemini foi REALMENTE chamado. */
const AFIRMACOES_SOBRE_O_PROVIDER = [
  "não conseguiu completar uma chamada real ao Gemini",
  "Id de modelo aposentado pelo Google",
  "toda extração de produção está caindo em `pendente_reprocessamento` agora",
];

describe("fiação do alerta no workflow do smoke", () => {
  it("o workflow importa o módulo do caminho em que ele existe", () => {
    // Pega o rename/typo silencioso: se o `await import()` estourar dentro do
    // github-script, NENHUMA issue é aberta e a proteção some sem aviso.
    expect(workflow).toContain(CAMINHO_MODULO);
    expect(existsSync(path.join(raiz, CAMINHO_MODULO))).toBe(true);
  });

  it("o workflow decide o diagnóstico por `montarAlerta`, não por texto inline", () => {
    expect(workflow).toContain("montarAlerta({");
    expect(workflow).toContain("passoSegredo: process.env.PASSO_SEGREDO");
    expect(workflow).toContain("PASSO_SEGREDO: ${{ steps.segredo.outcome }}");

    // O corpo antigo morava dentro do `script:` e era único para as duas
    // falhas. Se voltar para lá, volta o diagnóstico falso.
    for (const afirmacao of AFIRMACOES_SOBRE_O_PROVIDER) {
      expect(workflow).not.toContain(afirmacao);
    }
  });

  it("o comentário de repetição vem do módulo, não é fixo no workflow", () => {
    expect(workflow).toContain("body: comentario,");
    expect(workflow).not.toContain("Smoke falhou de novo. Run:");
  });
});

describe("segredo ausente — o smoke não rodou", () => {
  const alerta = montarAlerta({
    passoSegredo: "failure",
    url: URL_RUN,
    agora: AGORA,
  });

  it("não afirma nada sobre a saúde do provider", () => {
    for (const afirmacao of AFIRMACOES_SOBRE_O_PROVIDER) {
      expect(alerta.corpo).not.toContain(afirmacao);
    }
    expect(alerta.titulo).not.toContain(
      "extração de produção pode estar quebrada",
    );
  });

  it("diz explicitamente que nada foi medido, nos dois sentidos", () => {
    expect(alerta.corpo).toContain(
      "**não diz que a extração de produção está quebrada**",
    );
    expect(alerta.corpo).toContain("**não diz que está sã**");
    expect(alerta.corpo).toContain("nada foi medido");
  });

  it("nomeia a correção real: configurar o segredo no repositório", () => {
    expect(alerta.titulo).toBe(TITULO_SEGREDO_AUSENTE);
    expect(alerta.titulo).toContain("GOOGLE_API_KEY");
    expect(alerta.corpo).toContain(
      "Settings → Secrets and variables → Actions",
    );
    expect(alerta.corpo).toContain("`GOOGLE_API_KEY`");
  });

  it("registra que a proteção da #510 está inerte enquanto isso", () => {
    expect(alerta.corpo).toContain("inerte");
    expect(alerta.corpo).toContain("#510");
  });

  it("o comentário de repetição também não afirma causa", () => {
    expect(alerta.comentario).toContain("nada foi medido sobre o provider");
    expect(alerta.comentario).toContain(URL_RUN);
    for (const afirmacao of AFIRMACOES_SOBRE_O_PROVIDER) {
      expect(alerta.comentario).not.toContain(afirmacao);
    }
  });
});

describe("smoke rodou e o Gemini falhou", () => {
  const alerta = montarAlerta({
    passoSegredo: "success",
    url: URL_RUN,
    agora: AGORA,
  });

  it("mantém o diagnóstico completo do provider", () => {
    expect(alerta.titulo).toBe(TITULO_PROVIDER_QUEBRADO);
    for (const afirmacao of AFIRMACOES_SOBRE_O_PROVIDER) {
      expect(alerta.corpo).toContain(afirmacao);
    }
    expect(alerta.corpo).toContain("`GOOGLE_EXTRACTION_MODEL`");
    expect(alerta.corpo).toContain("MODELO_EXTRACAO_PADRAO");
  });

  it("deixa claro que o segredo estava configurado e o smoke rodou", () => {
    expect(alerta.corpo).toContain("a chamada real ao Gemini");
    expect(alerta.corpo).toContain("o smoke chegou a rodar");
  });

  it("o comentário de repetição nomeia a chamada ao Gemini", () => {
    expect(alerta.comentario).toContain(
      "chamada real ao Gemini falhou de novo",
    );
    expect(alerta.comentario).toContain(URL_RUN);
  });
});

describe("os dois diagnósticos não se misturam", () => {
  it("títulos distintos mantêm duas linhas separadas no dedup por título", () => {
    expect(TITULO_SEGREDO_AUSENTE).not.toBe(TITULO_PROVIDER_QUEBRADO);
  });

  it("qualquer `outcome` que não seja `failure` é tratado como smoke executado", () => {
    // `steps.segredo.outcome` só vale `success`/`failure`/`skipped`/`cancelled`.
    // Um valor inesperado não pode virar "segredo ausente" por acidente: só
    // `failure` daquele passo prova que o smoke não rodou.
    for (const outcome of ["success", "skipped", "cancelled", ""]) {
      expect(
        montarAlerta({ passoSegredo: outcome, url: URL_RUN, agora: AGORA })
          .titulo,
      ).toBe(TITULO_PROVIDER_QUEBRADO);
    }
  });

  it("os dois corpos carregam o run e o horário da falha", () => {
    for (const outcome of ["failure", "success"]) {
      const { corpo } = montarAlerta({
        passoSegredo: outcome,
        url: URL_RUN,
        agora: AGORA,
      });
      expect(corpo).toContain(URL_RUN);
      expect(corpo).toContain(AGORA);
    }
  });
});
