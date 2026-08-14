import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getTenantContext,
  requireRole,
  salvarConfigEmergencia,
  revalidatePath,
} = vi.hoisted(() => ({
  getTenantContext: vi.fn(),
  requireRole: vi.fn(),
  salvarConfigEmergencia: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/auth/tenant", () => ({
  getTenantContext,
}));

vi.mock("@/auth/require-role", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/auth/require-role")>();
  return {
    ...mod,
    requireRole,
  };
});

vi.mock("./logic", () => ({
  salvarConfigEmergencia,
}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

import { salvarEmergenciaAction } from "./actions";
import { RoleError } from "@/auth/require-role";

describe("salvarEmergenciaAction (error handling)", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("retorna a mensagem do erro se for um RoleError", async () => {
    const fd = new FormData();
    requireRole.mockImplementationOnce(() => {
      throw new RoleError("Você não tem permissão para isso.");
    });

    const result = await salvarEmergenciaAction({}, fd);

    expect(result).toEqual({ error: "Você não tem permissão para isso." });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("registra o log e retorna mensagem genérica para erros inesperados", async () => {
    const fd = new FormData();
    getTenantContext.mockRejectedValueOnce(new Error("Banco de dados offline"));

    const result = await salvarEmergenciaAction({}, fd);

    expect(result).toEqual({ error: "Erro interno no servidor." });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "wrapper clinica/emergencia:",
      expect.any(Error),
    );
  });
});
