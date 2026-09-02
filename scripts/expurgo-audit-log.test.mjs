import { afterEach, describe, it, expect, vi } from "vitest";
import {
  JOB,
  executar,
  executarExpurgoAuditLog,
  main,
  verificarElegibilidadeExpurgoAuditLog,
} from "./expurgo-audit-log.mjs";

// Fake mínimo do postgres.js (convenção do repo: sem vi.mock de SQL). Registra
// o texto e os valores de cada chamada; responde pela função chamada.
function makeFakeSql({ porAcao = [], erroEm = null } = {}) {
  const chamadas = [];
  const heartbeats = [];
  function sql(strings, ...valores) {
    const texto = strings.join("?");
    if (texto.includes("app_job_heartbeat_gravar")) {
      heartbeats.push(valores);
      return Promise.resolve([]);
    }
    chamadas.push(texto);
    if (erroEm && texto.includes(erroEm.funcao))
      return Promise.reject(erroEm.erro);
    if (texto.includes("app_pseudonimizar_audit_log_orfao"))
      return Promise.resolve([{ count: 3 }]);
    if (texto.includes("app_expurgar_audit_log_expirado_por_acao"))
      return Promise.resolve(porAcao);
    return Promise.resolve([]);
  }
  sql.chamadas = chamadas;
  sql.heartbeats = heartbeats;
  return sql;
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.EXPURGO_DATABASE_URL;
});

describe("verificarElegibilidadeExpurgoAuditLog", () => {
  const agora = new Date("2026-08-01T12:00:00Z");

  it("preserva logs com 179 dias de idade", () => {
    const logData = new Date("2026-02-03T12:00:00Z"); // 179 dias atrás
    expect(verificarElegibilidadeExpurgoAuditLog(logData, agora)).toBe(false);
  });

  it("permite expurgo de logs com 180 dias ou mais de idade", () => {
    const logData180 = new Date("2026-02-02T12:00:00Z"); // 180 dias atrás
    expect(verificarElegibilidadeExpurgoAuditLog(logData180, agora)).toBe(true);

    const logData183 = new Date("2026-01-30T12:00:00Z"); // 183 dias atrás
    expect(verificarElegibilidadeExpurgoAuditLog(logData183, agora)).toBe(true);
  });
});

describe("executarExpurgoAuditLog (#536)", () => {
  it("chama pseudonimização e o expurgo POR AÇÃO (0145), e soma as contagens", async () => {
    const sql = makeFakeSql({
      porAcao: [
        { acao: "login", apagadas: 10 },
        { acao: "logout", apagadas: 2 },
      ],
    });

    const resultado = await executarExpurgoAuditLog(sql);

    expect(sql.chamadas).toHaveLength(2);
    expect(sql.chamadas[0]).toContain("app_pseudonimizar_audit_log_orfao");
    expect(sql.chamadas[1]).toContain(
      "app_expurgar_audit_log_expirado_por_acao",
    );
    // NUNCA a função de nome antigo direto: ela é só o wrapper que soma, e o
    // log precisa da quebra por ação.
    expect(sql.chamadas[1]).not.toMatch(/app_expurgar_audit_log_expirado\(\)/);
    expect(resultado).toEqual({
      pseudonimizados: 3,
      expurgados: 12,
      porAcao: { login: 10, logout: 2 },
    });
  });

  it("nenhuma linha apagada → expurgados=0 e porAcao vazio", async () => {
    const resultado = await executarExpurgoAuditLog(makeFakeSql());
    expect(resultado).toEqual({
      pseudonimizados: 3,
      expurgados: 0,
      porAcao: {},
    });
  });
});

describe("executar — log e heartbeat (#536)", () => {
  it("loga a contagem por ação (só nome e número) e grava heartbeat ok=true", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const sql = makeFakeSql({ porAcao: [{ acao: "login", apagadas: 7 }] });

    await executar(sql);

    const linhas = log.mock.calls.map((c) => c.join(" "));
    expect(linhas.some((l) => l.includes("login: 7"))).toBe(true);
    expect(sql.heartbeats).toEqual([
      [JOB, true, "pseudonimizados=3 expurgados=7"],
    ]);
    expect(JOB).toBe("expurgo-audit-log");
  });

  it("função que levanta → heartbeat ok=false com name+code, propaga o erro", async () => {
    const sql = makeFakeSql({
      erroEm: {
        funcao: "app_expurgar_audit_log_expirado_por_acao",
        erro: Object.assign(new Error("permission denied for function"), {
          name: "PostgresError",
          code: "42501",
        }),
      },
    });

    await expect(executar(sql)).rejects.toThrow("permission denied");
    expect(sql.heartbeats).toEqual([
      [JOB, false, "erro=PostgresError code=42501"],
    ]);
  });
});

describe("main — env e exit code (#536)", () => {
  it("sem EXPURGO_DATABASE_URL: sai 1 nomeando a variável, sem tocar no banco", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.EXPURGO_DATABASE_URL;

    expect(await main()).toBe(1);
    expect(error.mock.calls[0].join(" ")).toContain("EXPURGO_DATABASE_URL");
  });
});
