import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Dublês ──────────────────────────────────────────────────────────────────
// O núcleo (Task 5) e o throttle persistente (este slice) são mockados: aqui
// testamos o CONTRATO do endpoint público — o que ele passa adiante, em que
// ordem, e o que ele devolve. O comportamento do núcleo tem os próprios testes
// de integração (cadastro.int.test.ts), e o do throttle tem throttle.int.test.ts.

const {
  criarContaEClinica,
  CredencialInvalidaFake,
  registrarTentativa,
  ThrottleIndisponivelFake,
  cabecalhos,
} = vi.hoisted(() => {
  class CredencialInvalidaFake extends Error {
    constructor() {
      super("cadastro: e-mail já cadastrado e a senha enviada não confere");
      this.name = "CredencialInvalida";
    }
  }
  class ThrottleIndisponivelFake extends Error {
    constructor() {
      super("throttle indisponível");
      this.name = "ThrottleIndisponivel";
    }
  }
  return {
    criarContaEClinica: vi.fn(),
    CredencialInvalidaFake,
    registrarTentativa: vi.fn(),
    ThrottleIndisponivelFake,
    cabecalhos: new Map<string, string>(),
  };
});

vi.mock("@/auth/cadastro", () => ({
  criarContaEClinica,
  CredencialInvalida: CredencialInvalidaFake,
}));

vi.mock("@/lib/throttle", () => ({
  registrarTentativa,
  ThrottleIndisponivel: ThrottleIndisponivelFake,
}));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => cabecalhos.get(k.toLowerCase()) ?? null }),
}));

import {
  PISO_RESPOSTA_MS,
  VERSAO_TERMO,
  executarCadastro,
  validarCadastro,
} from "./logic";

function fd(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

const completo = {
  email: "aline@exemplo.com.br",
  senha: "Senha Forte 123",
  nome: "Aline Souza",
  nomeClinica: "Clínica Passo",
  conselho: "crp",
  registroNumero: "06/123456",
  registroUf: "SP",
  termos: "on",
};

describe("validarCadastro", () => {
  it("aceita cadastro completo", () => {
    const r = validarCadastro(fd(completo));
    expect(r.ok).toBe(true);
  });

  it("exige aceite dos termos", () => {
    const { termos: _termos, ...semTermos } = completo;
    const r = validarCadastro(fd(semTermos));
    expect(r).toEqual({
      ok: false,
      error: "É preciso aceitar os termos de uso para criar a conta.",
    });
  });

  it("exige conselho válido", () => {
    const r = validarCadastro(fd({ ...completo, conselho: "inventado" }));
    expect(r.ok).toBe(false);
  });

  it("exige senha de no mínimo 12 caracteres", () => {
    const r = validarCadastro(fd({ ...completo, senha: "curta123" }));
    expect(r).toEqual({
      ok: false,
      error: "A senha precisa ter ao menos 12 caracteres.",
    });
  });
});

describe("executarCadastro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cabecalhos.clear();
    cabecalhos.set("x-forwarded-for", "203.0.113.7, 10.0.0.1");
    cabecalhos.set("user-agent", "Mozilla/5.0 (teste)");
    registrarTentativa.mockResolvedValue({ permitido: true });
    criarContaEClinica.mockResolvedValue({ userId: "u1", clinicId: "c1" });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Confiança no cliente ───────────────────────────────────────────────────

  it("usa a VERSAO_TERMO do servidor e IGNORA a que vier no formulário", async () => {
    await executarCadastro(
      fd({ ...completo, versaoTermo: "hostil-9999", versao_termo: "hostil-9999" }),
    );
    expect(criarContaEClinica).toHaveBeenCalledTimes(1);
    expect(criarContaEClinica.mock.calls[0]![0]).toMatchObject({
      versaoTermo: VERSAO_TERMO,
    });
    expect(VERSAO_TERMO).not.toBe("hostil-9999");
  });

  it("tira ip/userAgent dos headers e IGNORA os campos do formulário", async () => {
    await executarCadastro(
      fd({ ...completo, ip: "1.2.3.4", userAgent: "forjado", user_agent: "forjado" }),
    );
    expect(criarContaEClinica.mock.calls[0]![0]).toMatchObject({
      ip: "203.0.113.7",
      userAgent: "Mozilla/5.0 (teste)",
    });
  });

  // ── Throttle: antes do núcleo, fail-closed, e sem diferenciar ramo ─────────

  it("consome o throttle ANTES de chamar o núcleo", async () => {
    const ordem: string[] = [];
    registrarTentativa.mockImplementation(async () => {
      ordem.push("throttle");
      return { permitido: true };
    });
    criarContaEClinica.mockImplementation(async () => {
      ordem.push("nucleo");
      return { userId: "u1", clinicId: "c1" };
    });
    await executarCadastro(fd(completo));
    expect(ordem[0]).toBe("throttle");
    expect(ordem).toContain("nucleo");
  });

  it("conta por e-mail E por IP, em chaves independentes", async () => {
    await executarCadastro(fd(completo));
    const chaves = registrarTentativa.mock.calls.map((c) => c[0] as string);
    expect(chaves).toContain(`cadastro:email:${completo.email}`);
    expect(chaves).toContain("cadastro:ip:203.0.113.7");
    expect(chaves).toHaveLength(2);
  });

  it("dimensiona o limite de e-mail para login (5 falhas / 15 min), não para cadastro", async () => {
    await executarCadastro(fd(completo));
    const porEmail = registrarTentativa.mock.calls.find((c) =>
      (c[0] as string).startsWith("cadastro:email:"),
    )!;
    expect(porEmail[1]).toBe(5); // limite
    expect(porEmail[2]).toBe(15 * 60); // janela, em segundos
    expect(porEmail[3]).toBeGreaterThan(15 * 60); // teto do backoff > janela
  });

  it("bloqueia sem chamar o núcleo quando o throttle nega", async () => {
    registrarTentativa.mockResolvedValue({ permitido: false });
    const r = await executarCadastro(fd(completo));
    expect(criarContaEClinica).not.toHaveBeenCalled();
    expect(r.error).toBeTruthy();
  });

  it("consome AMBOS os contadores mesmo quando o primeiro já nega (sem short-circuit)", async () => {
    registrarTentativa.mockResolvedValue({ permitido: false });
    await executarCadastro(fd(completo));
    expect(registrarTentativa).toHaveBeenCalledTimes(2);
  });

  it("FALHA FECHADO: store indisponível bloqueia e não chama o núcleo", async () => {
    registrarTentativa.mockRejectedValue(new ThrottleIndisponivelFake());
    const r = await executarCadastro(fd(completo));
    expect(criarContaEClinica).not.toHaveBeenCalled();
    expect(r.error).toBeTruthy();
  });

  it("conta a tentativa de forma IDÊNTICA para e-mail novo e para senha errada", async () => {
    await executarCadastro(fd(completo));
    const novoArgs = registrarTentativa.mock.calls.map((c) => c.slice(1));

    vi.clearAllMocks();
    registrarTentativa.mockResolvedValue({ permitido: true });
    criarContaEClinica.mockRejectedValue(new CredencialInvalidaFake());
    await executarCadastro(fd(completo));
    const erradoArgs = registrarTentativa.mock.calls.map((c) => c.slice(1));

    // Mesmos limites, mesma janela, mesma quantidade de chamadas: o contador
    // NUNCA olha o resultado do núcleo, então não pode virar oráculo.
    expect(erradoArgs).toEqual(novoArgs);
    expect(registrarTentativa).toHaveBeenCalledTimes(2);
  });

  // ── Resposta uniforme (anti-enumeração) ────────────────────────────────────

  it("devolve corpo IDÊNTICO para e-mail novo, retomada e senha errada", async () => {
    criarContaEClinica.mockResolvedValue({ userId: "novo", clinicId: "c1" });
    const rNovo = await executarCadastro(fd(completo));

    criarContaEClinica.mockResolvedValue({ userId: "existente", clinicId: "c9" });
    const rRetomada = await executarCadastro(fd(completo));

    criarContaEClinica.mockRejectedValue(new CredencialInvalidaFake());
    const rSenhaErrada = await executarCadastro(fd(completo));

    expect(rNovo).toEqual({});
    expect(rRetomada).toEqual(rNovo);
    expect(rSenhaErrada).toEqual(rNovo);
    expect(JSON.stringify(rSenhaErrada)).toBe(JSON.stringify(rNovo));
  });

  it("normaliza o tempo: piso mínimo e diferença desprezível entre os ramos", async () => {
    // Ramo "e-mail novo": núcleo rápido.
    criarContaEClinica.mockImplementation(async () => ({
      userId: "u",
      clinicId: "c",
    }));
    const t0 = Date.now();
    await executarCadastro(fd(completo));
    const msNovo = Date.now() - t0;

    // Ramo "e-mail existente + senha errada": scrypt real custa tempo.
    criarContaEClinica.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 120));
      throw new CredencialInvalidaFake();
    });
    const t1 = Date.now();
    await executarCadastro(fd(completo));
    const msErrado = Date.now() - t1;

    expect(msNovo).toBeGreaterThanOrEqual(PISO_RESPOSTA_MS - 30);
    expect(msErrado).toBeGreaterThanOrEqual(PISO_RESPOSTA_MS - 30);
    expect(Math.abs(msErrado - msNovo)).toBeLessThan(120);
  }, 20_000);

  // ── Concorrência ───────────────────────────────────────────────────────────

  it("limita verificações de senha simultâneas (teto de CPU na rota pública)", async () => {
    let simultaneas = 0;
    let pico = 0;
    criarContaEClinica.mockImplementation(async () => {
      simultaneas += 1;
      pico = Math.max(pico, simultaneas);
      await new Promise((r) => setTimeout(r, 30));
      simultaneas -= 1;
      return { userId: "u", clinicId: "c" };
    });
    await Promise.all(
      Array.from({ length: 24 }, (_, i) =>
        executarCadastro(fd({ ...completo, email: `p${i}@exemplo.com` })),
      ),
    );
    expect(pico).toBeGreaterThan(0);
    expect(pico).toBeLessThanOrEqual(4);
  }, 30_000);
});
