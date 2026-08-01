import { describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/db/rls";
import * as transacional from "@/lib/email/transacional";
import * as provisioning from "@/auth/provisioning";
import { convidarUsuario } from "./logic";

vi.mock("server-only", () => ({}));

const ctxCoord: TenantContext = {
  clinicId: "11111111-1111-1111-1111-111111111111",
  userId: "a0000000-0000-0000-0000-000000000001",
  role: "coordenador",
};

const ctxTerapeuta: TenantContext = {
  clinicId: "11111111-1111-1111-1111-111111111111",
  userId: "a0000000-0000-0000-0000-000000000002",
  role: "terapeuta",
};

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("convidarUsuario — lógica de envio de e-mail de convite (#155)", () => {
  it("exige papel de coordenador", async () => {
    await expect(
      convidarUsuario(ctxTerapeuta, form({ nome: "Ana", email: "ana@iris.test", papel: "terapeuta" }))
    ).rejects.toThrow(/Acesso negado/);
  });

  it("valida campos obrigatórios do formulário", async () => {
    const resSemNome = await convidarUsuario(ctxCoord, form({ email: "ana@iris.test", papel: "terapeuta" }));
    expect(resSemNome.error).toBe("Nome é obrigatório.");

    const resEmailInvalido = await convidarUsuario(
      ctxCoord,
      form({ nome: "Ana", email: "email-invalido", papel: "terapeuta" })
    );
    expect(resEmailInvalido.error).toBe("E-mail inválido.");

    const resPapelInvalido = await convidarUsuario(
      ctxCoord,
      form({ nome: "Ana", email: "ana@iris.test", papel: "coordenador" })
    );
    expect(resPapelInvalido.error).toBe("Só é possível convidar terapeuta ou recepção por aqui.");
  });

  it("chama provisionUser e dispara e-mail transacional com a senha temporária (#155)", async () => {
    vi.spyOn(provisioning, "provisionUser").mockResolvedValue({ userId: "u-123" });
    const spyEmail = vi.spyOn(transacional, "enviarEmailTransacional").mockResolvedValue({ enviado: true });

    const res = await convidarUsuario(
      ctxCoord,
      form({ nome: "Dra. Paula", email: "paula@iris.test", papel: "terapeuta" })
    );

    expect(res.error).toBeUndefined();
    expect(res.senhaTemporaria).toBeTruthy();
    expect(res.emailEnviado).toBe(true);

    expect(spyEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        para: "paula@iris.test",
        assunto: "Convite para integrar a equipe no Iris",
        texto: expect.stringContaining("Dra. Paula"),
        html: expect.stringContaining("Dra. Paula"),
      })
    );

    vi.restoreAllMocks();
  });

  it("degrada graciosamente se o envio de e-mail falhar, mantendo a senha temporária", async () => {
    vi.spyOn(provisioning, "provisionUser").mockResolvedValue({ userId: "u-123" });
    vi.spyOn(transacional, "enviarEmailTransacional").mockResolvedValue({ enviado: false });

    const res = await convidarUsuario(
      ctxCoord,
      form({ nome: "Dr. Carlos", email: "carlos@iris.test", papel: "admin_recepcao" })
    );

    expect(res.error).toBeUndefined();
    expect(res.senhaTemporaria).toBeTruthy();
    expect(res.emailEnviado).toBe(false);

    vi.restoreAllMocks();
  });
});
