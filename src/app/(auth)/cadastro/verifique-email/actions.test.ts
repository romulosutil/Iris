import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { consumirTentativa, enviarEmailTransacional, findFirst } = vi.hoisted(() => ({
  consumirTentativa: vi.fn(),
  enviarEmailTransacional: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  consumirTentativa,
}));

vi.mock("@/lib/email/transacional", () => ({
  enviarEmailTransacional,
}));

vi.mock("@/db/client", () => ({
  authDb: {
    query: {
      authVerification: {
        findFirst,
      },
    },
  },
}));

import { reenviarEmailVerificacao } from "./actions";

function fd(email: string): FormData {
  const f = new FormData();
  f.set("email", email);
  return f;
}

describe("reenviarEmailVerificacao", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    consumirTentativa.mockReturnValue({ permitido: true });
    enviarEmailTransacional.mockResolvedValue({ enviado: true });
    findFirst.mockResolvedValue(undefined);
  });

  it("rejeita e-mail malformado ou em branco com mensagem de erro", async () => {
    const res1 = await reenviarEmailVerificacao({}, fd("email-invalido"));
    expect(res1.error).toBe("Informe um endereço de e-mail válido.");

    const res2 = await reenviarEmailVerificacao({}, fd(""));
    expect(res2.error).toBe("Informe um endereço de e-mail válido.");
  });

  it("bloqueia por rate-limiting quando exceder 3 solicitações no intervalo de 15 minutos", async () => {
    consumirTentativa.mockReturnValueOnce({ permitido: false });

    const res = await reenviarEmailVerificacao({}, fd("pedro@exemplo.com"));
    expect(res.error).toContain("Muitas solicitações de reenvio");
    expect(findFirst).not.toHaveBeenCalled();
    expect(enviarEmailTransacional).not.toHaveBeenCalled();
  });

  it("retorna mensagem uniforme de sucesso mesmo quando nenhum token pendente for encontrado (anti-enumeração)", async () => {
    findFirst.mockResolvedValueOnce(undefined); // Sem token pendente

    const res = await reenviarEmailVerificacao({}, fd("desconhecido@exemplo.com"));
    expect(res.success).toBe(true);
    expect(res.message).toContain("Se este e-mail estiver cadastrado");
    expect(enviarEmailTransacional).not.toHaveBeenCalled();
  });

  it("dispara e-mail transacional quando houver token pendente e válido", async () => {
    findFirst.mockResolvedValueOnce({
      value: "token-valido-12345",
      expiresAt: new Date(Date.now() + 3600000),
    });

    const res = await reenviarEmailVerificacao({}, fd("helena@exemplo.com"));
    expect(res.success).toBe(true);
    expect(enviarEmailTransacional).toHaveBeenCalledWith(
      expect.objectContaining({
        para: "helena@exemplo.com",
        assunto: "Verifique seu e-mail — Iris",
      }),
    );
  });
});
