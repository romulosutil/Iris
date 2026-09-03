import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gerarLinkDownloadAction, solicitarExportacaoAction } from "./actions";
import { ErroComCopy } from "@/lib/copy/erros";
import * as tenant from "@/auth/tenant";
import * as motor from "@/lib/export/acervo/motor";

vi.mock("@/auth/tenant", () => ({
  getTenantContext: vi.fn(),
}));

// `importOriginal` mantém as classes de erro reais: a action decide pelo
// `instanceof`, e um mock que as apaga faria o teste passar pelo caminho
// errado (ou estourar num `instanceof undefined`).
vi.mock("@/lib/export/acervo/motor", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("@/lib/export/acervo/motor")>();
  return { ...real, solicitarExportacao: vi.fn(), gerarLinkDownload: vi.fn() };
});

const CTX = {
  clinicId: "clinic-1",
  userId: "user-1",
  role: "coordenador",
  mfaEnrolled: true,
} as const;

describe("solicitarExportacaoAction (Task T7)", () => {
  let silencio: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    silencio = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    silencio.mockRestore();
  });

  it("retorna sucesso quando a solicitação é aceita pelo motor", async () => {
    vi.mocked(tenant.getTenantContext).mockResolvedValueOnce(CTX);
    vi.mocked(motor.solicitarExportacao).mockResolvedValueOnce({
      bundleId: "bundle-123",
      status: "pendente",
    });

    const res = await solicitarExportacaoAction();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.bundleId).toBe("bundle-123");
      expect(res.status).toBe("pendente");
    }
  });

  it("retorna a copy do motor quando ele recusa (em andamento / não autorizado)", async () => {
    vi.mocked(tenant.getTenantContext).mockResolvedValueOnce(CTX);
    vi.mocked(motor.solicitarExportacao).mockRejectedValueOnce(
      new motor.ExportacaoEmAndamentoError(),
    );

    const res = await solicitarExportacaoAction();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe(
        "Já existe uma exportação em andamento para esta clínica.",
      );
    }
    expect(silencio).not.toHaveBeenCalled();
  });

  it("copy lançada pelo motor no download (ErroComCopy) chega à tela como está (revisão #546)", async () => {
    vi.mocked(tenant.getTenantContext).mockResolvedValueOnce(CTX);
    vi.mocked(motor.gerarLinkDownload).mockRejectedValueOnce(
      new ErroComCopy(
        "Esta exportação não está mais disponível para download. Solicite uma nova.",
      ),
    );

    const res = await gerarLinkDownloadAction("bundle-1");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe(
        "Esta exportação não está mais disponível para download. Solicite uma nova.",
      );
    }
    expect(silencio).not.toHaveBeenCalled();
  });

  it("S-10 (#531): erro de driver NÃO chega à tela — copy do dicionário + código do log", async () => {
    const params = "paciente relatou ideação suicida";
    const erroDeDriver = new Error(
      `Failed query: insert into "export_bundle" … \nparams: ${params}`,
      { cause: Object.assign(new Error("dup"), { code: "23505" }) },
    );
    erroDeDriver.name = "DrizzleQueryError";
    vi.mocked(tenant.getTenantContext).mockResolvedValueOnce(CTX);
    vi.mocked(motor.solicitarExportacao).mockRejectedValueOnce(erroDeDriver);

    const res = await solicitarExportacaoAction();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).not.toContain(params);
      expect(res.error).not.toContain("Failed query");
      expect(res.error).toBe(
        "Já existe um registro igual a este. Confira o que já está cadastrado antes de tentar de novo.",
      );
    }
    // O log recebeu só o resumo, nunca o objeto com a message.
    expect(silencio).toHaveBeenCalledTimes(1);
    const [rotulo, resumo] = silencio.mock.calls[0]! as [string, unknown];
    expect(rotulo).toBe("solicitarExportacao:");
    expect(resumo).not.toBe(erroDeDriver);
    expect(JSON.stringify(resumo)).not.toContain(params);
  });
});
