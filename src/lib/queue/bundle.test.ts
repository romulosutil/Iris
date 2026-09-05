import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guarda de DEPLOY do consumidor de fila (D73).
 *
 * POR QUE ESTE ARQUIVO EXISTE: a revisão da PR #624 pegou o consumidor sendo
 * iniciado com `node --import=tsx/esm scripts/queue-worker.ts` numa imagem que
 * não tem `tsx` (é `devDependency`), não tem `pg-boss` e não copia `src/`. É a
 * classe de falha das memórias `imagem-escalonamento-nao-herda-app`,
 * `carga-nao-cobre-import-dinamico` e do #156: a suíte inteira fica verde
 * porque nada em CI executa a imagem, e o container morre no primeiro boot.
 *
 * Nenhum teste de unidade do worker alcança isso — eles importam o TypeScript
 * direto do repo, onde tudo existe. Só um oráculo sobre os ARTEFATOS pega.
 */

const raiz = process.cwd();
/**
 * Lê normalizando CRLF→LF. O repo tem `core.autocrlf`, então a working tree
 * pode ter qualquer um dos dois (memória `deriva-de-hash-e-eol-nao-conteudo`) —
 * um oráculo sobre artefato que depende do fim de linha falha por EOL e é lido
 * como se o artefato estivesse errado.
 */
const ler = (p: string) =>
  readFileSync(resolve(raiz, p), "utf8").replace(/\r\n/g, "\n");

const agendador = ler("infra/asr/agendador.sh");

/**
 * Linhas EXECUTÁVEIS do shell — comentário não roda.
 *
 * Sem isto o oráculo casaria com a própria prosa que explica por que `tsx` não
 * pode estar aqui (memória `mutante-no-comentario-nao-muta-producao`: o alvo
 * da asserção tem que ser o código, nunca o texto ao lado dele).
 */
const agendadorExecutavel = agendador
  .split(/\r?\n/)
  .filter((l) => l.trim() !== "" && !l.trim().startsWith("#"))
  .join("\n");
const dockerfile = ler("infra/asr/Dockerfile.agendador");
const pkg = JSON.parse(ler("package.json")) as {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

/** Junta as continuações de linha (`\`) do Dockerfile num comando só. */
function comandosDoDockerfile(texto: string): string[] {
  return texto
    .replace(/\\r?\n\s*/g, " ")
    .split(/\r?\n/)
    .map((l) => l.trim());
}

const comandos = comandosDoDockerfile(dockerfile);

describe("Artefato do consumidor de fila", () => {
  it("o agendador não depende de tsx nem executa TypeScript", () => {
    // `tsx` é devDependency: não entra no artefato de produção.
    expect(agendadorExecutavel).not.toMatch(/tsx/);
    expect(agendadorExecutavel).not.toMatch(/\.ts\b/);
  });

  it("o agendador executa exatamente o arquivo que o Dockerfile escreve", () => {
    const caminhoNoScript = agendadorExecutavel.match(
      /readonly WORKER="([^"]+)"/,
    )?.[1];
    expect(caminhoNoScript).toBe("/app/scripts/queue-worker.mjs");

    const copiaDoBundle = comandos.find(
      (l) => l.startsWith("COPY --from=bundler") && l.includes("queue-worker"),
    );
    expect(copiaDoBundle).toBeDefined();
    // O destino da COPY é relativo ao WORKDIR /app.
    expect(copiaDoBundle).toMatch(/\.\/scripts\/queue-worker\.mjs\s*$/);
  });

  it("a imagem instala pg-boss — o único módulo que o bundle não carrega", () => {
    const versaoNoRepo = pkg.dependencies["pg-boss"];
    expect(versaoNoRepo).toBeDefined();
    const exata = (versaoNoRepo ?? "").replace(/^[\^~]/, "");

    const instalacao = comandos.find(
      (l) => l.startsWith("RUN npm install") && l.includes("pg-boss"),
    );
    expect(instalacao).toBeDefined();
    // Versão EXATA e pinada na do repo: um range aqui deixaria a imagem
    // divergir do que o bundle foi compilado contra, sem nada acusar.
    expect(instalacao).toContain(`pg-boss@${exata}`);
  });

  it("o esbuild do Dockerfile usa os mesmos flags de `pnpm queue:build`", () => {
    const script = pkg.scripts["queue:build"];
    expect(script).toBeDefined();

    const noDockerfile = comandos.find(
      (l) => l.includes("esbuild") && l.includes("queue-worker.ts"),
    );
    expect(noDockerfile).toBeDefined();

    // Se os dois divergirem, o `pnpm queue:build` verificado localmente deixa
    // de provar qualquer coisa sobre o que a imagem realmente constrói.
    for (const flag of [
      "--bundle",
      "--platform=node",
      "--target=node22",
      "--format=esm",
      "--external:pg-boss",
    ]) {
      expect(script, `flag ${flag} ausente em queue:build`).toContain(flag);
      expect(
        noDockerfile,
        `flag ${flag} ausente no esbuild do Dockerfile`,
      ).toContain(flag);
    }
  });

  it("o esbuild roda com a mesma versão pinada no repo", () => {
    const versao = pkg.devDependencies["esbuild"];
    expect(versao).toBeDefined();
    const exata = (versao ?? "").replace(/^[\^~]/, "");

    const instalacaoBundler = comandos.find(
      (l) => l.startsWith("RUN npm install") && l.includes("esbuild"),
    );
    expect(instalacaoBundler).toContain(`esbuild@${exata}`);
  });

  it("o estágio de bundle copia tudo que o worker importa", () => {
    // O grafo do bundle é `scripts/queue-worker.ts` → `src/lib/queue/**` →
    // `@/lib/observabilidade/logger`, resolvido pelos `paths` do tsconfig.
    // Faltar qualquer um dos três vira "Could not resolve" no build da imagem.
    for (const alvo of ["tsconfig.json", "src", "scripts/queue-worker.ts"]) {
      expect(
        comandos.some(
          (l) => l.startsWith("COPY ") && l.split(/\s+/).includes(alvo),
        ),
        `estágio bundler não copia ${alvo}`,
      ).toBe(true);
    }
  });

  it("o consumidor de fila não é declarado como dependência da imagem magra", () => {
    // O sweeper (T15) continua precisando destes dois; o que NÃO pode acontecer
    // é a imagem passar a instalar o grafo do app (drizzle, next, pino) para
    // rodar o worker — é justamente o que o bundle evita (#156).
    const instalacao =
      comandos.find(
        (l) => l.startsWith("RUN npm install") && l.includes("pg-boss"),
      ) ?? "";
    for (const proibido of ["drizzle-orm", "next", "pino", "tsx"]) {
      expect(instalacao).not.toContain(`${proibido}@`);
    }
  });
});
