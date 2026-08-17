import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mensagemUniforme } from "./mensagem";

// ─── Dublês ──────────────────────────────────────────────────────────────────
// Fix round 1 (finding I1 do review): o teste anterior só comparava
// `mensagemUniforme()` com o literal — passava sem importar `logic.ts` e sem
// nunca chamar a action, então continuava verde se o throttle passasse a
// devolver "Muitas tentativas", se o catch fosse apagado, ou se o throttle
// inteiro sumisse. Aqui a invariante testada é a MESMA de
// `cadastro/logic.test.ts`: desfechos estruturalmente distintos colapsam no
// MESMO objeto de resposta.

const {
  requestPasswordReset,
  registrarTentativa,
  consumirTentativa,
  cabecalhos,
} = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  registrarTentativa: vi.fn(),
  consumirTentativa: vi.fn(),
  cabecalhos: new Map<string, string>(),
}));

vi.mock("@/auth/auth", () => ({
  auth: { api: { requestPasswordReset } },
}));

vi.mock("@/lib/throttle", () => ({
  registrarTentativa,
}));

vi.mock("@/lib/rate-limit", () => ({
  consumirTentativa,
}));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (k: string) => cabecalhos.get(k.toLowerCase()) ?? null,
  }),
}));

import { PISO_RESPOSTA_MS, executarEsqueciSenha } from "./logic";

function fd(email: string): FormData {
  const f = new FormData();
  f.set("email", email);
  return f;
}

describe("mensagemUniforme", () => {
  it("devolve a mesma mensagem para e-mail existente e inexistente", () => {
    expect(mensagemUniforme()).toBe(
      "Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha.",
    );
  });
});

describe("executarEsqueciSenha — resposta uniforme (anti-enumeração)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cabecalhos.clear();
    requestPasswordReset.mockReset();
    registrarTentativa.mockReset();
    consumirTentativa.mockReset();
    registrarTentativa.mockResolvedValue({ permitido: true });
    consumirTentativa.mockReturnValue({ permitido: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Roda `executarEsqueciSenha` e resolve o piso de tempo em fake timers. */
  async function executar(formData: FormData) {
    const promessa = executarEsqueciSenha(formData);
    await vi.advanceTimersByTimeAsync(PISO_RESPOSTA_MS + 10);
    return promessa;
  }

  it("devolve corpo IDÊNTICO para sucesso, exceção do Better-Auth, throttle persistente e throttle em memória", async () => {
    const respostas: [string, string][] = [];
    const silencio = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      // 1) sucesso (Better-Auth resolve — cobre tanto e-mail existente quanto
      // inexistente, já que o Better-Auth colapsa os dois internamente).
      requestPasswordReset.mockResolvedValueOnce({ status: true });
      respostas.push([
        "sucesso",
        JSON.stringify(await executar(fd("existe@exemplo.com"))),
      ]);

      // 2) Better-Auth lança (rede, banco, APIError interna).
      requestPasswordReset.mockRejectedValueOnce(new Error("falha simulada"));
      respostas.push([
        "excecao-better-auth",
        JSON.stringify(await executar(fd("qualquer@exemplo.com"))),
      ]);

      // 3) throttle PERSISTENTE bloqueia.
      registrarTentativa.mockResolvedValueOnce({ permitido: false });
      respostas.push([
        "throttle-persistente",
        JSON.stringify(await executar(fd("throttled@exemplo.com"))),
      ]);
      registrarTentativa.mockResolvedValue({ permitido: true });

      // 4) throttle EM MEMÓRIA bloqueia.
      consumirTentativa.mockReturnValueOnce({ permitido: false });
      respostas.push([
        "throttle-memoria",
        JSON.stringify(await executar(fd("throttled-mem@exemplo.com"))),
      ]);
    } finally {
      silencio.mockRestore();
    }

    const distintas = new Set(respostas.map(([, r]) => r));
    expect(
      distintas.size,
      `respostas distinguíveis: ${JSON.stringify(respostas)}`,
    ).toBe(1);
  });

  it("NÃO chama o Better-Auth quando o throttle (persistente OU em memória) bloqueia", async () => {
    registrarTentativa.mockResolvedValueOnce({ permitido: false });
    await executar(fd("bloqueado-persistente@exemplo.com"));
    expect(requestPasswordReset).not.toHaveBeenCalled();

    requestPasswordReset.mockReset();
    registrarTentativa.mockResolvedValue({ permitido: true });
    consumirTentativa.mockReturnValueOnce({ permitido: false });
    await executar(fd("bloqueado-memoria@exemplo.com"));
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it("chama os DOIS limitadores sempre, mesmo quando um já bloqueou (nenhum curto-circuita o outro)", async () => {
    consumirTentativa.mockReturnValueOnce({ permitido: false });
    await executar(fd("qualquer@exemplo.com"));
    expect(registrarTentativa).toHaveBeenCalled();
  });

  it("respeita o piso de tempo mesmo quando o throttle pula toda a chamada ao Better-Auth", async () => {
    registrarTentativa.mockResolvedValueOnce({ permitido: false });
    const promessa = executarEsqueciSenha(fd("bloqueado@exemplo.com"));
    let resolvida = false;
    void promessa.then(() => {
      resolvida = true;
    });

    await vi.advanceTimersByTimeAsync(PISO_RESPOSTA_MS - 50);
    expect(resolvida).toBe(false);

    await vi.advanceTimersByTimeAsync(100);
    expect(resolvida).toBe(true);
  });
});
