import { describe, it, expect } from "vitest";
import manifest from "./manifest";

describe("PWA Web App Manifest", () => {
  it("returns compliant PWA manifest object", () => {
    const data = manifest();
    expect(data.name).toBe("Iris — Governança Clínica Infantil");
    expect(data.short_name).toBe("Iris");
    expect(data.display).toBe("standalone");
    expect(data.start_url).toBe("/agenda");
    expect(data.theme_color).toBe("#6A4C93");
    expect(data.background_color).toBe("#F8FAFC");
    expect(data.icons?.length).toBeGreaterThanOrEqual(3);

    const maskableIcon = data.icons?.find(
      (icon) => icon.purpose === "maskable",
    );
    expect(maskableIcon).toBeDefined();
    expect(maskableIcon?.sizes).toBe("512x512");
  });
});
