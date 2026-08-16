import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("TWA Bubblewrap Manifest Configuration", () => {
  it("validates twa-manifest.json structure for Android Play Store build", () => {
    const configPath = path.join(process.cwd(), "twa-manifest.json");
    expect(fs.existsSync(configPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(config.packageId).toBe("com.iris.app");
    expect(config.host).toBe("iris.app");
    expect(config.name).toBe("Iris — Governança Clínica Infantil");
    expect(config.launcherName).toBe("Iris");
    expect(config.startUrl).toBe("/agenda");
    expect(config.themeColor).toBe("#6A4C93");
    expect(config.display).toBe("standalone");
  });
});
