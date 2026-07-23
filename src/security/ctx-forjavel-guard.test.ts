import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * Guard anti-regressão da Issue #55 — "ctx forjável em módulos `use server`".
 *
 * No App Router, TODA função async exportada de um módulo com a diretiva
 * `"use server"` no topo vira uma server-action invocável pelo CLIENTE, com os
 * argumentos controlados pelo cliente. Se um core aceita `ctx: TenantContext`
 * como PARÂMETRO e é exportado desse módulo, o cliente pode forjar o `ctx`
 * (role/clinicId/userId — tudo serializável) → `requireRole` passa com role
 * forjada → `withTenant` seta os GUCs do tenant forjado → **RLS confia no
 * tenant forjado → bypass cross-tenant**.
 *
 * Padrão seguro (PR #54): o core ctx-accepting vive em `logic.ts`
 * (`import "server-only"`, NÃO vira endpoint); o módulo `"use server"` exporta
 * SÓ wrappers `*Action` que derivam o ctx via `getTenantContext()` server-side.
 *
 * Este teste falha se QUALQUER módulo `"use server"` exportar uma função que
 * recebe `ctx`/`TenantContext` em qualquer posição de parâmetro. O `ALLOWLIST`
 * abaixo lista os módulos ainda pendentes de correção (fatias B/C da #55) —
 * deve ENCOLHER a cada fatia, nunca crescer. Um módulo novo vulnerável e fora
 * do allowlist quebra o CI de propósito.
 *
 * NIT conhecido (dívida): parse por regex é frágil a formatação exótica; a
 * evolução natural é uma regra ESLint custom baseada em AST. Enquanto isso,
 * este guard cobre os padrões reais do repo (function decl + const arrow) com
 * balanceamento de parênteses e strip de comentários no topo.
 */

// Módulos AINDA vulneráveis, pendentes de correção nas próximas fatias da #55.
// Remover a entrada quando a fatia correspondente corrigir o módulo.
const ALLOWLIST = new Set<string>([
  // Fatia B — dado clínico + trilha de auditoria
  "src/app/(app)/pacientes/[id]/cadastro-clinico/actions.ts",
  "src/app/(app)/pacientes/[id]/cadastro-clinico/protocolo-actions.ts",
  "src/app/(app)/validacao/actions.ts",
  "src/app/(app)/duvidas/actions.ts",
  "src/app/(app)/revisao/[sessionId]/actions.ts",
  "src/app/(app)/supervisao/actions.ts",
  // Fatia C — sessão/agenda/metas
  "src/app/(app)/diario/[sessionId]/actions.ts",
  "src/app/(app)/agenda/actions.ts",
  "src/app/(app)/pacientes/[id]/metas/actions.ts",
  // NÃO allowlistados de propósito — o guard confirmou que já não expõem core
  // ctx-accepting (varredura da auditoria da #55): `agenda/semana/actions.ts`,
  // `equipe/[id]/actions.ts`, `pacientes/[id]/timeline/actions.ts`,
  // `relatorios/actions.ts` (referência, PR #54). Se algum voltar a expor ctx,
  // o CI quebra — que é o objetivo.
]);

/** Caminho relativo ao cwd com barras `/` (estável entre SO). */
function rel(abs: string): string {
  return relative(process.cwd(), abs).replace(/\\/g, "/");
}

/**
 * Remove BOM + comentários de linha/bloco e espaços do TOPO do arquivo, para
 * que a checagem da diretiva não seja enganada por um `// TODO` antes do
 * `"use server"` (o React/Next permite comentários acima da diretiva).
 */
function stripLeading(src: string): string {
  let s = src.replace(/^﻿/, "");
  for (;;) {
    const t = s.replace(/^\s+/, "");
    if (t.startsWith("//")) {
      s = t.replace(/^\/\/[^\n]*\n?/, "");
      continue;
    }
    if (t.startsWith("/*")) {
      s = t.replace(/^\/\*[\s\S]*?\*\//, "");
      continue;
    }
    s = t;
    break;
  }
  return s;
}

/** Tem a diretiva `"use server"` como primeira instrução (ignorando comentários)? */
function hasUseServer(src: string): boolean {
  return /^["']use server["'];?/.test(stripLeading(src));
}

/** Dado o índice do `(` de abertura, retorna o conteúdo balanceado até o `)`. */
function balancedParams(src: string, openIdx: number): string {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return src.slice(openIdx + 1, i);
    }
  }
  return "";
}

/** Algum parâmetro se chama `ctx` OU é tipado como `TenantContext`? */
function paramsAcceptCtx(params: string): boolean {
  if (/\bTenantContext\b/.test(params)) return true; // tipo em qualquer posição
  // nome `ctx` no início ou após vírgula (cobre 1º, 2º, … argumento)
  return /(^|,)\s*\{?\s*ctx\b/.test(params);
}

/**
 * Nomes de funções exportadas que aceitam ctx em QUALQUER posição de parâmetro.
 * Cobre `export [async] function fn(…)` e `export const fn = [async] (…)`.
 */
function exportedCtxAcceptingFns(src: string): string[] {
  const hits: string[] = [];
  const re =
    /export\s+(?:async\s+)?function\s+(\w+)\s*\(|export\s+const\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s+)?\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const name = m[1] ?? m[2];
    const openIdx = m.index + m[0].length - 1; // posição do `(` (m[0] termina nele)
    if (paramsAcceptCtx(balancedParams(src, openIdx))) hits.push(name!);
  }
  return hits;
}

describe("Issue #55 — nenhum core ctx-accepting exportado de módulo `use server`", () => {
  // Varre TODO arquivo .ts/.tsx sob src — qualquer arquivo com "use server" no
  // topo vira server-actions, não só `actions.ts` (WARN da review).
  const srcDir = join(process.cwd(), "src");
  const files = readdirSync(srcDir, { recursive: true, encoding: "utf8" })
    .map((f) => f.replace(/\\/g, "/"))
    .filter((f) => /\.tsx?$/.test(f) && !/\.d\.ts$/.test(f))
    .map((f) => join(srcDir, f));

  const serverModules = files.filter((abs) =>
    hasUseServer(readFileSync(abs, "utf8")),
  );

  test("há módulos `use server` para auditar (sanidade do glob)", () => {
    expect(serverModules.length).toBeGreaterThan(5);
  });

  for (const abs of serverModules) {
    const relPath = rel(abs);
    const src = readFileSync(abs, "utf8");

    test(`${relPath} — exporta só wrappers (nenhuma fn recebe ctx)`, () => {
      const offenders = exportedCtxAcceptingFns(src);
      if (ALLOWLIST.has(relPath)) {
        // Ainda vulnerável por design (pendente de fatia). Quando a fatia
        // corrigir, `offenders` fica vazio e a entrada do allowlist deve ser
        // removida (senão este expect falha e cobra a limpeza).
        expect(
          offenders.length,
          `${relPath} está no ALLOWLIST mas já não expõe ctx — remover do allowlist.`,
        ).toBeGreaterThan(0);
        return;
      }
      expect(
        offenders,
        `${relPath} exporta função(ões) ctx-accepting sob "use server" → endpoint com ctx forjável (bypass RLS cross-tenant). Mover o core p/ logic.ts (server-only) e exportar só wrappers *Action. Ver Issue #55.`,
      ).toEqual([]);
    });
  }
});
