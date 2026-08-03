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

  it("chama provisionUser e dispara e-mail transacional com a senha temporária para NOVO usuário (#155)", async () => {
    vi.spyOn(provisioning, "provisionUser").mockResolvedValue({ userId: "u-123", isNewUser: true });
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

  it("NÃO envia senha temporária para usuário JÁ EXISTENTE na plataforma e orienta uso da senha atual (#155 review)", async () => {
    vi.spyOn(provisioning, "provisionUser").mockResolvedValue({ userId: "u-123", isNewUser: false });
    const spyEmail = vi.spyOn(transacional, "enviarEmailTransacional").mockResolvedValue({ enviado: true });

    const res = await convidarUsuario(
      ctxCoord,
      form({ nome: "Dra. Paula", email: "paula-existente@iris.test", papel: "terapeuta" })
    );

    expect(res.error).toBeUndefined();
    expect(res.senhaTemporaria).toBeUndefined(); // Não devolve senha temporária ao coordenador
    expect(res.emailEnviado).toBe(true);

    expect(spyEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        para: "paula-existente@iris.test",
        assunto: "Convite para integrar nova equipe no Iris",
        texto: expect.stringContaining("faça login com sua senha atual"),
        html: expect.stringContaining("faça login com sua senha atual"),
      })
    );

    vi.restoreAllMocks();
  });

  it("degrada graciosamente se o envio de e-mail falhar para novo usuário, mantendo a senha temporária", async () => {
    vi.spyOn(provisioning, "provisionUser").mockResolvedValue({ userId: "u-123", isNewUser: true });
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

  it("escapa caracteres HTML no nome para evitar injeção no template e resolve URL sem barra dupla (#155 review)", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://iris.com.br/");

    vi.spyOn(provisioning, "provisionUser").mockResolvedValue({ userId: "u-123", isNewUser: true });
    const spyEmail = vi.spyOn(transacional, "enviarEmailTransacional").mockResolvedValue({ enviado: true });

    const nomeComHtml = "Dra. <script>alert('xss')</script> & Cia";
    await convidarUsuario(
      ctxCoord,
      form({ nome: nomeComHtml, email: "seguro@iris.test", papel: "terapeuta" })
    );

    expect(spyEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        texto: expect.stringContaining("https://iris.com.br/login"),
        html: expect.stringContaining("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt; &amp; Cia"),
      })
    );
    const payloadHtml = spyEmail.mock.calls[0]?.[0]?.html ?? "";
    expect(payloadHtml).not.toContain("<script>");
    expect(payloadHtml).not.toContain("https://iris.com.br//login");

    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
});
