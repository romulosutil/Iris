import { describe, it, expect } from "vitest";
import robots from "./robots";

describe("Robots.txt dinâmico (/robots.txt)", () => {
  it("permite a raiz pública e restringe diretórios internos/API", () => {
    const config = robots();
    expect(config.sitemap).toContain("/sitemap.xml");
    const rules = Array.isArray(config.rules) ? config.rules[0] : config.rules;
    expect(rules).toBeDefined();
    if (rules && typeof rules === "object" && !Array.isArray(rules)) {
      expect(rules.disallow).toContain("/api/");
      expect(rules.disallow).toContain("/agenda");
      expect(rules.allow).toBe("/");
    }
  });
});
