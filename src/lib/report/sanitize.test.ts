import { describe, expect, test } from "vitest";
import { escapeHtml } from "./sanitize";

describe("escapeHtml", () => {
  test("neutraliza markup injetado no texto livre", () => {
    expect(escapeHtml(`<img src=x onerror=1>`)).toBe(
      "&lt;img src=x onerror=1&gt;",
    );
    expect(escapeHtml(`a & b "c" 'd'`)).toBe(
      "a &amp; b &quot;c&quot; &#39;d&#39;",
    );
  });
});
