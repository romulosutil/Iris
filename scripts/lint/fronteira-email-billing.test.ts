import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  DIR_EMAIL,
  especificadoresProibidos,
} from "./regra-fronteira-email-billing.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const DIR_EMAIL_ABS = path.join(RAIZ, DIR_EMAIL);

/**
 * A-02 (#559, fatia F5). Guard textual: nenhum arquivo em `src/lib/email/**`
 * pode importar de `@/lib/billing/**` (nem pelo relativo equivalente).
 *
 * `formatarBRL` — o único símbolo que `src/lib/email` buscava em
 * `src/lib/billing` — mudou-se para `src/lib/moeda.ts` (formatador puro de
 * moeda, sem regra de billing). Com isso a aresta `email → billing`
 * desaparece; a aresta `billing → email` (`notificacao-cancelamento.ts`
 * importando `email/templates` e `email/transacional`) continua existindo e
 * é legítima — billing pode depender de email para notificar, o contrário é
 * que reintroduz o ciclo.
 */
function* arquivosTs(dir: string): Generator<string> {
  for (const entrada of readdirSync(dir)) {
    const caminho = path.join(dir, entrada);
    const info = statSync(caminho);
    if (info.isDirectory()) {
      yield* arquivosTs(caminho);
    } else if (/\.(ts|tsx)$/.test(entrada)) {
      yield caminho;
    }
  }
}

describe("A-02 — guard textual email ↛ billing (#559, F5)", () => {
  it("nenhum arquivo real de src/lib/email importa de src/lib/billing", () => {
    const violacoes: string[] = [];
    for (const arquivo of arquivosTs(DIR_EMAIL_ABS)) {
      const codigo = readFileSync(arquivo, "utf8");
      const proibidos = especificadoresProibidos(codigo, arquivo);
      if (proibidos.length > 0) {
        const rel = path.relative(RAIZ, arquivo).replace(/\\/g, "/");
        for (const esp of proibidos) {
          violacoes.push(`${rel}: import proibido de "${esp}"`);
        }
      }
    }
    expect(
      violacoes,
      "src/lib/email importou de src/lib/billing — a fronteira email ↛ billing " +
        "regrediu (A-02, #559 F5). Mova o que for compartilhado (ex.: formatador " +
        "puro) para src/lib/ e importe de lá, nunca de billing.",
    ).toEqual([]);
  });

  it("varreu pelo menos um arquivo (o guard não pode passar vazio, verde por vazio)", () => {
    const arquivos = [...arquivosTs(DIR_EMAIL_ABS)];
    expect(arquivos.length).toBeGreaterThan(0);
  });
});

describe("A-02 — regra (a extração/resolução acusa de verdade)", () => {
  const arquivoSintetico = path.join(DIR_EMAIL_ABS, "__guard-sintetico.ts");

  it("acusa import estático por alias — inclusive `import type` e re-export", () => {
    expect(
      especificadoresProibidos(
        `import { formatarBRL } from "@/lib/billing/calculator";`,
        arquivoSintetico,
      ),
    ).toContain("@/lib/billing/calculator");
    expect(
      especificadoresProibidos(
        `import type { X } from "@/lib/billing/calculator";`,
        arquivoSintetico,
      ),
    ).toContain("@/lib/billing/calculator");
    expect(
      especificadoresProibidos(
        `export { formatarBRL } from "@/lib/billing/calculator";`,
        arquivoSintetico,
      ),
    ).toContain("@/lib/billing/calculator");
    expect(
      especificadoresProibidos(
        `export * from "@/lib/billing/calculator";`,
        arquivoSintetico,
      ),
    ).toContain("@/lib/billing/calculator");
  });

  it("acusa import de efeito colateral, dynamic import() e require()", () => {
    expect(
      especificadoresProibidos(
        `import "@/lib/billing/calculator";`,
        arquivoSintetico,
      ),
    ).toContain("@/lib/billing/calculator");
    expect(
      especificadoresProibidos(
        `const m = await import("@/lib/billing/calculator");`,
        arquivoSintetico,
      ),
    ).toContain("@/lib/billing/calculator");
    expect(
      especificadoresProibidos(
        `const m = require("@/lib/billing/calculator");`,
        arquivoSintetico,
      ),
    ).toContain("@/lib/billing/calculator");
  });

  it("acusa o relativo equivalente, resolvido pelo filesystem — não pela string crua", () => {
    // src/lib/email/templates.ts -> ../billing/calculator == src/lib/billing/calculator
    expect(
      especificadoresProibidos(
        `import { formatarBRL } from "../billing/calculator";`,
        path.join(DIR_EMAIL_ABS, "templates.ts"),
      ),
    ).toContain("../billing/calculator");
    // grafia alternativa do mesmo destino, um nível mais fundo em email/
    expect(
      especificadoresProibidos(
        `import { formatarBRL } from "../../billing/calculator";`,
        path.join(DIR_EMAIL_ABS, "sub", "arquivo.ts"),
      ),
    ).toContain("../../billing/calculator");
  });

  it("não acusa o caminho legítimo — email importando email, lib neutro ou @/db", () => {
    expect(
      especificadoresProibidos(
        `import { enviarEmailTransacional } from "@/lib/email/transacional";`,
        arquivoSintetico,
      ),
    ).toEqual([]);
    expect(
      especificadoresProibidos(
        `import { formatarBRL } from "@/lib/moeda";`,
        arquivoSintetico,
      ),
    ).toEqual([]);
    expect(
      especificadoresProibidos(
        `import { patient } from "@/db/schema";`,
        arquivoSintetico,
      ),
    ).toEqual([]);
    // relativo que NÃO sai para billing
    expect(
      especificadoresProibidos(
        `import { X } from "./transacional";`,
        arquivoSintetico,
      ),
    ).toEqual([]);
    // a âncora do alias não pode casar um caminho que só COMEÇA com "billing"
    expect(
      especificadoresProibidos(
        `import { x } from "@/lib/billingtaxa/util";`,
        arquivoSintetico,
      ),
    ).toEqual([]);
  });
});
