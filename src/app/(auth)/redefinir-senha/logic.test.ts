import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Dublês ──────────────────────────────────────────────────────────────────
// Fix round 2 (finding N2 da re-review): `logic.ts` executa a TROCA DE SENHA
// de verdade (superfície de account-takeover desta fatia) e entrou na Task 9
// sem nenhum teste — só verificação manual em navegador, o mesmo tipo de
// garantia que o achado I1 já havia sido corrigido por não bastar do outro
// lado do fluxo (`esqueci-senha/actions.test.ts`). Mesma forma de teste:
// desfechos estruturalmente distintos colapsam no MESMO objeto de resposta
// (`Set.size === 1`).

const { resetPassword, registrarTentativa, cookieStore, headerStore } =
  vi.hoisted(() => ({
    resetPassword: vi.fn(),
    registrarTentativa: vi.fn(),
    cookieStore: new Map<string, string>(),
    headerStore: new Map<string, string>(),
  }));

vi.mock("@/auth/auth", () => ({
  auth: { api: { resetPassword } },
}));

vi.mock("@/lib/throttle", () => ({
  registrarTentativa,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) => {
      const valor = cookieStore.get(nome);
      return valor === undefined ? undefined : { name: nome, value: valor };
    },
    delete: (arg: string | { name: string }) => {
      const nome = typeof arg === "string" ? arg : arg.name;
      cookieStore.delete(nome);
    },
  }),
  headers: async () => ({
    get: (k: string) => headerStore.get(k.toLowerCase()) ?? null,
  }),
}));

import { APIError } from "better-auth/api";
import {
  MENSAGEM_SEM_LINK_ATIVO,
  executarRedefinirSenha,
  validarNovaSenha,
} from "./logic";
import { NOME_COOKIE_TOKEN } from "./cookie";

function fd(senha: string, confirmacao = senha): FormData {
  const f = new FormData();
  f.set("senha", senha);
  f.set("confirmacao", confirmacao);
  return f;
}

const SENHA_VALIDA = "senha-valida-123";
const PISO_MS = 300;

describe("validarNovaSenha — limites de comprimento", () => {
  it("rejeita senha com menos de 12 caracteres", () => {
    const r = validarNovaSenha(fd("a".repeat(11)));
    expect(r).toEqual({
      ok: false,
      error: "A senha precisa ter ao menos 12 caracteres.",
    });
  });

  it("aceita senha com exatamente 12 caracteres", () => {
    const r = validarNovaSenha(fd("a".repeat(12)));
    expect(r.ok).toBe(true);
  });

  it("aceita senha com exatamente 128 caracteres", () => {
    const r = validarNovaSenha(fd("a".repeat(128)));
    expect(r.ok).toBe(true);
  });

  it("rejeita senha com mais de 128 caracteres", () => {
    const r = validarNovaSenha(fd("a".repeat(129)));
    expect(r).toEqual({
      ok: false,
      error: "A senha pode ter no máximo 128 caracteres.",
    });
  });

  it("rejeita quando a confirmação não bate", () => {
    const r = validarNovaSenha(fd(SENHA_VALIDA, SENHA_VALIDA + "x"));
    expect(r).toEqual({ ok: false, error: "As senhas não conferem." });
  });
});

describe("executarRedefinirSenha — resposta uniforme (anti-oráculo de token)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cookieStore.clear();
    headerStore.clear();
    // IP presente sempre — sem isto `resolverIp` devolve `null` e o núcleo
    // trata `ip === null` como `permitido = true` incondicional, o que
    // deixaria `registrarTentativa` nunca invocado e os testes de throttle
    // testando o caminho errado.
    headerStore.set("x-forwarded-for", "203.0.113.10");
    resetPassword.mockReset();
    registrarTentativa.mockReset();
    registrarTentativa.mockResolvedValue({ permitido: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Roda `executarRedefinirSenha` e resolve o piso de tempo em fake timers. */
  async function executar(formData: FormData) {
    const promessa = executarRedefinirSenha(formData);
    await vi.advanceTimersByTimeAsync(PISO_MS + 10);
    return promessa;
  }

  // Nota de desenho: diferente de `esqueci-senha` (onde SUCESSO e FALHA
  // colapsam no mesmo corpo, porque o oráculo ali é "este e-mail tem
  // conta"), aqui sucesso e falha são NECESSARIAMENTE distinguíveis — quem
  // redefine a senha precisa saber se deu certo. O oráculo que interessa
  // colapsar aqui é outro: os MOTIVOS de falha (cookie ausente, token
  // rejeitado, throttle, exceção de infra) não podem ser distinguíveis
  // ENTRE SI, senão um atacante testando tokens forjados usaria a distinção
  // para confirmar um palpite "quase certo".
  it("colapsa TODOS os motivos de falha (cookie ausente, token rejeitado, throttle, exceção de infra) no MESMO corpo", async () => {
    const respostas: [string, string][] = [];
    const silencio = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      // 1) cookie ausente (pré-núcleo).
      respostas.push([
        "cookie-ausente",
        JSON.stringify(await executarRedefinirSenha(fd(SENHA_VALIDA))),
      ]);

      // 2) token rejeitado/expirado pelo Better-Auth (lança).
      cookieStore.set(NOME_COOKIE_TOKEN, "token-invalido");
      resetPassword.mockRejectedValueOnce(new Error("token inválido"));
      respostas.push([
        "token-rejeitado",
        JSON.stringify(await executar(fd(SENHA_VALIDA))),
      ]);

      // 3) throttle por IP bloqueia (nem chega a chamar o Better-Auth).
      cookieStore.set(NOME_COOKIE_TOKEN, "token-qualquer");
      registrarTentativa.mockResolvedValueOnce({ permitido: false });
      respostas.push([
        "throttle",
        JSON.stringify(await executar(fd(SENHA_VALIDA))),
      ]);
      registrarTentativa.mockResolvedValue({ permitido: true });

      // 4) exceção de infra no próprio throttle (fail-closed).
      cookieStore.set(NOME_COOKIE_TOKEN, "token-qualquer");
      registrarTentativa.mockRejectedValueOnce(new Error("postgres indisponível"));
      respostas.push([
        "excecao-infra-throttle",
        JSON.stringify(await executar(fd(SENHA_VALIDA))),
      ]);
      registrarTentativa.mockResolvedValue({ permitido: true });
    } finally {
      silencio.mockRestore();
    }

    const distintas = new Set(respostas.map(([, r]) => r));
    expect(
      distintas.size,
      `respostas distinguíveis: ${JSON.stringify(respostas)}`,
    ).toBe(1);

    const [, corpoQualquer] = respostas[0]!;
    expect(corpoQualquer).toBe(
      JSON.stringify({ ok: false, error: MENSAGEM_SEM_LINK_ATIVO }),
    );
  });

  it("sucesso é distinguível de falha (assimetria esperada e necessária — não é regressão do colapso acima)", async () => {
    cookieStore.set(NOME_COOKIE_TOKEN, "token-valido");
    resetPassword.mockResolvedValueOnce({ status: true });
    const resultado = await executar(fd(SENHA_VALIDA));
    expect(resultado).toEqual({ ok: true });
  });

  it("nunca devolve o token no estado — mesmo em sucesso", async () => {
    cookieStore.set(NOME_COOKIE_TOKEN, "token-super-secreto");
    resetPassword.mockResolvedValueOnce({ status: true });
    const resultado = await executar(fd(SENHA_VALIDA));
    expect(JSON.stringify(resultado)).not.toContain("token-super-secreto");
  });

  it("devolve MENSAGEM_SEM_LINK_ATIVO sem chamar o Better-Auth quando não há cookie", async () => {
    // Sem cookie: pré-núcleo, sem I/O — inclusive sem piso de tempo (mesma
    // regra de formato inválido em `../esqueci-senha/logic.ts`).
    const inicio = Date.now();
    const resultado = await executarRedefinirSenha(fd(SENHA_VALIDA));
    expect(resultado).toEqual({ ok: false, error: MENSAGEM_SEM_LINK_ATIVO });
    expect(resetPassword).not.toHaveBeenCalled();
    expect(Date.now() - inicio).toBeLessThan(PISO_MS);
  });

  it("apaga o cookie após tentativa real (sucesso)", async () => {
    cookieStore.set(NOME_COOKIE_TOKEN, "token-valido");
    resetPassword.mockResolvedValueOnce({ status: true });
    await executar(fd(SENHA_VALIDA));
    expect(cookieStore.has(NOME_COOKIE_TOKEN)).toBe(false);
  });

  it("apaga o cookie quando o Better-Auth REJEITA o token (APIError 4xx — desfecho definitivo)", async () => {
    cookieStore.set(NOME_COOKIE_TOKEN, "token-invalido");
    resetPassword.mockRejectedValueOnce(
      new APIError("BAD_REQUEST", { message: "invalid token" }),
    );
    const silencio = vi.spyOn(console, "error").mockImplementation(() => {});
    await executar(fd(SENHA_VALIDA));
    silencio.mockRestore();
    expect(cookieStore.has(NOME_COOKIE_TOKEN)).toBe(false);
  });

  // Fix round 2 (finding W1 do review): infra fora do ar não é culpa do
  // usuário e o token dele continua válido — queimar o cookie aqui obrigava
  // uma vítima de outage nossa a recomeçar o fluxo de recuperação.
  it("NÃO apaga o cookie quando a chamada falha por infra (exceção comum — token pode continuar válido)", async () => {
    cookieStore.set(NOME_COOKIE_TOKEN, "token-da-vitima");
    resetPassword.mockRejectedValueOnce(new Error("postgres indisponível"));
    const silencio = vi.spyOn(console, "error").mockImplementation(() => {});
    await executar(fd(SENHA_VALIDA));
    silencio.mockRestore();
    expect(cookieStore.has(NOME_COOKIE_TOKEN)).toBe(true);
  });

  it("NÃO apaga o cookie quando o Better-Auth devolve APIError 5xx (ele falhou, não o token)", async () => {
    cookieStore.set(NOME_COOKIE_TOKEN, "token-da-vitima");
    resetPassword.mockRejectedValueOnce(
      new APIError("INTERNAL_SERVER_ERROR", { message: "boom" }),
    );
    const silencio = vi.spyOn(console, "error").mockImplementation(() => {});
    await executar(fd(SENHA_VALIDA));
    silencio.mockRestore();
    expect(cookieStore.has(NOME_COOKIE_TOKEN)).toBe(true);
  });

  // O cookie ficar ou não ficar não pode virar canal: as duas rotas devolvem
  // o mesmo corpo (o `Set.size === 1` acima já cobre; este é o par explícito).
  it("rejeição de token e falha de infra devolvem corpos indistinguíveis", async () => {
    const silencio = vi.spyOn(console, "error").mockImplementation(() => {});
    cookieStore.set(NOME_COOKIE_TOKEN, "t1");
    resetPassword.mockRejectedValueOnce(
      new APIError("BAD_REQUEST", { message: "invalid token" }),
    );
    const rejeitado = await executar(fd(SENHA_VALIDA));

    cookieStore.set(NOME_COOKIE_TOKEN, "t2");
    resetPassword.mockRejectedValueOnce(new Error("postgres indisponível"));
    const infra = await executar(fd(SENHA_VALIDA));
    silencio.mockRestore();

    expect(rejeitado).toEqual(infra);
    expect(rejeitado).toEqual({ ok: false, error: MENSAGEM_SEM_LINK_ATIVO });
  });

  it("trata falha de infraestrutura no throttle como fail-closed, logando erro seguro e bloqueando a tentativa", async () => {
    cookieStore.set(NOME_COOKIE_TOKEN, "token-qualquer");
    const erroInfra = new Error("redis offline");
    registrarTentativa.mockRejectedValueOnce(erroInfra);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await executar(fd(SENHA_VALIDA));

    expect(consoleSpy).toHaveBeenCalledWith(
      "executarRedefinirSenha: throttle indisponível, bloqueando (fail-closed):",
      "Error"
    );
    expect(resetPassword).not.toHaveBeenCalled();
    expect(cookieStore.has(NOME_COOKIE_TOKEN)).toBe(true);

    consoleSpy.mockRestore();
  });

  it("NÃO apaga o cookie quando o throttle bloqueia (protege a vítima de NAT compartilhado)", async () => {
    cookieStore.set(NOME_COOKIE_TOKEN, "token-da-vitima");
    registrarTentativa.mockResolvedValueOnce({ permitido: false });
    await executar(fd(SENHA_VALIDA));
    expect(cookieStore.has(NOME_COOKIE_TOKEN)).toBe(true);
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("respeita o piso de tempo mesmo quando o throttle pula toda a chamada ao Better-Auth", async () => {
    cookieStore.set(NOME_COOKIE_TOKEN, "token-qualquer");
    registrarTentativa.mockResolvedValueOnce({ permitido: false });
    const promessa = executarRedefinirSenha(fd(SENHA_VALIDA));
    let resolvida = false;
    void promessa.then(() => {
      resolvida = true;
    });

    await vi.advanceTimersByTimeAsync(PISO_MS - 50);
    expect(resolvida).toBe(false);

    await vi.advanceTimersByTimeAsync(100);
    expect(resolvida).toBe(true);
  });
});
