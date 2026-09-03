import { describe, expect, it, vi, beforeEach } from "vitest";

// #582 — guard: `editarExtracaoAction` grava só os campos que
// `camposEditaveisDe(subtipo)` autoriza (mesma fonte que `revisao-lista.tsx`
// usa para decidir o que renderizar). Mocka `./logic` para observar
// EXATAMENTE o `payloadEditado` que chegaria ao core — nenhuma chave que o
// leitor do subtipo (`resumo.ts`) não consome pode aparecer ali.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/auth/tenant", () => ({
  getTenantContext: vi.fn(),
}));

vi.mock("./logic", () => ({
  aprovarExtracao: vi.fn(),
  descartarExtracao: vi.fn(),
  editarExtracao: vi.fn(),
}));

import { getTenantContext } from "@/auth/tenant";
import { editarExtracao } from "./logic";
import { editarExtracaoAction } from "./actions";

const mockCtx = {
  clinicId: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
  role: "terapeuta" as const,
};

function formData(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

describe("editarExtracaoAction (#582)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTenantContext).mockResolvedValue(mockCtx);
    vi.mocked(editarExtracao).mockResolvedValue({ ok: true });
  });

  it("cadeia: recusa explicitamente — hoje (código atual) isto gravaria nivel_ajuda na raiz do payload, que resumo.ts nunca lê (lê por etapa)", async () => {
    const res = await editarExtracaoAction(
      {},
      formData({
        sessionId: "00000000-0000-0000-0000-000000000003",
        extractionId: "00000000-0000-0000-0000-000000000004",
        versao: "1",
        subtipo: "cadeia",
        nivel_ajuda: "dica_fisica",
      }),
    );

    // A correção é RECUSADA, não gravada em silêncio — a leitura (resumo.ts,
    // `case "cadeia"`) itera `etapas[]` e nunca olha `payload.nivel_ajuda`.
    expect(res.error).toBeDefined();
    expect(res.error).toContain("Cadeia comportamental");
    expect(editarExtracao).not.toHaveBeenCalled();
  });

  it("evidencia: subtipo com os três campos na raiz — a edição É aceita e gravada", async () => {
    const res = await editarExtracaoAction(
      {},
      formData({
        sessionId: "00000000-0000-0000-0000-000000000003",
        extractionId: "00000000-0000-0000-0000-000000000004",
        versao: "1",
        subtipo: "evidencia",
        nivel_ajuda: "dica_fisica",
      }),
    );

    expect(res.error).toBeUndefined();
    // Só a CORREÇÃO viaja: o merge com o resto do conteúdo é do core, contra o
    // banco. Nenhuma outra chave pode aparecer aqui — um objeto reconstruído no
    // cliente sobrescreveria `payload_editado` inteiro e apagaria o resto.
    expect(editarExtracao).toHaveBeenCalledWith(
      mockCtx,
      expect.objectContaining({
        payloadEditado: { nivel_ajuda: "dica_fisica" },
      }),
    );
  });

  it.each([
    "registro_abc",
    "ausencia_comportamento",
    "preferencia_reforcador",
    "registro_pensamento",
    "aplicacao_escala_relatada",
    "tarefa_casa",
    "pendente",
  ])(
    "%s: nenhum dos três campos existe no payload — a edição é recusada, nunca gravada",
    async (subtipo) => {
      const res = await editarExtracaoAction(
        {},
        formData({
          sessionId: "00000000-0000-0000-0000-000000000003",
          extractionId: "00000000-0000-0000-0000-000000000004",
          versao: "1",
          subtipo,
          funcao: "qualquer coisa",
        }),
      );

      expect(res.error).toBeDefined();
      expect(editarExtracao).not.toHaveBeenCalled();
    },
  );
});
