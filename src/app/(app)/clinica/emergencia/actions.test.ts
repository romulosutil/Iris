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
    getTenantContext.mockResolvedValueOnce({ role: "terapeuta" });
    requireRole.mockImplementationOnce(() => {
      throw new RoleError("Você não tem permissão para isso.");
    });

    const result = await salvarEmergenciaAction({}, fd);

    expect(result).toEqual({ error: "Você não tem permissão para isso." });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(requireRole).toHaveBeenCalledWith(
      { role: "terapeuta" },
      "coordenador",
    );
  });

  it("registra o log e retorna mensagem genérica para erros inesperados", async () => {
    const fd = new FormData();
    const boom = new Error("Banco de dados offline");
    getTenantContext.mockRejectedValueOnce(boom);

    const result = await salvarEmergenciaAction({}, fd);

    // #531 (S-03/U-01): o log recebe só nome + code + correlação — nunca o
    // objeto (a `message` de um erro de driver carrega SQL + params) — e a
    // tela recebe copy do dicionário com o MESMO código de correlação.
    // Desde o #560 (F1) o registro sai como UMA linha de JSON, com `evento`,
    // `requestId` e a classe do erro em `erroNome` (`nome` é chave redigida).
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const linha = String(consoleErrorSpy.mock.calls[0]![0]);
    const resumo = JSON.parse(linha) as {
      correlacaoId: string;
      erroNome: string;
      evento: string;
      requestId: string;
    };
    expect(resumo.evento).toBe("wrapper clinica/emergencia:");
    expect(typeof resumo.requestId).toBe("string");
    expect(linha).not.toContain("Banco de dados offline");
    expect(resumo.erroNome).toBe("Error");
    expect(result.error).toBe(
      `Não foi possível concluir. Tente de novo; se repetir, avise a coordenação (código ${resumo.correlacaoId}).`,
    );
  });

  it("no caminho feliz, salva a config, revalida a página e retorna ok", async () => {
    const fd = new FormData();
    fd.set("responsavelTecnicoId", "resp-1");
    fd.set("protocoloInterno", "protocolo x");
    fd.set("declarado", "on");
    getTenantContext.mockResolvedValueOnce({ role: "coordenador" });
    salvarConfigEmergencia.mockResolvedValueOnce({ ok: true });

    const result = await salvarEmergenciaAction({}, fd);

    expect(result).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith("/clinica/emergencia");
  });

  it("retorna o erro de negócio sem revalidar quando salvarConfigEmergencia falha", async () => {
    const fd = new FormData();
    getTenantContext.mockResolvedValueOnce({ role: "coordenador" });
    salvarConfigEmergencia.mockResolvedValueOnce({
      error: "responsável técnico inválido",
    });

    const result = await salvarEmergenciaAction({}, fd);

    expect(result).toEqual({ error: "responsável técnico inválido" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
