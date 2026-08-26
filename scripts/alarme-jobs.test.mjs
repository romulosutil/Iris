import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  deveAlertar,
  idadeMaisRecenteH,
  marcarAlertado,
  verificarBackupOffsite,
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

describe("alarme-jobs.mjs — idadeMaisRecenteH (#294)", () => {
  test("três objetos → idade do mais recente por lastModified, não por nome nem por ordem", () => {
    const agora = Date.parse("2026-08-25T12:00:00.000Z");
    const ndjson = [
      JSON.stringify({
        key: "dump-2026-08-20.sql.age",
        type: "file",
        lastModified: "2026-08-20T12:00:00.000Z",
      }),
      // nome "mais novo" alfabeticamente, mas lastModified mais ANTIGO —
      // é este caso que mata implementação por regex de nome.
      JSON.stringify({
        key: "dump-9999-99-99.sql.age",
        type: "file",
        lastModified: "2026-08-10T00:00:00.000Z",
      }),
      JSON.stringify({
        key: "dump-2026-08-24.sql.age",
        type: "file",
        lastModified: "2026-08-24T18:00:00.000Z",
      }),
    ].join("\n");
    expect(idadeMaisRecenteH(ndjson, agora)).toBeCloseTo(18, 5);
  });

  test("listagem só com folders → null", () => {
    const ndjson = JSON.stringify({ key: "subpasta/", type: "folder" });
    expect(idadeMaisRecenteH(ndjson, Date.now())).toBeNull();
  });

  test("string vazia → null", () => {
    expect(idadeMaisRecenteH("", Date.now())).toBeNull();
  });

  test("linha em branco no meio do NDJSON não estoura", () => {
    const agora = Date.parse("2026-08-25T12:00:00.000Z");
    const ndjson = [
      JSON.stringify({
        key: "dump-2026-08-24.sql.age",
        type: "file",
        lastModified: "2026-08-24T12:00:00.000Z",
      }),
      "",
      "   ",
      JSON.stringify({
        key: "dump-2026-08-23.sql.age",
        type: "file",
        lastModified: "2026-08-23T12:00:00.000Z",
      }),
    ].join("\n");
    expect(idadeMaisRecenteH(ndjson, agora)).toBeCloseTo(24, 5);
  });
});

describe("alarme-jobs.mjs — verificarBackupOffsite (#294)", () => {
  test("env sem as variáveis obrigatórias → indeterminado, NÃO problema", async () => {
    const resultado = await verificarBackupOffsite({});
    expect(resultado.estado).toBe("indeterminado");
    expect(resultado.estado).not.toBe("problema");
    expect(resultado.motivo).toBe("backup-offsite");
    expect(resultado.detalhe).toContain("OFFSITE_S3_ENDPOINT");
    expect(resultado.detalhe).toContain("OFFSITE_S3_ACCESS_KEY");
    expect(resultado.detalhe).toContain("OFFSITE_S3_SECRET_KEY");
  });

  test("faltando só uma variável → indeterminado cita apenas a faltante", async () => {
    const resultado = await verificarBackupOffsite({
      OFFSITE_S3_ENDPOINT: "https://s3.example.com",
      OFFSITE_S3_ACCESS_KEY: "chave",
    });
    expect(resultado.estado).toBe("indeterminado");
    expect(resultado.detalhe).toContain("OFFSITE_S3_SECRET_KEY");
    expect(resultado.detalhe).not.toContain("OFFSITE_S3_ENDPOINT ");
  });

  const envCompleto = {
    OFFSITE_S3_ENDPOINT: "https://s3.example.com",
    OFFSITE_S3_ACCESS_KEY: "chave-acesso",
    OFFSITE_S3_SECRET_KEY: "segredo-super-secreto",
  };

  function execFnDubleQueRetorna(stdout) {
    return function execFn() {
      return Promise.resolve({ stdout, stderr: "" });
    };
  }

  function execFnDubleQueLanca(mensagem) {
    return function execFn() {
      return Promise.reject(new Error(mensagem));
    };
  }

  test("mc responde com bucket vazio → problema, não indeterminado", async () => {
    const execFn = execFnDubleQueRetorna("");
    const resultado = await verificarBackupOffsite(
      envCompleto,
      Date.now(),
      execFn,
    );
    expect(resultado.estado).toBe("problema");
    expect(resultado.motivo).toBe("backup-offsite");
    expect(resultado.detalhe).toContain("vazio");
  });

  test("objeto recente (idade <= 36h) → ok", async () => {
    const agora = Date.parse("2026-08-25T12:00:00.000Z");
    const stdout = JSON.stringify({
      key: "dump-2026-08-25.sql.age",
      type: "file",
      lastModified: "2026-08-25T00:00:00.000Z", // 12h atrás
    });
    const execFn = execFnDubleQueRetorna(stdout);
    const resultado = await verificarBackupOffsite(
      envCompleto,
      agora,
      execFn,
    );
    expect(resultado).toEqual({
      estado: "ok",
      motivo: "backup-offsite",
      detalhe: "",
    });
  });

  test("objeto velho (idade > 36h) → problema, detalhe cita a idade e o limite", async () => {
    const agora = Date.parse("2026-08-25T12:00:00.000Z");
    const stdout = JSON.stringify({
      key: "dump-2026-08-20.sql.age",
      type: "file",
      lastModified: "2026-08-20T12:00:00.000Z", // 120h atrás
    });
    const execFn = execFnDubleQueRetorna(stdout);
    const resultado = await verificarBackupOffsite(
      envCompleto,
      agora,
      execFn,
    );
    expect(resultado.estado).toBe("problema");
    expect(resultado.motivo).toBe("backup-offsite");
    expect(resultado.detalhe).toContain("120.0h");
    expect(resultado.detalhe).toContain("36h");
  });

  test("erro do mc que ecoa a secret → detalhe mascara com ***, nunca vaza a secret", async () => {
    const execFn = execFnDubleQueLanca(
      `mc: <ERROR> Unable to initialize new alias. The Access Key Id you provided does not exist with secret segredo-super-secreto.`,
    );
    const resultado = await verificarBackupOffsite(
      envCompleto,
      Date.now(),
      execFn,
    );
    expect(resultado.estado).toBe("indeterminado");
    expect(resultado.motivo).toBe("backup-offsite");
    expect(resultado.detalhe).not.toContain("segredo-super-secreto");
    expect(resultado.detalhe).toContain("***");
  });
});
