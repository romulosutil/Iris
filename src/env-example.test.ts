import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

/**
 * `.env.example` é o mapa obrigatório de configuração (CLAUDE.md, AGENTS.md
 * §5.5): quem sobe um serviço novo no Easypanel ou monta um mock lê dali.
 * A auditoria 360 (DX-01) achou 17 variáveis lidas no código sem linha no
 * arquivo (14 de configuração real; as outras 3 — `NODE_ENV`, `CI_BASE_REF`,
 * `ALVO` — são do runtime/CI e estão na allowlist abaixo) — um agente que
 * confiasse no mapa nasceria sem `ALARME_DATABASE_URL`. Este guard estático
 * compara os dois conjuntos.
 *
 * Regra: toda variável lida via `process.env.<NOME>` ou `process.env["<NOME>"]`
 * em `src|scripts|infra` tem uma linha `<NOME>=` ou `# <NOME>=` no
 * `.env.example` (comentada vale — documenta nome, default e onde vai). Fora
 * da regra só o que não é configuração do produto (allowlist abaixo, cada item
 * com o porquê). Limite declarado: acesso dinâmico (`process.env[nome]` com
 * variável) não é rastreável estaticamente e fica fora do guard.
 *
 * Segundo limite: a varredura é TEXTUAL — não distingue código de comentário.
 * Escrever `process.env.<PLACEHOLDER>` em prosa cria uma variável fantasma que
 * o guard cobra no `.env.example`. Em documentação, citar o nome sem o prefixo
 * `process.env.` (ex.: `<SUPERFICIE>_JOB_TOKEN`).
 */

const RAIZ = path.resolve(__dirname, "..");
const PASTAS = ["src", "scripts", "infra"];
const EXTENSOES = /\.(ts|tsx|mjs|js)$/;
const IGNORAR_DIRS = new Set(["node_modules", ".next", "dist", "coverage"]);

const ALLOWLIST: ReadonlyMap<string, string> = new Map([
  ["NODE_ENV", "definida pelo runtime (Next/Node), não é configuração nossa"],
  [
    "NEXT_RUNTIME",
    'definida pelo Next ("nodejs" | "edge"), não é configuração nossa: src/instrumentation.ts a lê para instalar o sink do logger só no runtime Node',
  ],
  [
    "ALVO",
    "parâmetro interno de scripts/ci/verificar-deps-imagem.mjs (roda dentro da imagem, no CI)",
  ],
]);
/** Prefixos inteiros fora da regra (variáveis do runner de CI). */
const PREFIXOS_ALLOWLIST = ["CI_"];

function listarArquivos(dir: string): string[] {
  const saida: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (entrada.isDirectory()) {
      if (IGNORAR_DIRS.has(entrada.name)) continue;
      saida.push(...listarArquivos(path.join(dir, entrada.name)));
    } else if (EXTENSOES.test(entrada.name)) {
      saida.push(path.join(dir, entrada.name));
    }
  }
  return saida;
}

/** Leituras de `process.env` nas pastas vigiadas → { nome: [arquivos] }. */
export function variaveisLidasNoCodigo(raiz = RAIZ): Map<string, string[]> {
  const usos = new Map<string, string[]>();
  for (const pasta of PASTAS) {
    for (const arquivo of listarArquivos(path.join(raiz, pasta))) {
      const conteudo = readFileSync(arquivo, "utf8");
      for (const m of conteudo.matchAll(
        /process\.env(?:\.([A-Z][A-Z0-9_]*)|\[["']([A-Z][A-Z0-9_]*)["']\])/g,
      )) {
        const nome = m[1] ?? m[2];
        if (!nome) continue;
        const lista = usos.get(nome) ?? [];
        const rel = path.relative(raiz, arquivo).replaceAll("\\", "/");
        if (!lista.includes(rel)) lista.push(rel);
        usos.set(nome, lista);
      }
    }
  }
  return usos;
}

/** Chaves documentadas: linha começando com `X=` ou `# X=` (CRLF tolerado). */
export function chavesDoEnvExample(raiz = RAIZ): Set<string> {
  const conteudo = readFileSync(path.join(raiz, ".env.example"), "utf8");
  const chaves = new Set<string>();
  for (const m of conteudo.matchAll(/^#?[ \t]*([A-Z][A-Z0-9_]*)=/gm)) {
    if (m[1]) chaves.add(m[1]);
  }
  return chaves;
}

function foraDaRegra(nome: string): boolean {
  if (ALLOWLIST.has(nome)) return true;
  return PREFIXOS_ALLOWLIST.some((p) => nome.startsWith(p));
}

describe(".env.example cobre toda variável lida no código (DX-01)", () => {
  const lidas = variaveisLidasNoCodigo();
  const documentadas = chavesDoEnvExample();

  test("a varredura encontrou variáveis e o .env.example tem chaves", () => {
    // Sanidade: se o regex ou o caminho quebrarem, o teste abaixo passaria
    // por vácuo. Piso baixo de propósito — o número real é maior.
    expect(lidas.size).toBeGreaterThan(30);
    expect(documentadas.size).toBeGreaterThan(30);
    expect(documentadas.has("DATABASE_URL")).toBe(true);
  });

  test("nenhuma variável lida em src|scripts|infra falta no .env.example", () => {
    const faltantes = [...lidas.entries()]
      .filter(([nome]) => !documentadas.has(nome) && !foraDaRegra(nome))
      .map(([nome, arquivos]) => `${nome} (lida em ${arquivos.join(", ")})`)
      .sort();
    expect(
      faltantes,
      `Documente no .env.example (linha \`# NOME=\` com comentário e default) ou justifique na ALLOWLIST deste teste:\n${faltantes.join("\n")}`,
    ).toEqual([]);
  });

  test("a allowlist só contém nomes que o código ainda lê", () => {
    // Allowlist órfã é ruído que esconde o dia em que a variável voltar.
    for (const nome of ALLOWLIST.keys()) {
      expect(lidas.has(nome), `${nome} está na allowlist mas ninguém lê`).toBe(
        true,
      );
    }
  });
});
