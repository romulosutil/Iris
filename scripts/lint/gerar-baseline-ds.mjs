/**
 * Regenera `scripts/lint/ds-paleta-crua.baseline.json` (DS-05, #538): roda a
 * regra `ds/sem-paleta-crua` em TODO o escopo (ignorando o baseline atual) e
 * grava `{ "caminho/relativo.tsx": ocorrências }` só para os arquivos com
 * achados. Use quando uma contagem CAI (o teste unitário pede); nunca para
 * absorver aumento — aí a resposta é trocar a paleta crua por token.
 *
 *   node scripts/lint/gerar-baseline-ds.mjs
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { ESLint } from "eslint";
import {
  ESCOPO_DS,
  FORA_DO_ESCOPO_DS,
  pluginDS,
} from "./regra-ds-paleta-crua.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const DESTINO = path.join(
  RAIZ,
  "scripts",
  "lint",
  "ds-paleta-crua.baseline.json",
);

const eslint = new ESLint({
  cwd: RAIZ,
  overrideConfigFile: path.join(RAIZ, "eslint.config.mjs"),
  overrideConfig: [
    {
      files: ESCOPO_DS,
      ignores: FORA_DO_ESCOPO_DS,
      plugins: { ds: pluginDS },
      rules: { "ds/sem-paleta-crua": "error" },
    },
  ],
});

const resultados = await eslint.lintFiles(ESCOPO_DS);
const baseline = {};
for (const r of resultados) {
  const n = r.messages.filter((m) => m.ruleId === "ds/sem-paleta-crua").length;
  if (n > 0) {
    baseline[path.relative(RAIZ, r.filePath).replace(/\\/g, "/")] = n;
  }
}
const ordenado = Object.fromEntries(
  Object.entries(baseline).sort(([a], [b]) => a.localeCompare(b)),
);
writeFileSync(DESTINO, JSON.stringify(ordenado, null, 2) + "\n");
const total = Object.values(ordenado).reduce((s, n) => s + n, 0);
console.log(
  `baseline DS-05: ${Object.keys(ordenado).length} arquivos, ${total} ocorrências → ${path.relative(RAIZ, DESTINO)}`,
);
