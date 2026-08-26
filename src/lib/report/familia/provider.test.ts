import { afterEach, describe, expect, it } from "vitest";
import { GeminiFamilyReportProvider } from "./gemini-provider";
import { resolveFamilyReportProvider } from "./provider";
import { StubFamilyReportProvider } from "./stub-provider";

describe("resolveFamilyReportProvider", () => {
  const ORIGINAL_ENABLED = process.env.FAMILY_REPORT_LLM_ENABLED;
  const ORIGINAL_KEY = process.env.GOOGLE_API_KEY;

  afterEach(() => {
    process.env.FAMILY_REPORT_LLM_ENABLED = ORIGINAL_ENABLED;
    process.env.GOOGLE_API_KEY = ORIGINAL_KEY;
  });

  it("retorna stub para clínica demo", () => {
    const provider = resolveFamilyReportProvider({ isDemo: true });
    expect(provider).toBeInstanceOf(StubFamilyReportProvider);
  });

  it("retorna stub em produção quando FAMILY_REPORT_LLM_ENABLED=true mas GOOGLE_API_KEY ausente", () => {
    process.env.FAMILY_REPORT_LLM_ENABLED = "true";
    delete process.env.GOOGLE_API_KEY;
    const provider = resolveFamilyReportProvider({ isDemo: false });
    expect(provider).toBeInstanceOf(StubFamilyReportProvider);
  });

  it("retorna GeminiFamilyReportProvider quando habilitado com GOOGLE_API_KEY presente", () => {
    process.env.FAMILY_REPORT_LLM_ENABLED = "true";
    process.env.GOOGLE_API_KEY = "fake-key-teste";
    const provider = resolveFamilyReportProvider({ isDemo: false });
    expect(provider).toBeInstanceOf(GeminiFamilyReportProvider);
  });
});
