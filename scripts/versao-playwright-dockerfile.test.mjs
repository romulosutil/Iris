/**
 * Guard estático (I9): a versão do Playwright fixada no `infra/Dockerfile` tem
 * que ser a MESMA que o `pnpm-lock.yaml` resolve para a dependência de
 * produção `playwright`.
 *
 * Por que isto existe: o estágio `runner` do Dockerfile reinstala o Playwright
 * com `npm install --no-save playwright@<versão>` e SUBSTITUI o
 * `playwright`/`playwright-core` que o tracing do Next copiou. Ou seja, quem
 * renderiza PDF em produção (`src/lib/report/playwright-renderer.ts`, que lança
 * Chromium in-process) é a cópia do Dockerfile — não a que o repositório
 * declara. Um número escrito à mão diverge do lockfile em silêncio na próxima
 * atualização de dependência: CI verde, produção rodando outra biblioteca e
 * outro Chromium. O desalinhamento só aparece no PDF gerado.
 *
 * Este teste roda no `pnpm test` (padrão `scripts/**\/*.test.mjs` do
 * vitest.config.ts) e é puramente estático: lê arquivo, não sobe container.
 *
 * Fail-closed: se nenhuma versão for encontrada — no Dockerfile ou no
 * lockfile — o teste falha em vez de passar por vacuidade.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const RAIZ = path.join(import.meta.dirname, "..");
const DOCKERFILE = path.join(RAIZ, "infra", "Dockerfile");
const LOCKFILE = path.join(RAIZ, "pnpm-lock.yaml");

/**
 * Versão que o pnpm resolveu para a dependência `playwright` do importer raiz.
 * Bloco alvo no lockfile v9 (indentação preservada de propósito no regex):
 *
 *       playwright:
 *         specifier: ^1.62.1
 *         version: 1.62.1
 *
 * A âncora `playwright:` no fim da linha impede casar `playwright-core:` ou
 * `'@playwright/test':`.
 */
export function versaoResolvidaNoLockfile(conteudoLockfile) {
  const bloco = conteudoLockfile.match(
    /^[ \t]+playwright:[ \t]*\r?\n[ \t]+specifier:[^\r\n]*\r?\n[ \t]+version:[ \t]*([0-9][^\s(]*)/m,
  );
  return bloco ? bloco[1] : null;
}

/**
 * Todas as versões do Playwright fixadas à mão no Dockerfile, com o número da
 * linha para a mensagem de erro. Reconhece as duas formas:
 *   - `ARG PLAYWRIGHT_VERSION=1.62.1` (forma preferida: um ponto único)
 *   - `playwright@1.62.1` cru numa linha de `npm install`
 * Interpolações (`playwright@${PLAYWRIGHT_VERSION}`) não são pinos literais e
 * por isso não entram na lista.
 */
export function versoesFixadasNoDockerfile(conteudoDockerfile) {
  const achados = [];
  const linhas = conteudoDockerfile.split(/\r?\n/);
  for (const [indice, linha] of linhas.entries()) {
    const arg = linha.match(
      /^\s*ARG\s+PLAYWRIGHT_VERSION\s*=\s*["']?([0-9][^\s"']*)/,
    );
    if (arg) {
      achados.push({ linha: indice + 1, versao: arg[1], origem: "ARG" });
      continue;
    }
    const literal = linha.match(/(?:^|[\s@/])playwright@([0-9][^\s"'\\]*)/);
    if (literal) {
      achados.push({
        linha: indice + 1,
        versao: literal[1],
        origem: "literal npm install",
      });
    }
  }
  return achados;
}

describe("versão do Playwright: Dockerfile x pnpm-lock.yaml", () => {
  const dockerfile = readFileSync(DOCKERFILE, "utf8");
  const lockfile = readFileSync(LOCKFILE, "utf8");

  it("o lockfile resolve uma versão para a dependência de produção `playwright`", () => {
    const resolvida = versaoResolvidaNoLockfile(lockfile);
    expect(
      resolvida,
      "não foi possível ler a versão resolvida de `playwright` em pnpm-lock.yaml " +
        "(bloco `importers` → `dependencies` → `playwright` → `version`). " +
        "Se o formato do lockfile mudou, este guard precisa ser atualizado — " +
        "não o remova: sem ele a divergência Dockerfile x lockfile volta em silêncio.",
    ).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("o Dockerfile fixa a versão do Playwright em pelo menos um ponto", () => {
    const fixadas = versoesFixadasNoDockerfile(dockerfile);
    expect(
      fixadas.length,
      "nenhuma versão de Playwright encontrada em infra/Dockerfile. O estágio " +
        "`runner` precisa continuar fixando a versão (via `ARG PLAYWRIGHT_VERSION=`) " +
        "para que este guard consiga compará-la com o lockfile.",
    ).toBeGreaterThan(0);
  });

  it("toda versão fixada no Dockerfile é igual à resolvida no lockfile", () => {
    const resolvida = versaoResolvidaNoLockfile(lockfile);
    const fixadas = versoesFixadasNoDockerfile(dockerfile);
    const divergentes = fixadas.filter((f) => f.versao !== resolvida);

    const detalhe = divergentes
      .map(
        (d) =>
          `  infra/Dockerfile:${d.linha} (${d.origem}) declara playwright@${d.versao}, ` +
          `mas pnpm-lock.yaml resolve playwright@${resolvida}`,
      )
      .join("\n");

    expect(
      divergentes,
      `A versão do Playwright do container divergiu da que o repositório declara.\n` +
        `${detalhe}\n` +
        `Produção renderiza PDF com a versão do Dockerfile (o estágio \`runner\` ` +
        `substitui /app/node_modules/playwright), então esta divergência troca a ` +
        `biblioteca E o Chromium sem que nada no CI reclame.\n` +
        `Correção: alinhar o \`ARG PLAYWRIGHT_VERSION\` do infra/Dockerfile com ` +
        `${resolvida}, ou atualizar package.json + pnpm-lock.yaml se a intenção era ` +
        `mudar a versão do projeto.`,
    ).toEqual([]);
  });

  it("a versão fixada é única (um só ponto de manutenção)", () => {
    const fixadas = versoesFixadasNoDockerfile(dockerfile);
    const distintas = [...new Set(fixadas.map((f) => f.versao))];
    expect(
      distintas,
      `infra/Dockerfile fixa mais de uma versão de Playwright: ${distintas.join(", ")}. ` +
        `Manter um único \`ARG PLAYWRIGHT_VERSION\` e interpolá-lo nos usos.`,
    ).toHaveLength(1);
  });
});
