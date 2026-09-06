import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  montarAlerta,
  TITULO_PROVIDER_QUEBRADO,
  TITULO_SEGREDO_AUSENTE,
  TITULO_SUITE_NAO_COLETA,
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

/**
 * Saída REAL do run 34066802330 (06/09/2026) — o primeiro com o segredo
 * configurado. O smoke rodou, e mesmo assim nada foi perguntado ao Google:
 * `vitest.llm.config.ts` não tinha o alias de `server-only` e a suíte morreu
 * na coleta, em 525 ms.
 */
const SAIDA_SEM_COLETA = [
  "⎯⎯⎯ Failed Suites 1 ⎯⎯⎯",
  " FAIL  src/lib/extraction/modelo-de-producao.llm.test.ts",
  "Error: This module cannot be imported from a Client Component module. It should only be used from a Server Component.",
  " ❯ Object.<anonymous> node_modules/.pnpm/server-only@0.0.1/node_modules/server-only/index.js:1:7",
  " Test Files  1 failed (1)",
  "      Tests  no tests",
  "   Duration  525ms",
].join("\n");

/** Suíte coletou, rodou 1 caso, e o Gemini é que recusou. */
const SAIDA_GEMINI_RECUSOU = [
  " ❯ src/lib/extraction/modelo-de-producao.llm.test.ts (1 test | 1 failed) 567ms",
  "     × extração real ponta a ponta responde dentro do contrato 564ms",
  'ApiError: {"error":{"code":404,"message":"models/gemini-x is no longer available","status":"NOT_FOUND"}}',
  " Test Files  1 failed (1)",
  "      Tests  1 failed (1)",
].join("\n");

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
    // Duas metades da mesma fiação, citadas SEM o prefixo `process.env.`: o
    // guard DX-01 de `src/env-example.test.ts` varre `scripts/**` por texto e
    // cobraria uma linha no `.env.example` para um nome que só existe dentro
    // de um passo do Actions (limite documentado no cabeçalho daquele guard).
    expect(workflow).toContain("passoSegredo: process.env");
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

  it("a saída do smoke é CAPTURADA e chega ao alerta", () => {
    // Sem a saída, "o smoke falhou" não distingue "o Gemini recusou" de "a
    // suíte não carregou" — os dois viram exit 1. Foi o run 34066802330.
    expect(workflow).toContain('tee "${RUNNER_TEMP}/smoke.log"');
    // `RUNNER_TEMP}/smoke.log` casa a escrita (YAML) E a leitura (JS) — sem
    // escrever o prefixo `process.env.`, pelo mesmo motivo do caso acima.
    expect(workflow.match(/RUNNER_TEMP\}\/smoke\.log/g)).toHaveLength(2);
    expect(workflow).toContain("saidaDoSmoke = fs.readFileSync(");
    expect(workflow).toContain("saidaDoSmoke,");
  });

  it("o `tee` não engole o exit code do smoke", () => {
    // Sem `pipefail`, o status do pipeline é o do `tee` (sempre 0) e um smoke
    // REPROVADO passaria como verde — a falha sumiria em vez de mudar de nome.
    const passo = workflow.slice(
      workflow.indexOf("- name: Smoke do provider de extração"),
      workflow.indexOf("- name: Abre issue de alerta"),
    );
    expect(passo).toContain("set -o pipefail");
    expect(passo.indexOf("set -o pipefail")).toBeLessThan(
      passo.indexOf("pnpm test:smoke"),
    );
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

describe("smoke rodou mas a suíte não coletou", () => {
  const alerta = montarAlerta({
    passoSegredo: "success",
    saidaDoSmoke: SAIDA_SEM_COLETA,
    url: URL_RUN,
    agora: AGORA,
  });

  it("não afirma nada sobre a saúde do provider", () => {
    // Zero casos executados = zero perguntas ao Google. Este é o run
    // 34066802330: o alerta antigo disse "extração de produção pode estar
    // quebrada" com a suíte morta no import.
    expect(alerta.titulo).toBe(TITULO_SUITE_NAO_COLETA);
    for (const afirmacao of AFIRMACOES_SOBRE_O_PROVIDER) {
      expect(alerta.corpo).not.toContain(afirmacao);
      expect(alerta.comentario).not.toContain(afirmacao);
    }
    expect(alerta.corpo).toContain(
      "**não diz que a extração de produção está quebrada**",
    );
  });

  it("aponta o alias próprio de `vitest.llm.config.ts` como primeira suspeita", () => {
    expect(alerta.corpo).toContain("vitest.llm.config.ts");
    expect(alerta.corpo).toContain("resolve.alias");
    expect(alerta.corpo).toContain("globalSetup");
  });

  it("ensina a reproduzir sem gastar cota da API", () => {
    expect(alerta.corpo).toContain(
      "GOOGLE_API_KEY=chave-falsa pnpm test:smoke",
    );
    expect(alerta.corpo).toContain("400 API_KEY_INVALID");
  });

  it("`Failed Suites` sozinho já basta como assinatura", () => {
    expect(
      montarAlerta({
        passoSegredo: "success",
        saidaDoSmoke: "⎯⎯ Failed Suites 1 ⎯⎯\nboom",
        url: URL_RUN,
        agora: AGORA,
      }).titulo,
    ).toBe(TITULO_SUITE_NAO_COLETA);
  });
});

describe("smoke rodou e o Gemini falhou", () => {
  const alerta = montarAlerta({
    passoSegredo: "success",
    saidaDoSmoke: SAIDA_GEMINI_RECUSOU,
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

describe("os três diagnósticos não se misturam", () => {
  it("títulos distintos mantêm três linhas separadas no dedup por título", () => {
    const titulos = [
      TITULO_SEGREDO_AUSENTE,
      TITULO_SUITE_NAO_COLETA,
      TITULO_PROVIDER_QUEBRADO,
    ];
    expect(new Set(titulos).size).toBe(3);
  });

  it("o segredo ausente vence, mesmo com log de run anterior no disco", () => {
    // O passo do segredo falha ANTES do smoke; se um `smoke.log` sobrar de
    // outro run, ele não pode reescrever o diagnóstico.
    expect(
      montarAlerta({
        passoSegredo: "failure",
        saidaDoSmoke: SAIDA_SEM_COLETA,
        url: URL_RUN,
        agora: AGORA,
      }).titulo,
    ).toBe(TITULO_SEGREDO_AUSENTE);
  });

  it("qualquer `outcome` que não seja `failure` é tratado como smoke executado", () => {
    // `steps.segredo.outcome` só vale `success`/`failure`/`skipped`/`cancelled`.
    // Um valor inesperado não pode virar "segredo ausente" por acidente: só
    // `failure` daquele passo prova que o smoke não rodou.
    for (const outcome of ["success", "skipped", "cancelled", ""]) {
      expect(
        montarAlerta({
          passoSegredo: outcome,
          saidaDoSmoke: SAIDA_GEMINI_RECUSOU,
          url: URL_RUN,
          agora: AGORA,
        }).titulo,
      ).toBe(TITULO_PROVIDER_QUEBRADO);
    }
  });

  it("saída ausente cai no ramo do provider, não inventa não-coleta", () => {
    for (const saida of [null, undefined, ""]) {
      expect(
        montarAlerta({
          passoSegredo: "success",
          saidaDoSmoke: saida,
          url: URL_RUN,
          agora: AGORA,
        }).titulo,
      ).toBe(TITULO_PROVIDER_QUEBRADO);
    }
  });

  it("os três corpos carregam o run e o horário da falha", () => {
    const casos = [
      { passoSegredo: "failure", saidaDoSmoke: null },
      { passoSegredo: "success", saidaDoSmoke: SAIDA_SEM_COLETA },
      { passoSegredo: "success", saidaDoSmoke: SAIDA_GEMINI_RECUSOU },
    ];
    for (const caso of casos) {
      const { corpo } = montarAlerta({ ...caso, url: URL_RUN, agora: AGORA });
      expect(corpo).toContain(URL_RUN);
      expect(corpo).toContain(AGORA);
    }
  });
});
