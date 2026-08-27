import { test, expect } from "@playwright/test";
import { entrarComMfa } from "./helpers/sessao";
import { medirOverflowHorizontal } from "./helpers/viewport";

/**
 * Gate de estouro horizontal das rotas AUTENTICADAS em 360px (#185, Etapa 1).
 *
 * Dois papéis porque a navegação e as telas divergem: o coordenador tem a
 * Central de Validação, Equipe e os dados da clínica; o terapeuta tem a fila de
 * pendências. Um gate só no coordenador deixaria metade do shell sem medição.
 *
 * Pré-requisito: `pnpm seed:e2e`.
 */
const ROTAS_COORDENADOR = [
  "/agenda",
  "/pacientes",
  "/validacao",
  "/equipe",
  "/relatorios",
  "/clinica/dados",
  "/duvidas",
  "/perfil",
];

const ROTAS_TERAPEUTA = ["/agenda", "/pacientes", "/pendencias", "/relatorios"];

test.describe("coordenador", () => {
  test.beforeEach(async ({ page }) => {
    await entrarComMfa(page, "e2e@iris.test", "Senha E2E 123");
  });

  for (const caminho of ROTAS_COORDENADOR) {
    test(`sem estouro horizontal em 360px — ${caminho}`, async ({ page }) => {
      await page.goto(caminho);
      await page.waitForLoadState("networkidle");

      const medida = await medirOverflowHorizontal(page);

      expect(
        medida.larguraDocumento,
        `${caminho} rola na horizontal em ${medida.larguraViewport}px. ` +
          `Documento tem ${medida.larguraDocumento}px. Culpados: ` +
          JSON.stringify(medida.culpados, null, 2),
      ).toBeLessThanOrEqual(medida.larguraViewport + 1);
    });
  }
});

test.describe("terapeuta", () => {
  test.beforeEach(async ({ page }) => {
    await entrarComMfa(page, "terapeuta.demo@iris.test", "Senha Demo 123");
  });

  for (const caminho of ROTAS_TERAPEUTA) {
    test(`sem estouro horizontal em 360px — ${caminho}`, async ({ page }) => {
      await page.goto(caminho);
      await page.waitForLoadState("networkidle");

      const medida = await medirOverflowHorizontal(page);

      expect(
        medida.larguraDocumento,
        `${caminho} rola na horizontal em ${medida.larguraViewport}px. ` +
          `Documento tem ${medida.larguraDocumento}px. Culpados: ` +
          JSON.stringify(medida.culpados, null, 2),
      ).toBeLessThanOrEqual(medida.larguraViewport + 1);
    });
  }
});
