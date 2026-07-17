import { describe, expect, test } from "vitest";
import { validarBloqueio } from "./bloqueio";

const base = { dataInicio: "2026-07-20", dataFim: "2026-08-10", motivo: "Férias" };

describe("bloqueio.ts — validarBloqueio (I-B5)", () => {
  test("clínica: zera terapeutaId e patientId", () => {
    const r = validarBloqueio({ ...base, escopo: "clinica", terapeutaId: "x", patientId: "y" });
    expect(r).toEqual({ ok: true, valor: { escopo: "clinica", terapeutaId: null, patientId: null, ...base } });
  });
  test("terapeuta: exige terapeutaId, zera patientId", () => {
    const r = validarBloqueio({ ...base, escopo: "terapeuta", terapeutaId: "t1", patientId: "p1" });
    expect(r).toEqual({ ok: true, valor: { escopo: "terapeuta", terapeutaId: "t1", patientId: null, ...base } });
  });
  test("paciente: exige patientId, zera terapeutaId", () => {
    const r = validarBloqueio({ ...base, escopo: "paciente", patientId: "p1", terapeutaId: "t1" });
    expect(r).toEqual({ ok: true, valor: { escopo: "paciente", terapeutaId: null, patientId: "p1", ...base } });
  });
  test("terapeuta sem terapeutaId falha", () => {
    expect(validarBloqueio({ ...base, escopo: "terapeuta" })).toEqual({ ok: false, error: expect.stringContaining("terapeuta") });
  });
  test("paciente sem patientId falha", () => {
    expect(validarBloqueio({ ...base, escopo: "paciente" })).toEqual({ ok: false, error: expect.stringContaining("paciente") });
  });
  test("escopo inválido falha", () => {
    expect(validarBloqueio({ ...base, escopo: "geral" }).ok).toBe(false);
  });
  test("dataFim antes de dataInicio falha", () => {
    expect(validarBloqueio({ escopo: "clinica", dataInicio: "2026-08-10", dataFim: "2026-07-20", motivo: "x" }).ok).toBe(false);
  });
  test("motivo vazio falha", () => {
    expect(validarBloqueio({ escopo: "clinica", dataInicio: "2026-07-20", dataFim: "2026-07-21", motivo: "  " }).ok).toBe(false);
  });
});
