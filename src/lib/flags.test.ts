import { afterEach, describe, expect, test } from "vitest";
import { asrHabilitado } from "./flags";

describe("flags.ts — asrHabilitado (T13, #72)", () => {
  afterEach(() => {
    delete process.env.FEATURE_FLAG_ASR_ENABLED;
  });

  test("variável ausente → false (fail-closed)", () => {
    delete process.env.FEATURE_FLAG_ASR_ENABLED;
    expect(asrHabilitado()).toBe(false);
  });

  test('valor "false" → false', () => {
    process.env.FEATURE_FLAG_ASR_ENABLED = "false";
    expect(asrHabilitado()).toBe(false);
  });

  test('valor "1" → false', () => {
    process.env.FEATURE_FLAG_ASR_ENABLED = "1";
    expect(asrHabilitado()).toBe(false);
  });

  test('valor "yes" → false', () => {
    process.env.FEATURE_FLAG_ASR_ENABLED = "yes";
    expect(asrHabilitado()).toBe(false);
  });

  test('valor "true" → true', () => {
    process.env.FEATURE_FLAG_ASR_ENABLED = "true";
    expect(asrHabilitado()).toBe(true);
  });
});
