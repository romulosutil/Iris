/**
 * Gate anti-pulo-silencioso para o job `test-e2e` (#424), no mesmo espírito
 * de `verificar-cobertura-testes.mjs` (vitest) — mas lendo o relatório JSON
 * do Playwright, que tem outro formato (`stats.expected/skipped/unexpected`,
 * `suites[].file`).
 *
 * Por que existe: a suíte `e2e/` nunca rodou em CI (#424) — sem este gate, um
 * `playwright.config.ts` mal configurado (testMatch errado, projeto que não
 * roda) sairia verde com poucos ou zero specs, do mesmo jeito que os 64/68
 * arquivos RLS pulados em silêncio (`verificar-cobertura-testes.mjs`).
 *
 * Reprova se:
 *   1. o total de testes executados (`stats.expected + stats.flaky`) ficar
 *      abaixo do piso;
 *   2. o total de ARQUIVOS de spec (`suites[].file`, distintos) ficar abaixo
 *      do piso;
 *   3. houver qualquer teste pulado (`stats.skipped > 0`);
 *   4. houver qualquer teste não-esperado (`stats.unexpected > 0` — falhou em
 *      todas as tentativas, incluindo timeout);
 *   5. (#542, Q-06) a contagem de testes flaky POR ARQUIVO subir acima do
 *      baseline em `--flaky-baseline` — ver seção abaixo.
 *
 * Por que a contagem soma `flaky`: o Playwright move o teste que falhou e
 * passou no retry de `expected` para `flaky`. Contar só `expected` faz a
 * cobertura "cair" (16 de 17) por causa de instabilidade, não de spec sumido —
 * o gate reprovava com a mensagem errada ("cobertura caiu abaixo do esperado"),
 * apontando para o defeito que não é. Isso resolve #424, mas cria um segundo
 * problema (#542, achado Q-06 da auditoria 360): `flaky` nunca vira falha —
 * um teste que já foi mitigado (ex.: `test.slow()` na PR #581) pode voltar a
 * oscilar em CI e ninguém fica sabendo, porque o gate está verde. A suíte
 * inteira também não tolera zero flake: em 5 execuções medidas em 02/09/2026,
 * 3 saíram com `flaky=0` e 2 com 1-2 flakes, sempre no projeto `[mobile-360]`
 * (`mobile-navegacao.spec.ts`, `mobile-toque.spec.ts`, `mobile-app.spec.ts`).
 * Um piso duro `--max-flaky=0` reprovaria ~40% das execuções por ruído
 * conhecido — por isso o baseline é por ARQUIVO (mesma forma de
 * `scripts/lint/ds-paleta-crua.baseline.json` + `.test.ts`): os 3 arquivos
 * conhecidos entram com o teto medido, qualquer flake NOVO (arquivo fora do
 * baseline, ou contagem acima do teto) reprova na hora. Diferente do lint
 * (determinístico por execução), flake é estocástico — por isso, ao contrário
 * do padrão DS, ficar ABAIXO do baseline também passa (não força reduzir o
 * teto a cada corrida limpa).
 *
 * Uso:
 *   node scripts/ci/verificar-cobertura-e2e.mjs <relatorio.json> \
 *     --min-tests=17 --min-files=10 \
 *     --flaky-baseline=scripts/ci/e2e-flaky.baseline.json
 *
 * Pisos medidos em 23/08/2026, suíte local do zero (`pnpm seed:e2e` +
 * `pnpm test:e2e`): 10 arquivos (9 specs + `servidor.setup.ts`), 17 testes,
 * 0 falha, 0 pulado.
 */
import { readFileSync } from "node:fs";

const USO =
  "uso: node verificar-cobertura-e2e.mjs <relatorio.json> --min-tests=N --min-files=N --flaky-baseline=<arquivo.json>";

export class ErroDeUso extends Error {}

function pisoInteiro(key, value) {
  if (value.trim() === "") {
    throw new ErroDeUso(`--${key} veio vazio — piso ausente desliga o gate`);
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new ErroDeUso(
      `--${key}=${value} não é inteiro >= 0 — piso inválido desliga o gate em silêncio`,
    );
  }
  return n;
}

export function parseArgs(argv) {
  const [reportPath, ...rest] = argv;
  if (!reportPath) {
    throw new ErroDeUso(`relatório não informado. ${USO}`);
  }
  const opts = { minTests: null, minFiles: null, flakyBaselinePath: null };
  for (const arg of rest) {
    const m = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (!m) {
      throw new ErroDeUso(`argumento não reconhecido: ${arg}. ${USO}`);
    }
    const [, key, value] = m;
    switch (key) {
      case "min-tests":
        opts.minTests = pisoInteiro(key, value);
        break;
      case "min-files":
        opts.minFiles = pisoInteiro(key, value);
        break;
      case "flaky-baseline":
        if (value.trim() === "") {
          throw new ErroDeUso(
            `--flaky-baseline veio vazio — sem arquivo o gate não distingue flake conhecido de flake novo`,
          );
        }
        opts.flakyBaselinePath = value;
        break;
      default:
        throw new ErroDeUso(`flag desconhecida --${key}. ${USO}`);
    }
  }
  if (opts.minTests === null || opts.minFiles === null) {
    throw new ErroDeUso(
      `--min-tests e --min-files são obrigatórios: sem piso o gate aprova qualquer coisa. ${USO}`,
    );
  }
  if (!opts.flakyBaselinePath) {
    throw new ErroDeUso(
      `--flaky-baseline é obrigatório: sem ele, todo teste flaky passaria em silêncio. ${USO}`,
    );
  }
  return { reportPath, ...opts };
}

/**
 * Percorre `report.suites` (recursivo — describe blocks aninham suites
 * dentro de suites) coletando todo teste com `status === "flaky"`. O `file`
 * só existe na suíte de topo (o arquivo de spec); suites aninhadas herdam.
 */
export function coletarFlaky(report) {
  const encontrados = [];
  function visitarSuite(suite, arquivoDoArquivo) {
    const arquivo = suite.file ?? arquivoDoArquivo;
    for (const spec of suite.specs ?? []) {
      for (const teste of spec.tests ?? []) {
        if (teste.status === "flaky") {
          encontrados.push({
            arquivo: arquivo ?? "(arquivo desconhecido)",
            titulo: spec.title ?? "(sem título)",
            linha: spec.line ?? null,
            projeto: teste.projectName ?? "(projeto desconhecido)",
          });
        }
      }
    }
    for (const sub of suite.suites ?? []) {
      visitarSuite(sub, arquivo);
    }
  }
  for (const suite of report.suites ?? []) {
    visitarSuite(suite, suite.file);
  }
  return encontrados;
}

/**
 * Normaliza a chave de arquivo usada no baseline de flake.
 *
 * O relatório JSON do Playwright emite `suite.file` RELATIVO ao `testDir`
 * (`mobile-navegacao.spec.ts`), enquanto é natural escrever o baseline com o
 * caminho como se vê no repositório (`e2e/mobile-navegacao.spec.ts`). Sem
 * normalizar as duas pontas o lookup erra, cai no `?? 0` e TODO flake conhecido
 * reprova — o baseline fica inerte e o gate vira um `--max-flaky=0` duro, que é
 * exatamente o que ele existe para evitar (medido: reprovaria ~40% das
 * execuções por ruído já conhecido). Foi assim que a primeira versão deste gate
 * reprovou o próprio CI da PR que o introduziu.
 */
export function normalizarArquivoFlaky(arquivo) {
  return String(arquivo ?? "")
    .split("\\")
    .join("/")
    .replace(/^\.\//, "")
    .replace(/^e2e\//, "");
}

function contarFlakyPorArquivo(flakyTestes) {
  const contagem = {};
  for (const t of flakyTestes) {
    const chave = normalizarArquivoFlaky(t.arquivo);
    contagem[chave] = (contagem[chave] ?? 0) + 1;
  }
  return contagem;
}

export function formatarFlaky(t) {
  return `${t.arquivo}:${t.linha ?? "?"} "${t.titulo}" [${t.projeto}]`;
}

export function verificarCoberturaE2E(report, opts = {}) {
  const { minTests = 0, minFiles = 0, baselineFlaky = {} } = opts;
  // Normaliza também as chaves do baseline: aceita `e2e/x.spec.ts` e `x.spec.ts`.
  const baselineNormalizado = {};
  for (const [k, v] of Object.entries(baselineFlaky)) {
    baselineNormalizado[normalizarArquivoFlaky(k)] = v;
  }
  const stats = report.stats ?? {};
  const expected = stats.expected ?? 0;
  const skipped = stats.skipped ?? 0;
  const unexpected = stats.unexpected ?? 0;
  const flaky = stats.flaky ?? 0;
  const arquivos = new Set((report.suites ?? []).map((s) => s.file));
  // `flaky` também rodou: falhou e passou no retry. Só `unexpected` não rodou
  // com sucesso — e esse tem verificação própria abaixo.
  const executados = expected + flaky;

  const problemas = [];

  if (executados === 0) {
    problemas.push(
      "ZERO testes executados — testMatch/projects do playwright.config.ts provavelmente errado",
    );
  }
  if (executados < minTests) {
    problemas.push(
      `${executados} teste(s) executado(s), piso é ${minTests} — cobertura caiu abaixo do esperado`,
    );
  }
  if (arquivos.size < minFiles) {
    problemas.push(
      `${arquivos.size} arquivo(s) de spec executado(s), piso é ${minFiles} — specs sumiram da coleta`,
    );
  }
  if (skipped > 0) {
    problemas.push(
      `${skipped} teste(s) pulado(s) — ambiente de CI nunca deveria disparar skip`,
    );
  }
  if (unexpected > 0) {
    problemas.push(`${unexpected} teste(s) com resultado inesperado (falha)`);
  }

  const flakyTestes = coletarFlaky(report);
  const flakyPorArquivo = contarFlakyPorArquivo(flakyTestes);
  for (const [arquivo, contagem] of Object.entries(flakyPorArquivo)) {
    const permitido = baselineNormalizado[arquivo] ?? 0;
    if (contagem > permitido) {
      problemas.push(
        `${arquivo}: ${contagem} teste(s) flaky, baseline permite ${permitido} — flake novo ou piorado (não suba o baseline sem investigar): ${flakyTestes
          .filter((t) => t.arquivo === arquivo)
          .map(formatarFlaky)
          .join("; ")}`,
      );
    }
  }

  return {
    ok: problemas.length === 0,
    problemas,
    stats: {
      arquivos: arquivos.size,
      executados,
      expected,
      skipped,
      unexpected,
      flaky,
    },
    flakyTestes,
  };
}

export function main() {
  let argumentos;
  try {
    argumentos = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (!(err instanceof ErroDeUso)) throw err;
    console.error(`[cobertura-e2e] ${err.message}`);
    process.exit(2);
  }
  const { reportPath, minTests, minFiles, flakyBaselinePath } = argumentos;

  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch (err) {
    console.error(
      `[cobertura-e2e] não consegui ler/parsear ${reportPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
    console.error(
      "[cobertura-e2e] sem relatório íntegro, não há como provar que algo rodou — falhando.",
    );
    process.exit(1);
  }

  let baselineFlaky;
  try {
    baselineFlaky = JSON.parse(readFileSync(flakyBaselinePath, "utf8"));
  } catch (err) {
    console.error(
      `[cobertura-e2e] não consegui ler/parsear ${flakyBaselinePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
    console.error(
      "[cobertura-e2e] sem baseline íntegro, não há como distinguir flake conhecido de flake novo — falhando.",
    );
    process.exit(1);
  }

  const resultado = verificarCoberturaE2E(report, {
    minTests,
    minFiles,
    baselineFlaky,
  });
  const { arquivos, executados, expected, skipped, unexpected, flaky } =
    resultado.stats;

  console.log(
    `[cobertura-e2e] arquivos=${arquivos} testes=${executados} (estáveis=${expected} flaky=${flaky}) pulado=${skipped} inesperado=${unexpected}`,
  );

  if (resultado.flakyTestes.length > 0) {
    console.log(`[cobertura-e2e] flaky (${resultado.flakyTestes.length}):`);
    for (const t of resultado.flakyTestes) {
      console.log(`  - ${formatarFlaky(t)}`);
    }
  }

  if (!resultado.ok) {
    console.error("[cobertura-e2e] REPROVADO:");
    for (const p of resultado.problemas) console.error(`  - ${p}`);
    process.exit(1);
  }

  console.log("[cobertura-e2e] OK — exit 0 é prova, não suposição.");
}

if (
  process.argv[1] &&
  process.argv[1].endsWith("verificar-cobertura-e2e.mjs")
) {
  main();
}
