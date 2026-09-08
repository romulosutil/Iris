import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda de REMOÇÃO, não oráculo de comportamento — e a distinção importa:
 * quem prova de verdade que a varredura está sã é o `pnpm dev` / `pnpm build`,
 * que quebra na hora se o Tailwind gerar CSS inválido. Este teste só impede
 * que a diretiva desapareça num "limpando CSS morto" sem ninguém perceber.
 *
 * O que ela evita: o detector automático da v4 varre a árvore do repositório
 * inteira, e um utilitário arbitrário CITADO num `.md` vira regra gerada. Com
 * `docs/superpowers/plans/2026-08-29-…md` citando um `padding-bottom` com
 * reticências dentro de `env()` — no parágrafo que AVISA para não fazer isso —
 * o Tailwind emitia CSS que o parser recusa (`Unexpected token Delim('.')`), e
 * TODA rota do app passava a responder 500 com o erro apontando uma linha de
 * CSS gerado que não existe em arquivo nenhum do projeto.
 */
describe("escopo de varredura do Tailwind", () => {
  it("mantém markdown fora das fontes de classe", () => {
    const css = readFileSync(
      join(process.cwd(), "src/styles/globals.css"),
      "utf8",
    );

    expect(css).toContain('@source not "../../**/*.md"');
  });
});
