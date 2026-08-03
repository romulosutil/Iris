import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Acessibilidade da Landing Page (WCAG 2.1 AA)", () => {
  test("a rota pública raiz (/) não possui violações automáticas de acessibilidade", async ({
    page,
  }) => {
    await page.goto("/");

    // Executa auditoria do axe-core sobre a Landing Page
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(
      results.violations,
      `Violações de acessibilidade encontradas na Landing Page: ${JSON.stringify(results.violations, null, 2)}`,
    ).toEqual([]);
  });
});
