import { test, expect } from "@playwright/test";
import { medirOverflowHorizontal } from "./helpers/viewport";

/**
 * Gate de estouro horizontal das rotas PÚBLICAS em 360px (#185, Etapa 1).
 *
 * Roda só no projeto `mobile-360` (ver `testIgnore` do projeto `chromium`).
 * Não depende de seed: nenhuma destas rotas exige sessão.
 */
const ROTAS_PUBLICAS = [
  { caminho: "/", nome: "landing" },
  { caminho: "/sobre", nome: "sobre" },
  { caminho: "/termos", nome: "termos de uso" },
  { caminho: "/privacidade", nome: "política de privacidade" },
  { caminho: "/login", nome: "login" },
  { caminho: "/cadastro", nome: "cadastro" },
];

for (const rota of ROTAS_PUBLICAS) {
  test(`sem estouro horizontal em 360px — ${rota.nome}`, async ({ page }) => {
    await page.goto(rota.caminho);
    await page.waitForLoadState("networkidle");

    const medida = await medirOverflowHorizontal(page);

    expect(
      medida.larguraDocumento,
      `${rota.caminho} rola na horizontal em ${medida.larguraViewport}px. ` +
        `Documento tem ${medida.larguraDocumento}px. Culpados: ` +
        JSON.stringify(medida.culpados, null, 2),
    ).toBeLessThanOrEqual(medida.larguraViewport + 1);
  });
}
