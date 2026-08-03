import { describe, it, expect, vi } from "vitest";
import {
  verificarElegibilidadeExpurgoAuditLog,
  executarExpurgoAuditLog,
} from "./expurgo-audit-log.mjs";

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

describe("executarExpurgoAuditLog", () => {
  it("chama as rotinas de pseudonimização e expurgo via cliente SQL e retorna contagens", async () => {
    const mockSql = vi
      .fn()
      .mockResolvedValueOnce([{ count: 3 }])
      .mockResolvedValueOnce([{ count: 12 }]);

    const resultado = await executarExpurgoAuditLog(mockSql);

    expect(mockSql).toHaveBeenCalledTimes(2);
    expect(resultado).toEqual({
      pseudonimizados: 3,
      expurgados: 12,
    });
  });
});
