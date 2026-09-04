import { beforeAll, describe, expect, it } from "vitest";
import { ESLint, Linter } from "eslint";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { comoGlobLiteral } from "./regra-ds-paleta-crua.mjs";
import { pluginFronteira } from "./regra-fronteira-lib-app.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ARQUIVO_BASELINE = path.join(
  RAIZ,
  "scripts",
  "lint",
  "fronteira-lib-app.baseline.json",
);

/**
 * A-02 (#559, fatia F1). Guard de fronteira `lib` ↛ `app`: `src/lib` e
 * `src/components/ui` não podem importar de `src/app`. Este arquivo é o que
 * torna o baseline uma régua e não um tapete: sem ele, `ignores` no
 * `eslint.config.mjs` só DESLIGA a regra nos arquivos do passivo.
 */
const baseline: Record<string, number> = JSON.parse(
  readFileSync(ARQUIVO_BASELINE, "utf8"),
);

/** Arquivo de `src/lib` que NÃO está no baseline — a régua tem de valer nele. */
const ARQUIVO_EM_ESCOPO_LIB = "src/lib/billing/calculator.ts";
/** Idem para o outro braço do escopo, `src/components/ui`. */
const ARQUIVO_EM_ESCOPO_UI = "src/components/ui/accordion.tsx";

function novoESLint(overrideConfig?: Linter.Config[]) {
  return new ESLint({
    cwd: RAIZ,
    overrideConfigFile: path.join(RAIZ, "eslint.config.mjs"),
    ...(overrideConfig ? { overrideConfig } : {}),
  });
}

async function opcoesDaRegraNoConfig() {
  const cfg = await novoESLint().calculateConfigForFile(
    path.join(RAIZ, ARQUIVO_EM_ESCOPO_LIB),
  );
  const entrada = cfg.rules["fronteira/sem-import-de-app"];
  expect(
    entrada,
    `fronteira/sem-import-de-app não está ativa em ${ARQUIVO_EM_ESCOPO_LIB} — o guard da fronteira lib↛app sumiu do eslint.config.mjs`,
  ).toBeDefined();
  return entrada as [number, ...unknown[]];
}

describe("A-02 — guard de fronteira lib ↛ app (a regra acusa de verdade)", () => {
  /**
   * Mesmo aquecimento da #600: a primeira chamada carrega `eslint.config.mjs`
   * (que puxa `eslint-config-next`) e o parser do `typescript-eslint`. Pago
   * aqui, com timeout de hook explícito, em vez de inflar o timeout dos casos.
   */
  beforeAll(async () => {
    const eslint = novoESLint();
    await eslint.calculateConfigForFile(path.join(RAIZ, ARQUIVO_EM_ESCOPO_LIB));
    await eslint.lintText("export const aquecimento = 1;", {
      filePath: path.join(RAIZ, "src/lib/__guard-fronteira-lib-app.ts"),
    });
  }, 180_000);

  /**
   * O anti-inerte. Um baseline cuja chave não bate com o que a ferramenta
   * emite passa verde para sempre; uma regra cujo padrão não casa `@/app/**`
   * também. Aqui o padrão vem do CONFIG REAL (não de fixture) e é exercido
   * contra código sintético.
   */
  it("o config real barra @/app num arquivo novo de lib — inclusive import de tipo", async () => {
    const [severidade] = await opcoesDaRegraNoConfig();
    expect(severidade).toBe(2);

    // `lintText` com um `filePath` dentro de `src/lib` resolve o config de
    // PRODUÇÃO para aquele caminho — parser, `files`, `ignores` e opções da
    // regra, tudo real. É a mutação do guard feita em memória: se o bloco do
    // `eslint.config.mjs` sumir ou parar de casar `@/app`, isto fica vermelho.
    const eslint = novoESLint();
    const alvo = path.join(RAIZ, "src/lib/__guard-fronteira-lib-app.ts");
    const lint = async (codigo: string) => {
      const resultados = await eslint.lintText(codigo, { filePath: alvo });
      expect(
        resultados,
        "lintText não devolveu resultado para " + alvo,
      ).toHaveLength(1);
      return resultados[0]!.messages.filter(
        (m) => m.ruleId === "fronteira/sem-import-de-app",
      );
    };

    // Import de valor e import de TIPO contam: os dois amarram lib à rota em
    // tempo de compilação e os dois impedem mover o módulo depois.
    expect(
      await lint(`export const q = 1;
import { x } from "@/app/(app)/assinatura/queries";
console.log(x);`),
    ).toHaveLength(1);
    expect(
      await lint(`import type { S } from "@/app/(app)/assinatura/queries";
export type T = S;`),
    ).toHaveLength(1);
    // Parênteses e colchetes de rota não podem escapar do padrão.
    expect(
      await lint(`import type { M } from "@/app/(app)/pacientes/[id]/modalidade";
export type T = M;`),
    ).toHaveLength(1);
    expect(
      await lint(`import { f } from "@/app/fonts";
export const a = f;`),
    ).toHaveLength(1);
    // Re-export amarra igual: o tipo continua vindo do arquivo de rota.
    expect(
      await lint(`export type { S } from "@/app/(app)/assinatura/queries";`),
    ).toHaveLength(1);
    expect(
      await lint(`export * from "@/app/(app)/assinatura/queries";`),
    ).toHaveLength(1);

    // As TRÊS formas que furavam `no-restricted-imports` (NIT da revisão da
    // #603). Não havia ocorrência delas no repo quando o guard nasceu — estes
    // casos são o que impede a primeira aparecer sem ninguém notar.
    expect(
      await lint(`export async function f() {
  return await import("@/app/(app)/assinatura/queries");
}`),
    ).toHaveLength(1);
    expect(
      await lint(`const m = require("@/app/(app)/assinatura/queries");
export default m;`),
    ).toHaveLength(1);
    // Relativo: resolvido no filesystem, então qualquer grafia que ALCANCE
    // `src/app` cai — inclusive a que passa por dentro de `lib` antes.
    expect(
      await lint(`import type { S } from "../app/(app)/assinatura/queries";
export type T = S;`),
    ).toHaveLength(1);
    expect(
      await lint(`import type { S } from "../lib/../app/(app)/assinatura/queries";
export type T = S;`),
    ).toHaveLength(1);
    expect(
      await lint(`export async function f() {
  return await import("../app/(app)/pacientes/[id]/modalidade");
}`),
    ).toHaveLength(1);

    // O caminho legítimo — lib importa lib e db — passa.
    expect(
      await lint(`import { calcular } from "@/lib/billing/calculator";
export const a = calcular;`),
    ).toHaveLength(0);
    expect(
      await lint(`import { patient } from "@/db/schema";
export const a = patient;`),
    ).toHaveLength(0);
    // Relativo que NÃO sai de lib passa: a régua é o destino, não o `../`.
    expect(
      await lint(`import type { P } from "./patient/prontidao";
export type T = P;`),
    ).toHaveLength(0);
    // A âncora do alias não pode casar um diretório que só COMEÇA com "app".
    expect(
      await lint(`import { x } from "@/apphelper/util";
export const a = x;`),
    ).toHaveLength(0);
  }, 60_000);

  it("a regra vale nos dois braços do escopo e NÃO vaza para src/app", async () => {
    const eslint = novoESLint();
    for (const arquivo of [ARQUIVO_EM_ESCOPO_LIB, ARQUIVO_EM_ESCOPO_UI]) {
      const cfg = await eslint.calculateConfigForFile(path.join(RAIZ, arquivo));
      expect(cfg.rules["fronteira/sem-import-de-app"]?.[0], arquivo).toBe(2);
    }
    // `src/app` é a camada de rota: ela PODE importar de lib e de outras
    // rotas (o passivo rota→rota é das fatias F2–F4, não deste guard).
    const cfgRota = await eslint.calculateConfigForFile(
      path.join(RAIZ, "src/app/(app)/assinatura/queries.ts"),
    );
    expect(cfgRota.rules["fronteira/sem-import-de-app"]).toBeUndefined();
  }, 60_000);

  /**
   * O guard novo não pode ter apagado o vizinho. `src/lib/**` já roda
   * `no-restricted-syntax` (o bloco que barra embutir o erro no
   * `console.error`, porque a message do `DrizzleQueryError` carrega SQL +
   * params — PHI). Flat config NÃO soma opções da mesma regra entre blocos:
   * um bloco novo com `no-restricted-syntax` teria desligado aquele guard e o
   * `pnpm lint` continuaria verde. Por isso a fronteira virou regra própria —
   * e este caso é o que segura a decisão no lugar.
   */
  it("não apagou o guard de PHI/PII do console.error em src/lib", async () => {
    const eslint = novoESLint();
    const alvo = path.join(RAIZ, "src/lib/__guard-fronteira-lib-app.ts");

    const cfg = await eslint.calculateConfigForFile(alvo);
    expect(
      cfg.rules["no-restricted-syntax"]?.[0],
      "no-restricted-syntax sumiu de src/lib — algum bloco novo sobrescreveu o guard de PHI/PII do console.error",
    ).toBe(2);

    // E acusa de verdade, não só está declarada.
    const [resultado] = await eslint.lintText(
      `export function f(err: unknown) {
  console.error("falhou", { err });
}`,
      { filePath: alvo },
    );
    expect(
      resultado!.messages.filter((m) => m.ruleId === "no-restricted-syntax"),
    ).toHaveLength(1);
  }, 60_000);
});

/**
 * Conjunto FECHADO (mesmo precedente da #556 no baseline do DS): acrescentar
 * um arquivo aqui desligaria o guard nele sem ninguém notar. A lista só pode
 * PERDER itens — cada fatia da #559 que move um módulo tira uma entrada.
 */
const ARQUIVOS_BASELINE_ESPERADOS = [
  // F5/`lib/billing`: os dois importam `AssinaturaStatus`/`CicloStatus` de
  // `@/app/(app)/assinatura/queries` — a inversão que a auditoria destacou.
  "src/lib/billing/rotulos-assinatura.ts",
  "src/lib/billing/rotulos-ciclo.ts",
  // F2/`lib/patient`: dependem de `@/app/(app)/pacientes/[id]/modalidade`.
  "src/lib/patient/prontidao-queries.ts",
  "src/lib/patient/prontidao-rotas.test.ts",
  "src/lib/patient/prontidao.ts",
];

describe("A-02 — baseline (imports de app ainda presentes em lib)", () => {
  it("é conjunto fechado: nenhum arquivo novo entra no baseline (só sai)", () => {
    for (const arquivo of Object.keys(baseline)) {
      expect(
        ARQUIVOS_BASELINE_ESPERADOS,
        `${arquivo} não estava no baseline original — mova o módulo compartilhado para src/lib em vez de baselinar o import`,
      ).toContain(arquivo);
    }
  });

  it("todo arquivo do baseline existe e tem contagem positiva", () => {
    for (const [arquivo, n] of Object.entries(baseline)) {
      expect(existsSync(path.join(RAIZ, arquivo)), arquivo).toBe(true);
      expect(
        n,
        `${arquivo}: contagem deve ser > 0 — zere removendo a entrada`,
      ).toBeGreaterThan(0);
    }
  });

  it("a contagem por arquivo não sobe (CI acusa) e, quando cai, o baseline acompanha", async () => {
    const arquivos = Object.keys(baseline);
    if (arquivos.length === 0) return;
    const [, ...opcoes] = await opcoesDaRegraNoConfig();
    // Reativa a regra nos arquivos que o config principal ignora por estarem
    // no baseline: é aqui que a régua se mede. As OPÇÕES são as do config
    // real — fixture inventada mediria uma regra que não existe.
    const eslint = novoESLint([
      {
        files: arquivos.map(comoGlobLiteral),
        plugins: { fronteira: pluginFronteira },
        rules: {
          "fronteira/sem-import-de-app": [
            "error",
            ...opcoes,
          ] as Linter.RuleEntry,
        },
      },
    ]);
    const resultados = await eslint.lintFiles(arquivos);
    const medido: Record<string, number> = {};
    for (const r of resultados) {
      const rel = path.relative(RAIZ, r.filePath).replace(/\\/g, "/");
      medido[rel] = r.messages.filter(
        (m) => m.ruleId === "fronteira/sem-import-de-app",
      ).length;
    }
    const problemas: string[] = [];
    for (const [arquivo, esperado] of Object.entries(baseline)) {
      const atual = medido[arquivo] ?? 0;
      if (atual > esperado) {
        problemas.push(
          `${arquivo}: ${atual} imports de @/app, baseline ${esperado} — a fronteira lib↛app regrediu; importe de src/lib em vez de subir o baseline.`,
        );
      } else if (atual < esperado) {
        problemas.push(
          `${arquivo}: ${atual} imports de @/app, baseline ${esperado} — obrigado por reduzir; abaixe (ou remova, se 0) a entrada em scripts/lint/fronteira-lib-app.baseline.json.`,
        );
      }
    }
    expect(problemas).toEqual([]);
  }, 120_000);

  it("o config principal ignora só o baseline, e o passivo é exatamente ele", async () => {
    const eslint = novoESLint();
    for (const arquivo of Object.keys(baseline)) {
      const cfg = await eslint.calculateConfigForFile(path.join(RAIZ, arquivo));
      expect(cfg.rules["fronteira/sem-import-de-app"], arquivo).toBeUndefined();
    }
    // Varredura do escopo inteiro com o config de produção: fora do baseline
    // o passivo tem de ser ZERO. Se um import novo entrar em lib, cai aqui.
    const resultados = await eslint.lintFiles([
      "src/lib/**/*.{ts,tsx}",
      "src/components/ui/**/*.{ts,tsx}",
    ]);
    const remanescentes = resultados.flatMap((r) =>
      r.messages
        .filter((m) => m.ruleId === "fronteira/sem-import-de-app")
        .map(
          (m) =>
            `${path.relative(RAIZ, r.filePath).replace(/\\/g, "/")}:${m.line}`,
        ),
    );
    expect(remanescentes).toEqual([]);
    expect(resultados.length).toBeGreaterThan(100);
  }, 180_000);
});
