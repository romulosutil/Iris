import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  atualizarContadorIndeterminado,
  decidirEnvios,
  deveAlertar,
  gravarContadorIndeterminado,
  idadeMaisRecenteH,
  lerContadorIndeterminado,
  marcarAlertado,
  montarAlertaDetectorCego,
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

describe("alarme-jobs.mjs — contador de indeterminado consecutivo / detector cego (#294)", () => {
  test("contador começa em 0 quando não há arquivo", async () => {
    expect(await lerContadorIndeterminado(heartbeatDir, "billing")).toBe(0);
  });

  test("gravar e reler devolve o mesmo valor", async () => {
    await gravarContadorIndeterminado(heartbeatDir, "billing", 4);
    expect(await lerContadorIndeterminado(heartbeatDir, "billing")).toBe(4);
  });

  test("indeterminado incrementa o contador e não escala antes do limite", async () => {
    for (let i = 1; i <= 5; i++) {
      const resultado = await atualizarContadorIndeterminado(heartbeatDir, {
        motivo: "billing",
        estado: "indeterminado",
      });
      expect(resultado.contador).toBe(i);
      expect(resultado.cegou).toBe(false);
    }
  });

  test("6º indeterminado consecutivo escala (cegou: true)", async () => {
    for (let i = 1; i <= 5; i++) {
      await atualizarContadorIndeterminado(heartbeatDir, {
        motivo: "billing",
        estado: "indeterminado",
      });
    }
    const resultado = await atualizarContadorIndeterminado(heartbeatDir, {
      motivo: "billing",
      estado: "indeterminado",
    });
    expect(resultado.contador).toBe(6);
    expect(resultado.cegou).toBe(true);
  });

  test("ok zera o contador depois de indeterminados anteriores", async () => {
    await atualizarContadorIndeterminado(heartbeatDir, {
      motivo: "billing",
      estado: "indeterminado",
    });
    await atualizarContadorIndeterminado(heartbeatDir, {
      motivo: "billing",
      estado: "indeterminado",
    });
    const zerado = await atualizarContadorIndeterminado(heartbeatDir, {
      motivo: "billing",
      estado: "ok",
    });
    expect(zerado.contador).toBe(0);
    expect(zerado.cegou).toBe(false);
    expect(await lerContadorIndeterminado(heartbeatDir, "billing")).toBe(0);
  });

  test("problema também zera o contador", async () => {
    await atualizarContadorIndeterminado(heartbeatDir, {
      motivo: "escalonamento",
      estado: "indeterminado",
    });
    const zerado = await atualizarContadorIndeterminado(heartbeatDir, {
      motivo: "escalonamento",
      estado: "problema",
    });
    expect(zerado.contador).toBe(0);
    expect(
      await lerContadorIndeterminado(heartbeatDir, "escalonamento"),
    ).toBe(0);
  });

  test("motivos diferentes têm contadores independentes", async () => {
    for (let i = 0; i < 3; i++) {
      await atualizarContadorIndeterminado(heartbeatDir, {
        motivo: "billing",
        estado: "indeterminado",
      });
    }
    expect(await lerContadorIndeterminado(heartbeatDir, "billing")).toBe(3);
    expect(
      await lerContadorIndeterminado(heartbeatDir, "escalonamento"),
    ).toBe(0);
  });

  test("backup-offsite NUNCA escala — indeterminado é rotineiro em dev/CI", async () => {
    for (let i = 0; i < 10; i++) {
      const resultado = await atualizarContadorIndeterminado(heartbeatDir, {
        motivo: "backup-offsite",
        estado: "indeterminado",
      });
      expect(resultado.cegou).toBe(false);
      expect(resultado.contador).toBe(0);
    }
    expect(
      await lerContadorIndeterminado(heartbeatDir, "backup-offsite"),
    ).toBe(0);
  });

  test("montarAlertaDetectorCego devolve motivo dedicado e estado problema", () => {
    const alerta = montarAlertaDetectorCego("billing", 6);
    expect(alerta.estado).toBe("problema");
    expect(alerta.motivo).toBe("detector-cego-billing");
    expect(alerta.motivo).not.toBe("billing");
    expect(alerta.detalhe).toContain("billing");
    expect(alerta.detalhe).toContain("6");
  });

  test("alerta de detector cego passa pelo dedup diário normal (deveAlertar/marcarAlertado)", async () => {
    const alerta = montarAlertaDetectorCego("escalonamento", 6);
    expect(await deveAlertar(heartbeatDir, alerta.motivo, "2026-08-26")).toBe(
      true,
    );
    await marcarAlertado(heartbeatDir, alerta.motivo, "2026-08-26");
    expect(await deveAlertar(heartbeatDir, alerta.motivo, "2026-08-26")).toBe(
      false,
    );
  });
});

describe("alarme-jobs.mjs — decidirEnvios (#294)", () => {
  test("três 'ok' → aEnviar e aLogar vazios", () => {
    const resultados = [
      { estado: "ok", motivo: "billing", detalhe: "" },
      { estado: "ok", motivo: "escalonamento", detalhe: "" },
      { estado: "ok", motivo: "backup-offsite", detalhe: "" },
    ];
    expect(decidirEnvios(resultados)).toEqual({ aEnviar: [], aLogar: [] });
  });

  test("problema + indeterminado + ok → cada um na cesta certa, indeterminado nunca em aEnviar", () => {
    const problema = {
      estado: "problema",
      motivo: "billing",
      detalhe: "ciclo vencido",
    };
    const indeterminado = {
      estado: "indeterminado",
      motivo: "backup-offsite",
      detalhe: "variável ausente",
    };
    const ok = { estado: "ok", motivo: "escalonamento", detalhe: "" };
    const resultado = decidirEnvios([problema, indeterminado, ok]);
    expect(resultado.aEnviar).toEqual([problema]);
    expect(resultado.aLogar).toEqual([indeterminado]);
    expect(resultado.aEnviar).not.toContainEqual(indeterminado);
  });

  test("ordem de aEnviar preserva a ordem de entrada", () => {
    const primeiro = { estado: "problema", motivo: "a", detalhe: "" };
    const segundo = { estado: "problema", motivo: "b", detalhe: "" };
    const terceiro = { estado: "problema", motivo: "c", detalhe: "" };
    const resultado = decidirEnvios([segundo, primeiro, terceiro]);
    expect(resultado.aEnviar).toEqual([segundo, primeiro, terceiro]);
  });
});
