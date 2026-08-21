import { describe, expect, it, vi, beforeEach } from "vitest";
import { RoleError } from "@/auth/require-role";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/auth/tenant", () => ({
  getTenantContext: vi.fn(),
}));

vi.mock("./logic", () => ({
  salvarRascunhoAnamnese: vi.fn(),
  validarAnamnese: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { salvarRascunhoAnamnese, validarAnamnese } from "./logic";
import { salvarRascunhoAnamneseAction, validarAnamneseAction } from "./actions";

const mockCtx = {
  clinicId: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
  role: "coordenador" as const,
};

describe("Anamnese Server Actions (T17)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTenantContext).mockResolvedValue(mockCtx);
  });

  describe("salvarRascunhoAnamneseAction", () => {
    const input = {
      patientId: "00000000-0000-0000-0000-000000000010",
      alvos: [
        {
          eixo: "comunicacao_expressiva" as const,
          descricao: "Expressar pedidos",
          procedencia: "relatado_responsavel" as const,
          nivel_ajuda_inicial: 2,
        },
      ],
    };

    it("salva rascunho com sucesso e revalida a rota de anamnese", async () => {
      vi.mocked(salvarRascunhoAnamnese).mockResolvedValue({ id: "anam-1" });

      const res = await salvarRascunhoAnamneseAction(input);

      expect(getTenantContext).toHaveBeenCalledTimes(1);
      expect(salvarRascunhoAnamnese).toHaveBeenCalledWith(mockCtx, input);
      expect(revalidatePath).toHaveBeenCalledWith(
        `/pacientes/${input.patientId}/anamnese`,
      );
      expect(res).toEqual({ ok: true, id: "anam-1" });
    });

    it("retorna erro de negócio quando logic retorna error", async () => {
      vi.mocked(salvarRascunhoAnamnese).mockResolvedValue({
        error: "Erro de validação",
      });

      const res = await salvarRascunhoAnamneseAction(input);

      expect(res).toEqual({ error: "Erro de validação" });
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("trata RoleError com mensagem em pt-BR", async () => {
      vi.mocked(salvarRascunhoAnamnese).mockRejectedValue(
        new RoleError("Acesso negado"),
      );

      const res = await salvarRascunhoAnamneseAction(input);

      expect(res).toEqual({
        error:
          "Só coordenador ou terapeuta da equipe salva rascunho de anamnese.",
      });
      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });

  describe("validarAnamneseAction", () => {
    const patientId = "00000000-0000-0000-0000-000000000010";
    const input = { anamneseId: "00000000-0000-0000-0000-000000000099" };

    it("valida anamnese com sucesso e revalida paciente, timeline e anamnese (#285)", async () => {
      vi.mocked(validarAnamnese).mockResolvedValue({ id: input.anamneseId });

      const res = await validarAnamneseAction(patientId, input);

      expect(getTenantContext).toHaveBeenCalledTimes(1);
      expect(validarAnamnese).toHaveBeenCalledWith(mockCtx, input);
      expect(revalidatePath).toHaveBeenCalledWith(`/pacientes/${patientId}`);
      expect(revalidatePath).toHaveBeenCalledWith(
        `/pacientes/${patientId}/timeline`,
      );
      expect(revalidatePath).toHaveBeenCalledWith(
        `/pacientes/${patientId}/anamnese`,
      );
      expect(res).toEqual({ ok: true, id: input.anamneseId });
    });

    it("retorna erro de negócio quando logic retorna error", async () => {
      vi.mocked(validarAnamnese).mockResolvedValue({
        error: "Anamnese não encontrada ou já validada.",
      });

      const res = await validarAnamneseAction(patientId, input);

      expect(res).toEqual({
        error: "Anamnese não encontrada ou já validada.",
      });
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("trata RoleError com mensagem em pt-BR", async () => {
      vi.mocked(validarAnamnese).mockRejectedValue(
        new RoleError("Acesso negado"),
      );

      const res = await validarAnamneseAction(patientId, input);

      expect(res).toEqual({
        error: "Só coordenador valida a anamnese e define o marco zero.",
      });
      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });
});
