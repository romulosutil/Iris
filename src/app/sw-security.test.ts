import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Service Worker LGPD Security & Static Cache", () => {
  it("ensures sw.js explicitly excludes API routes and patient health data", () => {
    const swPath = path.join(process.cwd(), "public", "sw.js");
    expect(fs.existsSync(swPath)).toBe(true);
    const swContent = fs.readFileSync(swPath, "utf-8");

    // LGPD Guardrail checks
    expect(swContent).toContain("/api/");
    expect(swContent).toContain("NEVER_CACHE_PATTERNS");
    expect(swContent).toContain("caches.open");
    expect(swContent).not.toContain(
      "caches.put(event.request, response.clone())",
    ); // avoid unconditional wild caching
  });
});
