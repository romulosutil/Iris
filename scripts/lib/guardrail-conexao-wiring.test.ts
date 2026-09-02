import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardrail de conexão por CAPACIDADE (auditoria 360 · S-04 / Q-08, #534).
 *
 * `guardrail-seed-wiring.test.ts` (D52) cobre só os scripts `seed*` listados
 * no `package.json`. `unlock-user.ts`, `backfill-evidence.ts` e
 * `smoke-alerta-risco.mjs` abrem conexão com a role dona (`MIGRATION_DATABASE_URL`)
 * e escrevem — e nenhum deles era alcançado pelo teste de fiação.
 *
 * Aqui a régua não é o nome do script, é o que ele FAZ: todo arquivo em
 * `scripts/**` que abre conexão Postgres (`postgres(`, `new Pool(`,
 * `drizzle(`) precisa invocar o guard de ambiente (`assertSeedAllowed` ou
 * `assertScriptRemotoPermitido`) ANTES, no texto, do primeiro ponto de
 * conexão. Sem isso, um script novo com a role dona apontado para produção
 * roda em silêncio.
 *
 * A exceção é explícita e justificada item a item (`JOBS_DE_PRODUCAO`): jobs
 * que rodam em produção POR DESENHO, cada um sob uma role de login própria
 * com privilégio mínimo. Para eles, "banco remoto" é o caso normal — o guard
 * de loopback os quebraria no painel.
 */

const RAIZ_SCRIPTS = join(__dirname, "..");

/**
 * Jobs de produção que abrem conexão sem o guard de loopback — cada entrada
 * precisa de uma justificativa. O teste falha se uma entrada deixar de existir
 * ou deixar de abrir conexão (allowlist não pode apodrecer).
 */
const JOBS_DE_PRODUCAO: Record<string, string> = {
  "alarme-jobs.mjs":
    "job de alarme (infra/alarme) — lê heartbeats sob ALARME_DATABASE_URL, role própria só de leitura",
  "asr-sweeper-orfaos.mjs":
    "sweeper do bucket efêmero de ASR (infra/asr) — ASR_SWEEPER_DATABASE_URL, role própria",
  "auto-arquivamento.mjs":
    "job de arquivamento por inatividade (infra/arquivamento) — ARQUIVAMENTO_DATABASE_URL herda `iris_arquivamento`",
  "escalonamento-risco.mjs":
    "motor de escalonamento clínico (infra/escalonamento) — ESCALONAMENTO_DATABASE_URL herda `iris_escalonamento`",
  "expurgo-audit-log.mjs":
    "expurgo do Marco Civil (#116) — roda sob DATABASE_URL (app_role) e só chama funções SECURITY DEFINER",
  "migrate.mjs":
    "estágio `migrate` do Dockerfile — é a própria migração de produção; o guard D17 (hash) é o dele",
  "retencao-aviso-previo.mjs":
    "aviso prévio de expurgo (infra/retencao) — RETENCAO_DATABASE_URL herda `iris_retencao`",
};

const PADROES_DE_CONEXAO = [
  /\bpostgres\s*\(/,
  /\bnew\s+Pool\s*\(/,
  /\bdrizzle\s*\(/,
];

const PADRAO_DE_GUARD = /\b(assertSeedAllowed|assertScriptRemotoPermitido)\s*\(/;

const PADRAO_DE_IMPORT_DO_GUARD =
  /import\s*\{[^}]*\b(assertSeedAllowed|assertScriptRemotoPermitido)\b[^}]*\}\s*from\s*["'](\.\/lib\/guardrail-seed|\.\/lib\/guardrail-conexao\.mjs|\.\/guardrail-seed|\.\/guardrail-conexao\.mjs)["']/;

/** Remove comentários de bloco e de linha — a régua é sobre código, não prosa. */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, (m, prefixo: string) => prefixo);
}

function listarScripts(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      // `lib/` são helpers (o próprio guard mora lá) e não têm main.
      if (nome === "lib" || nome === "node_modules") continue;
      saida.push(...listarScripts(caminho));
      continue;
    }
    if (!/\.(ts|mjs)$/.test(nome)) continue;
    if (/\.test\.(ts|mjs)$/.test(nome)) continue;
    saida.push(caminho);
  }
  return saida.sort();
}

function abreConexao(fonte: string): boolean {
  return PADROES_DE_CONEXAO.some((p) => p.test(fonte));
}

function primeiraConexao(fonte: string): { pos: number; padrao: RegExp } {
  let melhor = { pos: -1, padrao: PADROES_DE_CONEXAO[0]! };
  for (const padrao of PADROES_DE_CONEXAO) {
    const pos = fonte.search(padrao);
    if (pos === -1) continue;
    if (melhor.pos === -1 || pos < melhor.pos) melhor = { pos, padrao };
  }
  return melhor;
}

const scripts = listarScripts(RAIZ_SCRIPTS).map((caminho) => ({
  caminho,
  nome: relative(RAIZ_SCRIPTS, caminho).replace(/\\/g, "/"),
  fonte: semComentarios(readFileSync(caminho, "utf8")),
}));

const scriptsQueConectam = scripts.filter((s) => abreConexao(s.fonte));

const scriptsSujeitosAoGuard = scriptsQueConectam.filter(
  (s) => !(s.nome in JOBS_DE_PRODUCAO),
);

describe("guardrail de conexão — fiação por capacidade (#534)", () => {
  it("varre scripts/** e encontra scripts que abrem conexão", () => {
    expect(scripts.length).toBeGreaterThan(0);
    expect(scriptsQueConectam.length).toBeGreaterThan(0);
    // Sanidade da varredura: os três scripts da auditoria têm que ser vistos.
    const nomes = scriptsQueConectam.map((s) => s.nome);
    expect(nomes).toContain("unlock-user.ts");
    expect(nomes).toContain("backfill-evidence.ts");
    expect(nomes).toContain("smoke-alerta-risco.mjs");
  });

  it.each(Object.keys(JOBS_DE_PRODUCAO))(
    "allowlist: %s existe e de fato abre conexão (entrada não apodreceu)",
    (nome) => {
      const script = scripts.find((s) => s.nome === nome);
      expect(
        script,
        `${nome} está na allowlist mas não existe mais em scripts/ — remova a entrada`,
      ).toBeDefined();
      expect(
        abreConexao(script!.fonte),
        `${nome} está na allowlist mas não abre conexão — remova a entrada`,
      ).toBe(true);
      expect(JOBS_DE_PRODUCAO[nome]!.length).toBeGreaterThan(20);
    },
  );

  it.each(scriptsSujeitosAoGuard.map((s) => s.nome))(
    "%s importa o guard de ambiente",
    (nome) => {
      const script = scriptsSujeitosAoGuard.find((s) => s.nome === nome)!;
      expect(
        script.fonte,
        `${nome} abre conexão Postgres mas não importa assertSeedAllowed/assertScriptRemotoPermitido de ./lib/`,
      ).toMatch(PADRAO_DE_IMPORT_DO_GUARD);
    },
  );

  it.each(scriptsSujeitosAoGuard.map((s) => s.nome))(
    "%s invoca o guard ANTES de abrir a conexão",
    (nome) => {
      const script = scriptsSujeitosAoGuard.find((s) => s.nome === nome)!;
      const posGuard = script.fonte.search(PADRAO_DE_GUARD);
      const conexao = primeiraConexao(script.fonte);

      expect(
        posGuard,
        `${nome} abre conexão Postgres (${conexao.padrao}) sem invocar o guard de ambiente`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        posGuard,
        `${nome}: o guard aparece DEPOIS da conexão (guard=${posGuard}, conexão=${conexao.pos})`,
      ).toBeLessThan(conexao.pos);
    },
  );
});
