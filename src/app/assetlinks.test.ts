import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { GET } from "./.well-known/assetlinks.json/route";

describe("Digital Asset Links (TWA Android Verification)", () => {
  it("validates static assetlinks.json file format and fingerprint structure", () => {
    const file = path.join(
      process.cwd(),
      "public",
      ".well-known",
      "assetlinks.json",
    );
    expect(fs.existsSync(file)).toBe(true);
    const content = JSON.parse(fs.readFileSync(file, "utf-8"));
    expect(Array.isArray(content)).toBe(true);
    expect(content[0].relation).toContain(
      "delegate_permission/common.handle_all_urls",
    );
    expect(content[0].target.package_name).toBe("com.iris.app");
    expect(content[0].target.sha256_cert_fingerprints.length).toBeGreaterThan(
      0,
    );
  });

  it("serves assetlinks via Next.js route with application/json header", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = await response.json();
    expect(body[0].target.package_name).toBe("com.iris.app");
  });
});
