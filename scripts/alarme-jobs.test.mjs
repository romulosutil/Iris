import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  LIMITES_HEARTBEAT,
  atualizarContadorIndeterminado,
  avaliarHeartbeat,
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
  verificarHeartbeats,
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
    expect(resultado.detalhe).toContain("11111111-1111-1111-1111-111111111111");
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
    expect(resultado.detalhe).toContain("22222222-2222-2222-2222-222222222222");
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
    const resultado = await verificarBackupOffsite(envCompleto, agora, execFn);
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
    const resultado = await verificarBackupOffsite(envCompleto, agora, execFn);
    expect(resultado.estado).toBe("problema");
    expect(resultado.motivo).toBe("backup-offsite");
    expect(resultado.detalhe).toContain("120.0h");
    expect(resultado.detalhe).toContain("36h");
  });

  test("OFFSITE_INTERVAL_DAYS=7 (semanal): idade de 103.8h → ok, não dispara falso-positivo", async () => {
    const agora = Date.parse("2026-08-26T13:48:00.000Z");
    const stdout = JSON.stringify({
      key: "dump-2026-08-22.sql.age",
      type: "file",
      lastModified: "2026-08-22T06:00:00.000Z", // ~103.8h atrás
    });
    const execFn = execFnDubleQueRetorna(stdout);
    const resultado = await verificarBackupOffsite(
      { ...envCompleto, OFFSITE_INTERVAL_DAYS: "7" },
      agora,
      execFn,
    );
    expect(resultado).toEqual({
      estado: "ok",
      motivo: "backup-offsite",
      detalhe: "",
    });
  });

  test("OFFSITE_INTERVAL_DAYS=7: idade acima de 180h (168h + margem) → problema", async () => {
    const agora = Date.parse("2026-08-26T00:00:00.000Z");
    const stdout = JSON.stringify({
      key: "dump-2026-08-17.sql.age",
      type: "file",
      lastModified: "2026-08-17T00:00:00.000Z", // 216h atrás
    });
    const execFn = execFnDubleQueRetorna(stdout);
    const resultado = await verificarBackupOffsite(
      { ...envCompleto, OFFSITE_INTERVAL_DAYS: "7" },
      agora,
      execFn,
    );
    expect(resultado.estado).toBe("problema");
    expect(resultado.detalhe).toContain("216.0h");
    expect(resultado.detalhe).toContain("180h");
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
    expect(await lerContadorIndeterminado(heartbeatDir, "escalonamento")).toBe(
      0,
    );
  });

  test("motivos diferentes têm contadores independentes", async () => {
    for (let i = 0; i < 3; i++) {
      await atualizarContadorIndeterminado(heartbeatDir, {
        motivo: "billing",
        estado: "indeterminado",
      });
    }
    expect(await lerContadorIndeterminado(heartbeatDir, "billing")).toBe(3);
    expect(await lerContadorIndeterminado(heartbeatDir, "escalonamento")).toBe(
      0,
    );
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
    expect(await lerContadorIndeterminado(heartbeatDir, "backup-offsite")).toBe(
      0,
    );
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

// ─── #536 (DA-03): heartbeat no banco — um caso por job novo ─────────────────
//
// O dublê devolve a MESMA forma de linha que `app_alarme_job_heartbeats()`
// (0146) devolve de verdade. `agora` é fixo para a idade ser determinística.
describe("alarme-jobs.mjs — heartbeats dos jobs (#536)", () => {
  const AGORA = Date.parse("2026-09-02T12:00:00.000Z");
  const H = 3_600_000;
  const linha = (job, { okHa = null, erroHa = null, detalhe = "" } = {}) => ({
    job,
    ultimo_ok: okHa === null ? null : new Date(AGORA - okHa * H),
    ultimo_erro: erroHa === null ? null : new Date(AGORA - erroHa * H),
    detalhe,
  });

  test("a tabela de limites cobre exatamente os jobs novos, e nenhum dos já cobertos por efeito colateral", () => {
    expect(Object.keys(LIMITES_HEARTBEAT).sort()).toEqual(
      [
        "arquivamento",
        "asr",
        "asr-sweeper",
        "conciliacao",
        "expurgo-audit-log",
        "exportacao",
        "retencao",
      ].sort(),
    );
    expect(LIMITES_HEARTBEAT).not.toHaveProperty("billing");
    expect(LIMITES_HEARTBEAT).not.toHaveProperty("escalonamento");
    expect(LIMITES_HEARTBEAT).not.toHaveProperty("backup-offsite");
  });

  test("retencao: último ok há 12h (cadência diária, limite 36h) → ok", () => {
    const r = avaliarHeartbeat(
      "retencao",
      linha("retencao", { okHa: 12 }),
      AGORA,
    );
    expect(r).toEqual({ estado: "ok", motivo: "retencao", detalhe: "" });
  });

  test("retencao: último ok há 40h → problema, detalhe cita idade e limite", () => {
    const r = avaliarHeartbeat(
      "retencao",
      linha("retencao", { okHa: 40 }),
      AGORA,
    );
    expect(r.estado).toBe("problema");
    expect(r.motivo).toBe("retencao");
    expect(r.detalhe).toContain("40.0h");
    expect(r.detalhe).toContain("36h");
  });

  test("arquivamento: SEM linha na tabela → problema (nunca rodou ou não provisionado), nunca ok", () => {
    const r = avaliarHeartbeat("arquivamento", undefined, AGORA);
    expect(r.estado).toBe("problema");
    expect(r.motivo).toBe("arquivamento");
    expect(r.detalhe).toContain("nenhum heartbeat");
  });

  test("exportacao: ok há 10min (cadência 5min, limite 1h) → ok; há 2h → problema", () => {
    expect(
      avaliarHeartbeat(
        "exportacao",
        linha("exportacao", { okHa: 10 / 60 }),
        AGORA,
      ).estado,
    ).toBe("ok");
    const r = avaliarHeartbeat(
      "exportacao",
      linha("exportacao", { okHa: 2 }),
      AGORA,
    );
    expect(r.estado).toBe("problema");
    expect(r.detalhe).toContain("1h");
  });

  test("asr: última passada FALHOU depois do último ok → problema com o detalhe gravado, mesmo dentro do limite", () => {
    const r = avaliarHeartbeat(
      "asr",
      linha("asr", {
        okHa: 0.1,
        erroHa: 0.05,
        detalhe: "erro=PostgresError code=42501",
      }),
      AGORA,
    );
    expect(r.estado).toBe("problema");
    expect(r.motivo).toBe("asr");
    expect(r.detalhe).toContain("falhou");
    expect(r.detalhe).toContain("erro=PostgresError code=42501");
  });

  test("asr: erro ANTIGO seguido de ok recente → ok (o erro foi superado)", () => {
    const r = avaliarHeartbeat(
      "asr",
      linha("asr", { okHa: 0.1, erroHa: 5 }),
      AGORA,
    );
    expect(r.estado).toBe("ok");
  });

  test("asr-sweeper: ok há 2h (cadência 1h, limite 3h) → ok; há 4h → problema", () => {
    expect(
      avaliarHeartbeat("asr-sweeper", linha("asr-sweeper", { okHa: 2 }), AGORA)
        .estado,
    ).toBe("ok");
    expect(
      avaliarHeartbeat("asr-sweeper", linha("asr-sweeper", { okHa: 4 }), AGORA)
        .estado,
    ).toBe("problema");
  });

  test("expurgo-audit-log: sem linha → problema — é assim que se MEDE se o serviço existe em produção", () => {
    const r = avaliarHeartbeat("expurgo-audit-log", undefined, AGORA);
    expect(r.estado).toBe("problema");
    expect(r.motivo).toBe("expurgo-audit-log");
  });

  test("expurgo-audit-log: ok há 30h (limite 36h) → ok", () => {
    expect(
      avaliarHeartbeat(
        "expurgo-audit-log",
        linha("expurgo-audit-log", { okHa: 30 }),
        AGORA,
      ).estado,
    ).toBe("ok");
  });

  test("conciliacao é SOB DEMANDA: sem linha → ok, ok há 400h → ok, última passada falhou → problema", () => {
    expect(avaliarHeartbeat("conciliacao", undefined, AGORA).estado).toBe("ok");
    expect(
      avaliarHeartbeat(
        "conciliacao",
        linha("conciliacao", { okHa: 400 }),
        AGORA,
      ).estado,
    ).toBe("ok");
    const r = avaliarHeartbeat(
      "conciliacao",
      linha("conciliacao", { okHa: 400, erroHa: 1, detalhe: "abortou=true" }),
      AGORA,
    );
    expect(r.estado).toBe("problema");
    expect(r.detalhe).toContain("abortou=true");
  });

  test("verificarHeartbeats: devolve UM resultado por job da tabela de limites, casando as linhas pelo nome", async () => {
    const sql = sqlDubleQueRetorna([
      linha("retencao", { okHa: 1 }),
      linha("arquivamento", { okHa: 100 }),
      linha("job-que-ninguem-monitora", { okHa: 1 }),
    ]);
    const resultados = await verificarHeartbeats(sql, AGORA);
    expect(resultados.map((r) => r.motivo).sort()).toEqual(
      Object.keys(LIMITES_HEARTBEAT).sort(),
    );
    const porMotivo = Object.fromEntries(resultados.map((r) => [r.motivo, r]));
    expect(porMotivo.retencao.estado).toBe("ok");
    expect(porMotivo.arquivamento.estado).toBe("problema");
    expect(porMotivo.exportacao.estado).toBe("problema"); // sem linha
    expect(porMotivo.conciliacao.estado).toBe("ok"); // sob demanda, sem linha
    expect(porMotivo).not.toHaveProperty("job-que-ninguem-monitora");
  });

  test("verificarHeartbeats: banco lança → TODOS indeterminado, detalhe com name+code e NUNCA a message", async () => {
    const err = Object.assign(
      new Error(
        "permission denied for function app_alarme_job_heartbeats -- params: Fulano",
      ),
      { name: "PostgresError", code: "42501" },
    );
    const sql = () => Promise.reject(err);
    const resultados = await verificarHeartbeats(sql, AGORA);
    expect(resultados).toHaveLength(Object.keys(LIMITES_HEARTBEAT).length);
    for (const r of resultados) {
      expect(r.estado).toBe("indeterminado");
      expect(r.detalhe).toContain("erro=PostgresError code=42501");
      expect(r.detalhe).not.toContain("Fulano");
      expect(r.detalhe).not.toContain("permission denied");
    }
  });

  test("avaliarHeartbeat aceita `Date` (forma real do postgres.js) e ISO string igualmente", () => {
    const comDate = avaliarHeartbeat(
      "retencao",
      {
        job: "retencao",
        ultimo_ok: new Date(AGORA - 40 * H),
        ultimo_erro: null,
        detalhe: "",
      },
      AGORA,
    );
    const comIso = avaliarHeartbeat(
      "retencao",
      {
        job: "retencao",
        ultimo_ok: new Date(AGORA - 40 * H).toISOString(),
        ultimo_erro: null,
        detalhe: "",
      },
      AGORA,
    );
    expect(comDate.estado).toBe("problema");
    expect(comDate.detalhe).toContain("40.0h");
    expect(comIso).toEqual(comDate);
    // `Date` de erro mais recente que o ok também é comparado como instante.
    const erroDate = avaliarHeartbeat(
      "asr",
      {
        job: "asr",
        ultimo_ok: new Date(AGORA - H),
        ultimo_erro: new Date(AGORA - H / 2),
        detalhe: "erro=X",
      },
      AGORA,
    );
    expect(erroDate.estado).toBe("problema");
    expect(erroDate.detalhe).toContain("falhou");
  });

  test("heartbeats NÃO entram no escalonamento de detector cego (só billing/escalonamento)", async () => {
    for (let i = 0; i < 10; i++) {
      const resultado = await atualizarContadorIndeterminado(heartbeatDir, {
        motivo: "retencao",
        estado: "indeterminado",
      });
      expect(resultado.cegou).toBe(false);
    }
  });
});
