import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
 * recebe `ctx`/`TenantContext` como parâmetro. O `ALLOWLIST` abaixo lista os
 * módulos ainda pendentes de correção (fatias B/C da #55) — deve ENCOLHER a
 * cada fatia, nunca crescer. Um módulo novo vulnerável e fora do allowlist
 * quebra o CI de propósito.
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

/** Normaliza p/ caminho relativo com barras `/` (estável entre SO). */
function rel(abs: string): string {
  return abs.replace(/\\/g, "/").replace(/.*?(src\/app\/.*)$/, "$1");
}

/** Tem a diretiva `"use server"` na primeira linha de código? */
function hasUseServer(src: string): boolean {
  // ignora BOM e linhas em branco iniciais
  const firstCode = src.replace(/^﻿/, "").trimStart();
  return /^["']use server["'];?/.test(firstCode);
}

/**
 * Retorna os nomes de funções exportadas cujo PRIMEIRO parâmetro é `ctx`
 * (ou anotado como `TenantContext`). Cobre `export async function fn(ctx…`,
 * `export function fn(ctx…` e `export const fn = async (ctx…`.
 */
function exportedCtxAcceptingFns(src: string): string[] {
  const hits: string[] = [];
  const fnDecl =
    /export\s+(?:async\s+)?function\s+(\w+)\s*\(\s*(\w+)\s*:\s*([^,)]+)/g;
  const constArrow =
    /export\s+const\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s+)?\(\s*(\w+)\s*:\s*([^,)]+)/g;
  for (const re of [fnDecl, constArrow]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const [, name, param, type] = m;
      if (param === "ctx" || /TenantContext/.test(type ?? "")) hits.push(name!);
    }
  }
  return hits;
}

describe("Issue #55 — nenhum core ctx-accepting exportado de módulo `use server`", () => {
  const appDir = join(process.cwd(), "src", "app");
  const files = readdirSync(appDir, { recursive: true, encoding: "utf8" })
    .filter((f) => /actions\.ts$/.test(f.replace(/\\/g, "/")))
    .map((f) => join(appDir, f));

  test("há módulos `use server` para auditar (sanidade do glob)", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const abs of files) {
    const relPath = rel(abs);
    const src = readFileSync(abs, "utf8");
    if (!hasUseServer(src)) continue;

    test(`${relPath} — exporta só wrappers (nenhuma fn recebe ctx)`, () => {
      const offenders = exportedCtxAcceptingFns(src);
      if (ALLOWLIST.has(relPath)) {
        // Ainda vulnerável por design (pendente de fatia). Documenta a dívida:
        // quando a fatia corrigir, `offenders` fica vazio e a entrada do
        // allowlist deve ser removida (senão este expect falha e cobra a limpeza).
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
