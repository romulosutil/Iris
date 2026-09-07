import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Item 5 da #93 — os segredos de RUNTIME saem da aba `Ambiente` do Easypanel
 * (que os repassa como `--build-arg` e os imprime em texto plano no log de
 * build) e passam a entrar por arquivo montado em `/run/secrets/env`, lido pela
 * flag nativa `--env-file-if-exists` do Node.
 *
 * Este arquivo cobre os dois lados da mudança:
 *
 *   1. o CONTRATO da flag — o que o Node faz de fato com o arquivo, medido
 *      spawnando o Node desta máquina. É o que o `infra/README.md` §"Segredos
 *      de runtime" afirma; se o comportamento mudar numa versão futura, quebra
 *      aqui e não em produção;
 *   2. os três CMD que precisam carregar a flag. Estático, sem Docker: o
 *      `scripts/ci/carga-imagem-app.sh` prova a mesma coisa DENTRO da imagem,
 *      mas só roda quando os Dockerfiles mudam e exige daemon. Um `sed` que
 *      tire a flag de um dos CMD tem que ficar vermelho já no `pnpm test`.
 */

const RAIZ = path.resolve(import.meta.dirname, "..");
const CAMINHO_SEGREDO = "/run/secrets/env";
const FLAG = `--env-file-if-exists=${CAMINHO_SEGREDO}`;

// Nomes FABRICADOS, lidos por um Node filho — não são configuração do Iris.
// Ficam em constante e são acessados por `process.env[VARIAVEL]` de propósito:
// o guard de `src/env-example.test.ts` varre `process.env.<NOME>` e
// `process.env["<NOME>"]` em src|scripts|infra, e escrever qualquer uma das
// duas formas aqui inventaria variável fantasma para o `.env.example`
// documentar.
const CHAVE_FIXTURE = "SEGREDO_A";
const CHAVE_URL_FIXTURE = "URL";

/** `process.stdout.write(String(process.env[<chave>]))`, sem citar o nome. */
function scriptQueImprime(chave, prefixo = "") {
  return `process.stdout.write(${JSON.stringify(prefixo)} + String(process.env[${JSON.stringify(chave)}]))`;
}

// --- 1. contrato da flag ------------------------------------------------------

describe("contrato de --env-file-if-exists (Node desta máquina)", () => {
  let dir;

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "iris-segredo-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Roda `node --env-file-if-exists=<arquivo> -e <script>` e devolve saída + rc. */
  function rodarNode({ conteudo, script, env = {} }) {
    const arquivo = path.join(
      dir,
      `env-${Math.random().toString(36).slice(2)}`,
    );
    if (conteudo !== null) writeFileSync(arquivo, conteudo);
    try {
      const stdout = execFileSync(
        process.execPath,
        [`--env-file-if-exists=${arquivo}`, "-e", script],
        { encoding: "utf8", env: { ...process.env, ...env } },
      );
      return { stdout: stdout.trim(), rc: 0 };
    } catch (erro) {
      return { stdout: String(erro.stdout ?? "").trim(), rc: erro.status };
    }
  }

  it("carrega as variáveis do arquivo apontado", () => {
    const { stdout, rc } = rodarNode({
      conteudo: `${CHAVE_FIXTURE}="valor-do-arquivo"\n`,
      script: scriptQueImprime(CHAVE_FIXTURE),
    });

    expect(rc).toBe(0);
    expect(stdout).toBe("valor-do-arquivo");
  });

  it("segue sem erro quando o arquivo NÃO existe — é o caso de CI, docker compose e dev", () => {
    // O `-if-exists` é a metade que importa: os mesmos CMD rodam em ambiente
    // SEM volume montado (o job `carga-imagem-app` do CI, o
    // `infra/docker-compose.yml` local, a máquina do dev). Se a flag abortasse,
    // a mudança derrubaria o boot em todo lugar que não é a VPS.
    const { stdout, rc } = rodarNode({
      conteudo: null,
      script: scriptQueImprime(CHAVE_FIXTURE, "subiu:"),
    });

    expect(rc).toBe(0);
    expect(stdout).toBe("subiu:undefined");
  });

  it("variável já presente no ambiente VENCE a do arquivo", () => {
    // É o que torna a virada reversível e sem downtime: enquanto o segredo
    // ainda estiver na aba `Ambiente` do Easypanel, ele continua ganhando.
    // Removê-lo de lá é o passo que passa a valer o arquivo — e é também o
    // motivo de um segredo esquecido no painel vencer em silêncio o do arquivo.
    const { stdout, rc } = rodarNode({
      conteudo: `${CHAVE_FIXTURE}="do-arquivo"\n`,
      script: scriptQueImprime(CHAVE_FIXTURE),
      env: { [CHAVE_FIXTURE]: "do-ambiente" },
    });

    expect(rc).toBe(0);
    expect(stdout).toBe("do-ambiente");
  });

  it("TRUNCA valor não-aspado no primeiro '#' — por isso o arquivo é escrito com aspas", () => {
    // Armadilha real e silenciosa: `#` inicia comentário. Uma senha de role
    // Postgres com `#` entra truncada na DATABASE_URL, o app conecta com a
    // credencial errada, e o erro que aparece é "password authentication
    // failed" — nada aponta para o parser do arquivo. O contorno é aspar TODO
    // valor, e é essa a regra escrita no infra/README.md §"Segredos de runtime".
    const semAspas = rodarNode({
      conteudo: `${CHAVE_URL_FIXTURE}=postgres://u:se#nha@h/db\n`,
      script: scriptQueImprime(CHAVE_URL_FIXTURE),
    });
    expect(semAspas.stdout).toBe("postgres://u:se");

    const comAspas = rodarNode({
      conteudo: `${CHAVE_URL_FIXTURE}="postgres://u:se#nha@h/db"\n`,
      script: scriptQueImprime(CHAVE_URL_FIXTURE),
    });
    expect(comAspas.stdout).toBe("postgres://u:se#nha@h/db");
  });
});

// --- 2. os CMD que precisam carregar a flag -----------------------------------

describe("CMD das imagens de deploy carregam o segredo montado", () => {
  const casos = [
    {
      arquivo: "infra/Dockerfile",
      cmd: `CMD ["node", "${FLAG}", "server.js"]`,
      servico: "iris-app (stage runner)",
    },
    {
      arquivo: "infra/Dockerfile",
      cmd: `CMD ["node", "${FLAG}", "scripts/migrate.mjs"]`,
      servico: "stage migrate do Dockerfile principal",
    },
    {
      arquivo: "infra/Dockerfile.migrate",
      cmd: `CMD ["node", "${FLAG}", "scripts/migrate.mjs"]`,
      servico: "iris-migrate (gate de schema)",
    },
  ];

  for (const { arquivo, cmd, servico } of casos) {
    it(`${arquivo}: ${servico}`, () => {
      const texto = readFileSync(path.join(RAIZ, arquivo), "utf8");
      expect(texto).toContain(cmd);
    });
  }

  it("nenhum CMD `node` das imagens de deploy ficou sem a flag", () => {
    // O bloco acima prova que a linha CERTA existe; este prova que não sobrou
    // nenhuma ERRADA. Sem ele, um CMD novo (ou um duplicado que sobreviva a um
    // merge) entraria lendo só a env do painel, com os outros testes verdes.
    const semFlag = [];
    for (const arquivo of ["infra/Dockerfile", "infra/Dockerfile.migrate"]) {
      const linhas = readFileSync(path.join(RAIZ, arquivo), "utf8").split("\n");
      linhas.forEach((linha, i) => {
        const limpa = linha.trim();
        if (!limpa.startsWith('CMD ["node"')) return;
        if (limpa.includes(FLAG)) return;
        semFlag.push(`${arquivo}:${i + 1}: ${limpa}`);
      });
    }

    expect(semFlag).toEqual([]);
  });
});
