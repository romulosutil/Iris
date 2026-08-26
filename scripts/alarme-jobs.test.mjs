import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  deveAlertar,
  marcarAlertado,
  verificarBilling,
  verificarEscalonamento,
} from "./alarme-jobs.mjs";

function sqlDubleQueRetorna(linhas) {
  return function sql() {
    return Promise.resolve(linhas);
  };
}

function sqlDubleQueLanca(mensagem) {
  return function sql() {
    return Promise.reject(new Error(mensagem));
  };
}

let heartbeatDir;

beforeEach(async () => {
  heartbeatDir = await mkdtemp(path.join(tmpdir(), "iris-alarme-"));
});

afterEach(async () => {
  await rm(heartbeatDir, { recursive: true, force: true });
});

describe("alarme-jobs.mjs — dedup (#294)", () => {
  test("primeira checagem do dia deve alertar", async () => {
    expect(await deveAlertar(heartbeatDir, "billing", "2026-08-25")).toBe(true);
  });

  test("depois de marcado, não alerta de novo no MESMO dia", async () => {
    await marcarAlertado(heartbeatDir, "billing", "2026-08-25");
    expect(await deveAlertar(heartbeatDir, "billing", "2026-08-25")).toBe(
      false,
    );
  });

  test("dia seguinte alerta de novo mesmo com marcador de ontem", async () => {
    await marcarAlertado(heartbeatDir, "billing", "2026-08-25");
    expect(await deveAlertar(heartbeatDir, "billing", "2026-08-26")).toBe(true);
  });

  test("motivos diferentes não compartilham marcador", async () => {
    await marcarAlertado(heartbeatDir, "billing", "2026-08-25");
    expect(await deveAlertar(heartbeatDir, "escalonamento", "2026-08-25")).toBe(
      true,
    );
  });

  test("diretório inexistente não estoura — trata como 'nunca alertou'", async () => {
    expect(
      await deveAlertar(`${heartbeatDir}/nao-existe`, "billing", "2026-08-25"),
    ).toBe(true);
  });
});

describe("alarme-jobs.mjs — verificarBilling (#294)", () => {
  test("total: 0 → ok, detalhe vazio", async () => {
    const sql = sqlDubleQueRetorna([{ total: 0 }]);
    const resultado = await verificarBilling(sql);
    expect(resultado).toEqual({ estado: "ok", motivo: "billing", detalhe: "" });
  });

  test("total: 3 com clínica e vencimento → problema, detalhe cita contagem e clínica", async () => {
    const sql = sqlDubleQueRetorna([
      {
        total: 3,
        primeira_clinic_id: "11111111-1111-1111-1111-111111111111",
        primeiro_vencimento: "2026-08-25T10:00:00.000Z",
      },
    ]);
    const resultado = await verificarBilling(sql);
    expect(resultado.estado).toBe("problema");
    expect(resultado.motivo).toBe("billing");
    expect(resultado.detalhe).toContain("3 ciclo(s)");
    expect(resultado.detalhe).toContain(
      "11111111-1111-1111-1111-111111111111",
    );
  });

  test("array vazio (sem linha) → ok, não estoura em linha.total", async () => {
    const sql = sqlDubleQueRetorna([]);
    const resultado = await verificarBilling(sql);
    expect(resultado).toEqual({ estado: "ok", motivo: "billing", detalhe: "" });
  });

  test("dublê que lança → indeterminado, nunca ok", async () => {
    const sql = sqlDubleQueLanca("permission denied for function");
    const resultado = await verificarBilling(sql);
    expect(resultado.estado).toBe("indeterminado");
    expect(resultado.estado).not.toBe("ok");
    expect(resultado.motivo).toBe("billing");
    expect(resultado.detalhe).toContain("permission denied for function");
  });
});

describe("alarme-jobs.mjs — verificarEscalonamento (#294)", () => {
  test("total: 0 → ok, detalhe vazio", async () => {
    const sql = sqlDubleQueRetorna([{ total: 0 }]);
    const resultado = await verificarEscalonamento(sql);
    expect(resultado).toEqual({
      estado: "ok",
      motivo: "escalonamento",
      detalhe: "",
    });
  });

  test("total: 3 com clínica e vencimento → problema, detalhe cita contagem e clínica", async () => {
    const sql = sqlDubleQueRetorna([
      {
        total: 3,
        primeira_clinic_id: "22222222-2222-2222-2222-222222222222",
        primeiro_vencimento: "2026-08-25T10:00:00.000Z",
      },
    ]);
    const resultado = await verificarEscalonamento(sql);
    expect(resultado.estado).toBe("problema");
    expect(resultado.motivo).toBe("escalonamento");
    expect(resultado.detalhe).toContain("3 alerta(s)");
    expect(resultado.detalhe).toContain(
      "22222222-2222-2222-2222-222222222222",
    );
  });

  test("array vazio (sem linha) → ok, não estoura em linha.total", async () => {
    const sql = sqlDubleQueRetorna([]);
    const resultado = await verificarEscalonamento(sql);
    expect(resultado).toEqual({
      estado: "ok",
      motivo: "escalonamento",
      detalhe: "",
    });
  });

  test("dublê que lança → indeterminado, nunca ok", async () => {
    const sql = sqlDubleQueLanca("connection refused");
    const resultado = await verificarEscalonamento(sql);
    expect(resultado.estado).toBe("indeterminado");
    expect(resultado.estado).not.toBe("ok");
    expect(resultado.motivo).toBe("escalonamento");
    expect(resultado.detalhe).toContain("connection refused");
  });
});
