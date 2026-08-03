import { describe, it, expect } from "vitest";
import sitemap from "./sitemap";

describe("Sitemap dinâmico (/sitemap.xml)", () => {
  it("retorna URLs públicas principais com prioridades e frequências válidas", async () => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://irisclinica.ia.br";
    const items = await sitemap();
    const urls = items.map((i) => i.url);
    expect(urls).toContain(baseUrl);
    expect(urls).toContain(`${baseUrl}/login`);
    expect(urls).toContain(`${baseUrl}/cadastro`);
    expect(urls).toContain(`${baseUrl}/termos`);
    expect(urls).toContain(`${baseUrl}/privacidade`);

    const homeItem = items.find((i) => i.url === baseUrl);
    expect(homeItem?.priority).toBe(1.0);
  });
});
