import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  LIMITES_HEARTBEAT,
  atualizarContadorIndeterminado,
  avaliarExtracao,
  avaliarHeartbeat,
  avaliarRecurso,
  decidirEnvios,
  deveAlertar,
  gravarContadorIndeterminado,
  idadeMaisRecenteH,
  lerContadorIndeterminado,
  limitePctDoAmbiente,
  marcarAlertado,
  montarAlertaDetectorCego,
  pctUsoDisco,
  pctUsoMemoria,
  verificarBackupOffsite,
  verificarBilling,
  verificarEscalonamento,
  verificarExtracao,
  verificarHeartbeats,
  verificarRecursosHost,
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

describe("alarme-jobs.mjs — verificarExtracao / limiar (#560 F5)", () => {
  const OK = { estado: "ok", motivo: "extracao", detalhe: "" };

  test("janela sem extração nenhuma → ok (NÃO indeterminado: madrugada é rotina)", async () => {
    expect(await verificarExtracao(sqlDubleQueRetorna([]))).toEqual(OK);
  });

  test("amostra abaixo do piso não alerta, mesmo com 100% de falha", async () => {
    // A clínica solo é o caso-base: a primeira e única extração do dia
    // falhando não pode mandar e-mail.
    const linhas = [
      {
        modelo: "gemini-2.5-flash",
        chamadas: 1,
        falhas: 1,
        p95_latencia_ms: 900,
      },
    ];
    expect(avaliarExtracao(linhas)).toEqual(OK);
  });

  test("taxa de falha acima do teto → problema citando contagem e modelo", () => {
    const linhas = [
      {
        modelo: "gemini-2.5-flash",
        chamadas: 10,
        falhas: 6,
        p95_latencia_ms: 1200,
      },
    ];
    const r = avaliarExtracao(linhas);
    expect(r.estado).toBe("problema");
    expect(r.motivo).toBe("extracao");
    expect(r.detalhe).toContain("6 de 10");
    expect(r.detalhe).toContain("60%");
    expect(r.detalhe).toContain("gemini-2.5-flash");
  });

  test("taxa de falha ABAIXO do teto → ok (transitória com retry é rotina)", () => {
    const linhas = [
      {
        modelo: "gemini-2.5-flash",
        chamadas: 10,
        falhas: 2,
        p95_latencia_ms: 1200,
      },
    ];
    expect(avaliarExtracao(linhas)).toEqual(OK);
  });

  test("teto de falha é ESTRITO: exatamente 30% não alerta", () => {
    const linhas = [
      {
        modelo: "gemini-2.5-flash",
        chamadas: 10,
        falhas: 3,
        p95_latencia_ms: 1200,
      },
    ];
    expect(avaliarExtracao(linhas)).toEqual(OK);
  });

  test("taxa somada entre modelos, mas o detalhe discrimina por modelo", () => {
    const linhas = [
      {
        modelo: "gemini-2.5-flash",
        chamadas: 6,
        falhas: 5,
        p95_latencia_ms: 1000,
      },
      { modelo: "stub", chamadas: 4, falhas: 0, p95_latencia_ms: 5 },
    ];
    const r = avaliarExtracao(linhas);
    expect(r.estado).toBe("problema");
    expect(r.detalhe).toContain("5 de 10");
    expect(r.detalhe).toContain("gemini-2.5-flash: 5/6");
    // Modelo sem falha não polui o e-mail.
    expect(r.detalhe).not.toContain("stub: 0/4");
  });

  test("p95 acima do teto → problema, mesmo com zero falha", () => {
    const linhas = [
      {
        modelo: "gemini-2.5-flash",
        chamadas: 8,
        falhas: 0,
        p95_latencia_ms: 41000,
      },
    ];
    const r = avaliarExtracao(linhas);
    expect(r.estado).toBe("problema");
    expect(r.detalhe).toContain("41000 ms");
    expect(r.detalhe).toContain("p95");
  });

  test("p95 alto num modelo SEM amostra suficiente não alerta", () => {
    const linhas = [
      {
        modelo: "gemini-2.5-flash",
        chamadas: 2,
        falhas: 0,
        p95_latencia_ms: 44000,
      },
      { modelo: "stub", chamadas: 8, falhas: 0, p95_latencia_ms: 5 },
    ];
    expect(avaliarExtracao(linhas)).toEqual(OK);
  });

  test("p95 do modelo LENTO não some diluído no modelo rápido", () => {
    const linhas = [
      {
        modelo: "gemini-2.5-flash",
        chamadas: 6,
        falhas: 0,
        p95_latencia_ms: 40000,
      },
      { modelo: "stub", chamadas: 90, falhas: 0, p95_latencia_ms: 3 },
    ];
    const r = avaliarExtracao(linhas);
    expect(r.estado).toBe("problema");
    expect(r.detalhe).toContain("gemini-2.5-flash");
    expect(r.detalhe).not.toContain("stub");
  });

  test("latência não medida (NULL) não vira zero nem estoura", () => {
    const linhas = [
      { modelo: null, chamadas: 9, falhas: 0, p95_latencia_ms: null },
    ];
    expect(avaliarExtracao(linhas)).toEqual(OK);
  });

  test("modelo NULL vira rótulo legível no e-mail, nunca 'null'", () => {
    const linhas = [
      { modelo: null, chamadas: 10, falhas: 9, p95_latencia_ms: 10 },
    ];
    const r = avaliarExtracao(linhas);
    expect(r.detalhe).toContain("(sem modelo)");
    expect(r.detalhe).not.toContain("null");
  });

  test("os dois limiares juntos saem num alarme só (um dedup, um e-mail)", () => {
    const linhas = [
      {
        modelo: "gemini-2.5-flash",
        chamadas: 10,
        falhas: 8,
        p95_latencia_ms: 43000,
      },
    ];
    const r = avaliarExtracao(linhas);
    expect(r.estado).toBe("problema");
    expect(r.motivo).toBe("extracao");
    expect(r.detalhe).toContain("8 de 10");
    expect(r.detalhe).toContain("43000 ms");
  });

  test("banco fora do ar → indeterminado, não 'ok' silencioso", async () => {
    const r = await verificarExtracao(sqlDubleQueLanca("conexão recusada"));
    expect(r.estado).toBe("indeterminado");
    expect(r.motivo).toBe("extracao");
    expect(r.detalhe).toContain("não foi possível checar");
  });

  test("a message do driver NÃO entra no detalhe — ele vai no corpo do e-mail", async () => {
    // A `message` do driver de Postgres é a query com os params. Este
    // `detalhe` é interpolado no e-mail de alarme, então uma message crua aqui
    // sai do container e vai para uma caixa de entrada.
    const erro = Object.assign(
      new Error(
        `syntax error at or near "SELECT * FROM extraction WHERE trecho_fonte = 'o paciente relatou'"`,
      ),
      { name: "PostgresError", code: "42601" },
    );
    const sql = () => Promise.reject(erro);

    const r = await verificarExtracao(sql);

    expect(r.estado).toBe("indeterminado");
    // O que o operador precisa para agir: classe do erro e SQLSTATE.
    expect(r.detalhe).toContain("erro=PostgresError");
    expect(r.detalhe).toContain("code=42601");
    // O que nunca pode sair.
    expect(r.detalhe).not.toContain("trecho_fonte");
    expect(r.detalhe).not.toContain("o paciente relatou");
    expect(r.detalhe).not.toContain("SELECT");
  });

  test("o CONTADOR sai no log em todo tick — inclusive no tick saudável", async () => {
    // É esta linha que faz a fatia ser "métrica", e não só alarme: sem série
    // no tick saudável não há régua para dizer o que é degradado.
    const linhas = [
      {
        modelo: "gemini-2.5-flash",
        chamadas: 30,
        falhas: 0,
        p95_latencia_ms: 1800,
      },
    ];
    const escrito = [];
    const original = process.stdout.write;
    process.stdout.write = (chunk) => {
      escrito.push(String(chunk));
      return true;
    };
    try {
      await verificarExtracao(sqlDubleQueRetorna(linhas));
    } finally {
      process.stdout.write = original;
    }
    const registro = escrito
      .flatMap((l) => l.split("\n"))
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .find((r) => r.evento === "alarme-jobs.metricas-extracao");
    expect(registro).toBeDefined();
    expect(registro.chamadas).toBe(30);
    expect(registro.falhas).toBe(0);
    // 30 chamadas em 1h = 0,5/min. É o "extrações/min" que a issue pede.
    expect(registro.chamadasPorMin).toBe(0.5);
    expect(registro.porModelo).toEqual([
      {
        modelo: "gemini-2.5-flash",
        chamadas: 30,
        falhas: 0,
        p95LatenciaMs: 1800,
      },
    ]);
  });

  test("extracao NÃO entra no escalonamento de detector cego", async () => {
    // Ela lê o MESMO banco de billing/escalonamento: um detector cego já é
    // acusado por aqueles dois, repetir o alarme não ajuda ninguém.
    for (let i = 0; i < 10; i++) {
      const resultado = await atualizarContadorIndeterminado(heartbeatDir, {
        motivo: "extracao",
        estado: "indeterminado",
      });
      expect(resultado.cegou).toBe(false);
    }
  });
});

describe("alarme-jobs.mjs — recursos do host: disco e memória (#631)", () => {
  // `statfs` do Node devolve blocos; estes dublês montam um filesystem de
  // tamanho conhecido para que o percentual esperado seja aritmética, não
  // aproximação.
  function fsCom({ blocks, bfree, bavail }) {
    return { bsize: 4096, blocks, bfree, bavail };
  }

  function meminfoCom({ totalKb, disponivelKb, livreKb = 0 }) {
    return [
      `MemTotal:       ${totalKb} kB`,
      `MemFree:        ${livreKb} kB`,
      `MemAvailable:   ${disponivelKb} kB`,
      "Buffers:          123456 kB",
    ].join("\n");
  }

  describe("pctUsoDisco — convenção do `df`", () => {
    test("blocos reservados ao root contam como USADOS, não como livres", () => {
      // 1000 blocos, 200 livres, mas só 150 disponíveis para não-root: 50
      // blocos são reserva do root. Usados = 1000-200 = 800; a capacidade que o
      // `df` considera é 800+150 = 950, então 800/950 = 84,2% — e NÃO os
      // 800/1000 = 80% que sairiam de dividir por `blocks`. Se esta conta virar
      // `usados / blocks`, o alarme passa a discordar do `df -h` que o operador
      // roda no runbook, e some justamente a faixa entre 80% e 84% em que o
      // limite de 80% deveria ter disparado.
      const pct = pctUsoDisco(fsCom({ blocks: 1000, bfree: 200, bavail: 150 }));
      expect(pct).toBeCloseTo(84.21, 1);
      expect(pct).not.toBeCloseTo(80, 1);
    });

    test("filesystem vazio → 0%", () => {
      expect(
        pctUsoDisco(fsCom({ blocks: 1000, bfree: 1000, bavail: 1000 })),
      ).toBe(0);
    });

    test("filesystem cheio → 100%", () => {
      expect(pctUsoDisco(fsCom({ blocks: 1000, bfree: 0, bavail: 0 }))).toBe(
        100,
      );
    });

    test("leitura sem blocos → null (indeterminado), nunca 0%", () => {
      // 0% seria "disco vazio, tudo bem" — a falha mais perigosa possível aqui.
      expect(pctUsoDisco(fsCom({ blocks: 0, bfree: 0, bavail: 0 }))).toBeNull();
      expect(pctUsoDisco(undefined)).toBeNull();
    });
  });

  describe("pctUsoMemoria — MemAvailable, não MemFree", () => {
    test("usa MemAvailable e ignora MemFree", () => {
      // Host saudável: quase nada "free" (o kernel usa tudo de page cache) mas
      // 60% disponível. Ler MemFree daria 95% de uso e alarme diário eterno.
      const pct = pctUsoMemoria(
        meminfoCom({ totalKb: 1000, disponivelKb: 600, livreKb: 50 }),
      );
      expect(pct).toBeCloseTo(40, 5);
      expect(pct).not.toBeCloseTo(95, 5);
    });

    test("MemAvailable ausente → null, nunca 0%", () => {
      expect(pctUsoMemoria("MemTotal:       1000 kB")).toBeNull();
    });

    test("texto vazio ou lixo → null", () => {
      expect(pctUsoMemoria("")).toBeNull();
      expect(pctUsoMemoria(undefined)).toBeNull();
    });
  });

  describe("limitePctDoAmbiente", () => {
    test("variável ausente → usa o padrão, sem erro", () => {
      expect(limitePctDoAmbiente({}, "ALARME_DISCO_PCT", 80)).toEqual({
        pct: 80,
        erro: null,
      });
    });

    test("string vazia é o mesmo que ausente (Easypanel salva campo vazio)", () => {
      expect(
        limitePctDoAmbiente({ ALARME_DISCO_PCT: "  " }, "ALARME_DISCO_PCT", 80),
      ).toEqual({ pct: 80, erro: null });
    });

    test("valor válido sobrescreve o padrão", () => {
      expect(
        limitePctDoAmbiente({ ALARME_DISCO_PCT: "70" }, "ALARME_DISCO_PCT", 80)
          .pct,
      ).toBe(70);
    });

    test.each([["abc"], ["0"], ["-5"], ["101"], ["NaN"]])(
      "valor inválido %s → erro que NOMEIA a variável",
      (bruto) => {
        const r = limitePctDoAmbiente(
          { ALARME_DISCO_PCT: bruto },
          "ALARME_DISCO_PCT",
          80,
        );
        expect(r.pct).toBeNull();
        expect(r.erro).toContain("ALARME_DISCO_PCT");
      },
    );
  });

  describe("avaliarRecurso — fronteira do limite", () => {
    test("exatamente no limite ainda é ok (o critério é > 80%, não >= 80%)", () => {
      expect(
        avaliarRecurso("recursos-disco", "uso de disco", 80, 80).estado,
      ).toBe("ok");
    });

    test("um décimo acima do limite já é problema", () => {
      const r = avaliarRecurso("recursos-disco", "uso de disco", 80.1, 80);
      expect(r.estado).toBe("problema");
      expect(r.detalhe).toContain("80.1%");
      expect(r.detalhe).toContain("80%");
    });

    test("percentual nulo → indeterminado, nunca ok", () => {
      const r = avaliarRecurso("recursos-disco", "uso de disco", null, 80);
      expect(r.estado).toBe("indeterminado");
      expect(r.estado).not.toBe("ok");
    });

    test("detalhe de ok é vazio (mesmo shape das demais checagens)", () => {
      expect(avaliarRecurso("recursos-disco", "uso de disco", 10, 80)).toEqual({
        estado: "ok",
        motivo: "recursos-disco",
        detalhe: "",
      });
    });
  });

  describe("verificarRecursosHost", () => {
    const discoOk = () => fsCom({ blocks: 1000, bfree: 900, bavail: 900 });
    const discoCheio = () => fsCom({ blocks: 1000, bfree: 50, bavail: 50 });
    const memOk = () => meminfoCom({ totalKb: 1000, disponivelKb: 800 });
    const memCheia = () => meminfoCom({ totalKb: 1000, disponivelKb: 20 });

    function leitores({ disco = discoOk, mem = memOk } = {}) {
      return {
        statfs: async () => disco(),
        lerMeminfo: async () => mem(),
      };
    }

    test("host saudável → dois resultados ok, com motivos DISTINTOS", async () => {
      const [disco, memoria] = await verificarRecursosHost({}, leitores());
      expect(disco.estado).toBe("ok");
      expect(memoria.estado).toBe("ok");
      // Motivos distintos importam: o dedup diário é POR MOTIVO, e um motivo
      // compartilhado faria o alarme de disco silenciar o de memória no
      // mesmo dia.
      expect(disco.motivo).toBe("recursos-disco");
      expect(memoria.motivo).toBe("recursos-memoria");
      expect(disco.motivo).not.toBe(memoria.motivo);
    });

    test("disco a 95% → problema no disco, memória segue ok", async () => {
      const [disco, memoria] = await verificarRecursosHost(
        {},
        leitores({ disco: discoCheio }),
      );
      expect(disco.estado).toBe("problema");
      expect(disco.detalhe).toContain("95%");
      expect(memoria.estado).toBe("ok");
    });

    test("padrão de disco é 80% — 85% de uso dispara sem env nenhuma", async () => {
      const [disco] = await verificarRecursosHost(
        {},
        leitores({
          disco: () => fsCom({ blocks: 1000, bfree: 150, bavail: 150 }),
        }),
      );
      expect(disco.estado).toBe("problema");
      expect(disco.detalhe).toContain("80%");
    });

    test("padrão de memória é 90%, não 80% — 85% de uso NÃO dispara", async () => {
      const [, memoria] = await verificarRecursosHost(
        {},
        leitores({
          mem: () => meminfoCom({ totalKb: 1000, disponivelKb: 150 }),
        }),
      );
      expect(memoria.estado).toBe("ok");
    });

    test("memória a 98% → problema", async () => {
      const [, memoria] = await verificarRecursosHost(
        {},
        leitores({ mem: memCheia }),
      );
      expect(memoria.estado).toBe("problema");
      expect(memoria.detalhe).toContain("uso de memória");
    });

    test("ALARME_DISCO_PCT baixa o limite e faz um host de 50% disparar", async () => {
      const [disco] = await verificarRecursosHost(
        { ALARME_DISCO_PCT: "40" },
        leitores({
          disco: () => fsCom({ blocks: 1000, bfree: 500, bavail: 500 }),
        }),
      );
      expect(disco.estado).toBe("problema");
      expect(disco.detalhe).toContain("40%");
    });

    test("limite inválido → PROBLEMA (e-mail), não indeterminado (só log)", async () => {
      // A decisão de desenho que este teste tranca: `indeterminado` não escala
      // para e-mail nestas checagens, então um typo no painel deixaria o
      // alarme mudo para sempre. Tem que gritar.
      const [disco] = await verificarRecursosHost(
        { ALARME_DISCO_PCT: "oitenta" },
        leitores(),
      );
      expect(disco.estado).toBe("problema");
      expect(disco.estado).not.toBe("indeterminado");
      expect(disco.detalhe).toContain("ALARME_DISCO_PCT");
    });

    test("limite de memória inválido não contamina a checagem de disco", async () => {
      const [disco, memoria] = await verificarRecursosHost(
        { ALARME_MEMORIA_PCT: "-1" },
        leitores(),
      );
      expect(disco.estado).toBe("ok");
      expect(memoria.estado).toBe("problema");
      expect(memoria.detalhe).toContain("ALARME_MEMORIA_PCT");
    });

    test("statfs falhando → indeterminado, e o detalhe NÃO vaza o caminho", async () => {
      const err = new Error(
        "ENOENT: no such file or directory, statfs /heartbeat",
      );
      err.code = "ENOENT";
      const [disco] = await verificarRecursosHost(
        {},
        {
          statfs: async () => Promise.reject(err),
          lerMeminfo: async () => memOk(),
        },
      );
      expect(disco.estado).toBe("indeterminado");
      expect(disco.detalhe).toContain("ENOENT");
      // `detalheDoErro` entrega name+code; a message (que carrega o caminho)
      // fica de fora — mesma regra de PII das demais checagens.
      expect(disco.detalhe).not.toContain("/heartbeat");
      expect(disco.detalhe).not.toContain("no such file");
    });

    test("leitura de meminfo falhando → indeterminado só na memória", async () => {
      const [disco, memoria] = await verificarRecursosHost(
        {},
        {
          statfs: async () => discoOk(),
          lerMeminfo: async () => Promise.reject(new Error("boom")),
        },
      );
      expect(disco.estado).toBe("ok");
      expect(memoria.estado).toBe("indeterminado");
    });

    test("ALARME_DISCO_PATH é o caminho medido", async () => {
      let medido = null;
      await verificarRecursosHost(
        { ALARME_DISCO_PATH: "/outro" },
        {
          statfs: async (p) => {
            medido = p;
            return discoOk();
          },
          lerMeminfo: async () => memOk(),
        },
      );
      expect(medido).toBe("/outro");
    });

    test("sem ALARME_DISCO_PATH mede /heartbeat (o volume que o serviço já exige)", async () => {
      let medido = null;
      await verificarRecursosHost(
        {},
        {
          statfs: async (p) => {
            medido = p;
            return discoOk();
          },
          lerMeminfo: async () => memOk(),
        },
      );
      expect(medido).toBe("/heartbeat");
    });

    test("os detalhes só carregam números e texto fixo (sem PII)", async () => {
      const [disco, memoria] = await verificarRecursosHost(
        {},
        leitores({ disco: discoCheio, mem: memCheia }),
      );
      for (const r of [disco, memoria]) {
        expect(r.detalhe).not.toMatch(/@/); // e-mail
        expect(r.detalhe).not.toMatch(
          /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
        ); // uuid
      }
    });
  });

  describe("integração com o dedup e o desfecho do detector", () => {
    test("as duas checagens deduplicam de forma independente no mesmo dia", async () => {
      expect(
        await deveAlertar(heartbeatDir, "recursos-disco", "2026-09-06"),
      ).toBe(true);
      await marcarAlertado(heartbeatDir, "recursos-disco", "2026-09-06");
      expect(
        await deveAlertar(heartbeatDir, "recursos-disco", "2026-09-06"),
      ).toBe(false);
      // Memória continua livre para alertar no mesmo dia.
      expect(
        await deveAlertar(heartbeatDir, "recursos-memoria", "2026-09-06"),
      ).toBe(true);
    });

    test("problema de recurso entra em `aEnviar`; indeterminado só em `aLogar`", () => {
      const { aEnviar, aLogar } = decidirEnvios([
        { estado: "problema", motivo: "recursos-disco", detalhe: "d" },
        { estado: "indeterminado", motivo: "recursos-memoria", detalhe: "m" },
      ]);
      expect(aEnviar.map((r) => r.motivo)).toEqual(["recursos-disco"]);
      expect(aLogar.map((r) => r.motivo)).toEqual(["recursos-memoria"]);
    });

    test("recursos NÃO entram no escalonamento de detector cego", async () => {
      // Elas não dependem do banco: um `indeterminado` aqui é problema de
      // leitura local, não de "o detector perdeu o banco de vista".
      for (let i = 0; i < 10; i++) {
        const r = await atualizarContadorIndeterminado(heartbeatDir, {
          motivo: "recursos-disco",
          estado: "indeterminado",
        });
        expect(r.cegou).toBe(false);
      }
    });
  });
});
