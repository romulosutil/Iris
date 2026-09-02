import { describe, expect, it } from "vitest";
import { ESLint, Linter } from "eslint";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  ESCOPO_DS,
  FORA_DO_ESCOPO_DS,
  achadosNoTexto,
  comoGlobLiteral,
  pluginDS,
} from "./regra-ds-paleta-crua.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ARQUIVO_BASELINE = path.join(
  RAIZ,
  "scripts",
  "lint",
  "ds-paleta-crua.baseline.json",
);

/** Arquivos ainda fora da Regra 0 → quantidade de achados. Só pode cair. */
const baseline: Record<string, number> = JSON.parse(
  readFileSync(ARQUIVO_BASELINE, "utf8"),
);

describe("DS-05 — regra ds/sem-paleta-crua (unidade)", () => {
  it("acusa paleta crua e fonte abaixo do piso; deixa tokens passar", () => {
    expect(achadosNoTexto("rounded border border-black bg-white")).toEqual([
      { tipo: "paleta", trecho: "border-black" },
      { tipo: "paleta", trecho: "bg-white" },
    ]);
    expect(achadosNoTexto("hover:bg-slate-900/60 text-gray-400")).toEqual([
      { tipo: "paleta", trecho: "bg-slate-900/60" },
      { tipo: "paleta", trecho: "text-gray-400" },
    ]);
    expect(achadosNoTexto("font-mono text-[10px] font-bold")).toEqual([
      { tipo: "fonte", trecho: "text-[10px]" },
    ]);
    expect(
      achadosNoTexto(
        "text-[var(--text-secondary)] bg-status-success-bg border-[var(--border-brutal)] text-xs text-[12px] bg-surface-card shadow-[var(--ds-shadow)]",
      ),
    ).toEqual([]);
    // Nomes de token que contêm uma cor do Tailwind não são paleta crua.
    expect(
      achadosNoTexto("bg-mint text-blue border-gold bg-terracotta"),
    ).toEqual([]);
  });

  it("só olha literais em contexto de classe (className, cn(), valor de objeto)", () => {
    const linter = new Linter();
    const config = {
      files: ["**/*.tsx"],
      plugins: { ds: pluginDS },
      languageOptions: {
        parserOptions: { ecmaFeatures: { jsx: true } },
        ecmaVersion: 2024 as const,
        sourceType: "module" as const,
      },
      rules: { "ds/sem-paleta-crua": "error" as const },
    };
    const lint = (codigo: string) =>
      linter
        .verify(codigo, [config], { filename: "x.tsx" })
        .filter((m) => m.ruleId === "ds/sem-paleta-crua");

    expect(lint(`const a = <div className="bg-slate-900" />;`)).toHaveLength(1);
    expect(
      lint("const a = <div className={`p-2 ${x} text-[11px]`} />;"),
    ).toHaveLength(1);
    expect(lint(`const a = cn("p-2", ok && "border-black");`)).toHaveLength(1);
    expect(lint(`const m = { alto: "bg-rose-500 text-white" };`)).toHaveLength(
      2,
    );
    expect(lint(`const a = <div className="bg-status-ia-bg" />;`)).toHaveLength(
      0,
    );
    // Texto de copy não é classe.
    expect(lint(`const t = "fundo bg-white não é classe aqui";`)).toHaveLength(
      0,
    );
  });
});

describe("DS-05 — baseline (arquivos ainda fora da Regra 0)", () => {
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
    const eslint = new ESLint({
      cwd: RAIZ,
      overrideConfigFile: path.join(RAIZ, "eslint.config.mjs"),
      // Reativa a regra nos arquivos que o config principal ignora por
      // estarem no baseline: é aqui que a régua se mede.
      overrideConfig: [
        {
          files: arquivos.map(comoGlobLiteral),
          plugins: { ds: pluginDS },
          rules: { "ds/sem-paleta-crua": "error" },
        },
      ],
    });
    const resultados = await eslint.lintFiles(arquivos);
    const medido: Record<string, number> = {};
    for (const r of resultados) {
      const rel = path.relative(RAIZ, r.filePath).replace(/\\/g, "/");
      medido[rel] = r.messages.filter(
        (m) => m.ruleId === "ds/sem-paleta-crua",
      ).length;
    }
    const problemas: string[] = [];
    for (const [arquivo, esperado] of Object.entries(baseline)) {
      const atual = medido[arquivo] ?? 0;
      if (atual > esperado) {
        problemas.push(
          `${arquivo}: ${atual} achados, baseline ${esperado} — a Regra 0 regrediu; troque a paleta crua por token em vez de subir o baseline.`,
        );
      } else if (atual < esperado) {
        problemas.push(
          `${arquivo}: ${atual} achados, baseline ${esperado} — obrigado por reduzir; abaixe (ou remova, se 0) a entrada em scripts/lint/ds-paleta-crua.baseline.json.`,
        );
      }
    }
    expect(problemas).toEqual([]);
  }, 120_000);

  it("o config principal aplica a regra no escopo e ignora só o baseline", async () => {
    const eslint = new ESLint({
      cwd: RAIZ,
      overrideConfigFile: path.join(RAIZ, "eslint.config.mjs"),
    });
    const cfg = await eslint.calculateConfigForFile(
      path.join(RAIZ, "src/components/ui/patterns/marco-status.tsx"),
    );
    expect(cfg.rules["ds/sem-paleta-crua"]?.[0]).toBe(2);
    for (const arquivo of Object.keys(baseline)) {
      const c = await eslint.calculateConfigForFile(path.join(RAIZ, arquivo));
      expect(c.rules["ds/sem-paleta-crua"], arquivo).toBeUndefined();
    }
    expect(ESCOPO_DS.length).toBeGreaterThan(0);
    expect(FORA_DO_ESCOPO_DS).toContain("**/*.test.{ts,tsx}");
    expect(comoGlobLiteral("src/app/(app)/pacientes/[id]/page.tsx")).toBe(
      "src/app/(app)/pacientes/\\[id\\]/page.tsx",
    );
  });
});
