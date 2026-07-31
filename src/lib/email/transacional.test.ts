import { beforeEach, describe, expect, it, vi } from "vitest";

const enviar = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: enviar };
  },
}));

describe("enviarEmailTransacional", () => {
  beforeEach(() => {
    enviar.mockReset();
    process.env.RESEND_API_KEY = "re_teste";
    process.env.EMAIL_REMETENTE = "Iris <nao-responda@irisclinica.ia.br>";
  });

  it("envia com remetente configurado e devolve enviado: true", async () => {
    enviar.mockResolvedValue({ data: { id: "abc" }, error: null });
    const { enviarEmailTransacional } = await import("./transacional");
    const r = await enviarEmailTransacional({
      para: "pessoa@exemplo.com.br",
      assunto: "Confirme seu e-mail",
      texto: "Link",
      html: "<p>Link</p>",
    });
    expect(r.enviado).toBe(true);
    expect(enviar).toHaveBeenCalledWith(
      expect.objectContaining({ to: "pessoa@exemplo.com.br", subject: "Confirme seu e-mail" }),
    );
  });

  it("degrada sem lançar quando o provedor falha", async () => {
    enviar.mockResolvedValue({ data: null, error: { message: "limite" } });
    const { enviarEmailTransacional } = await import("./transacional");
    await expect(
      enviarEmailTransacional({ para: "a@b.com", assunto: "x", texto: "y", html: "<p>y</p>" }),
    ).resolves.toEqual({ enviado: false });
  });
});
