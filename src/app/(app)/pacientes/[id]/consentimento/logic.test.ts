import { describe, expect, it, vi, beforeEach } from "vitest";
import { registrarEventoConsentimento } from "./logic";
import { RoleError } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { traduzirErroDeConsentimento } from "@/lib/consent/erros";

// Mock das dependências externas. `@/auth/require-role` NÃO é mockado de
// propósito: o `requireRole` real roda contra um `ctx` com papel permitido, e o
// `RoleError` real é o mesmo do módulo sob teste (se o contrato mudar, o teste
// quebra em vez de mascarar).
vi.mock("@/db/rls", () => ({
  withTenant: vi.fn(),
}));

vi.mock("@/lib/consent/erros", () => ({
  traduzirErroDeConsentimento: vi.fn(),
}));

describe("registrarEventoConsentimento - Tratamento de Erros", () => {
  // Papel permitido por `requireRole(ctx, "admin_recepcao", "coordenador")` —
  // assim a guarda real passa e os testes exercitam o try/catch adiante.
  const mockCtx: TenantContext = {
    clinicId: "11111111-1111-4111-8111-111111111111",
    userId: "22222222-2222-4222-8222-222222222222",
    role: "admin_recepcao",
  };
  const validPatientId = "123e4567-e89b-12d3-a456-426614174000"; // UUID válido
  const validEvent = { evento: "renovacao_maioridade" } as const;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve re-lançar RoleError vindo de dentro do try", async () => {
    // Em produção o `requireRole` roda ANTES do try, então um RoleError não
    // nasce do bloco protegido — o `if (e instanceof RoleError) throw e` é
    // defensivo (protege caso alguma chamada dentro do withTenant passe a
    // lançá-lo). O teste cobre esse ramo do catch injetando o erro real pelo
    // withTenant: o contrato exercitado é "RoleError não vira {error}, sobe".
    vi.mocked(withTenant).mockRejectedValueOnce(
      new RoleError("Acesso negado: papel não pode executar esta ação."),
    );

    await expect(
      registrarEventoConsentimento(mockCtx, validPatientId, validEvent),
    ).rejects.toThrow(RoleError);
  });

  it("deve capturar ErroDeValidacao e retornar a mensagem de erro", async () => {
    // ErroDeValidacao não é exportado, mas podemos forçar o withTenant a chamá-lo
    // ao fornecer um input inválido (ex: consentIdAlvo inválido na revogação)

    // Na revogação, consentIdAlvo = "invalido" vai estourar ErroDeValidacao
    // O withTenant precisa executar o callback para isso acontecer
    vi.mocked(withTenant).mockImplementation(async (_ctx, fn) => {
      // Passa um tx fake vazio, não importa porque a validação falha antes de usar o db
      return fn({} as any);
    });

    const result = await registrarEventoConsentimento(mockCtx, validPatientId, {
      evento: "revogacao",
      consentIdAlvo: "id-invalido-nao-uuid",
    });

    expect(result).toEqual({
      error: "Selecione qual consentimento será revogado.",
    });
  });

  it("deve usar o tradutor de erros para erros genéricos do banco", async () => {
    const errorDb = new Error("violação de constraint obscura do banco");
    vi.mocked(withTenant).mockRejectedValueOnce(errorDb);

    // Simula que o tradutor conseguiu identificar o erro
    vi.mocked(traduzirErroDeConsentimento).mockReturnValueOnce(
      "Erro traduzido e amigável para o operador.",
    );

    const result = await registrarEventoConsentimento(
      mockCtx,
      validPatientId,
      validEvent,
    );

    expect(result).toEqual({
      error: "Erro traduzido e amigável para o operador.",
    });
    expect(traduzirErroDeConsentimento).toHaveBeenCalledWith(errorDb);
  });

  it("deve usar mensagem fallback quando o tradutor não reconhece o erro", async () => {
    const erroDesconhecido = new Error("erro bizarro");
    vi.mocked(withTenant).mockRejectedValueOnce(erroDesconhecido);

    // Simula que o tradutor retornou null (não reconheceu o erro)
    vi.mocked(traduzirErroDeConsentimento).mockReturnValueOnce(null);

    const result = await registrarEventoConsentimento(
      mockCtx,
      validPatientId,
      validEvent,
    );

    expect(result).toEqual({
      error:
        "Não foi possível registrar o evento de consentimento. Tente novamente.",
    });
  });
});
