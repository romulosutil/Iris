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
  headers: async () => ({
    get: (k: string) => cabecalhos.get(k.toLowerCase()) ?? null,
  }),
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
      fd({
        ...completo,
        versaoTermo: "hostil-9999",
        versao_termo: "hostil-9999",
      }),
    );
    expect(criarContaEClinica).toHaveBeenCalledTimes(1);
    expect(criarContaEClinica.mock.calls[0]![0]).toMatchObject({
      versaoTermo: VERSAO_TERMO,
    });
    expect(VERSAO_TERMO).not.toBe("hostil-9999");
  });

  it("tira ip/userAgent dos headers e IGNORA os campos do formulário", async () => {
    await executarCadastro(
      fd({
        ...completo,
        ip: "1.2.3.4",
        userAgent: "forjado",
        user_agent: "forjado",
      }),
    );
    expect(criarContaEClinica.mock.calls[0]![0]).toMatchObject({
      // Última entrada do x-forwarded-for — ver `resolverIp`.
      ip: "10.0.0.1",
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
    expect(chaves).toContain("cadastro:ip:10.0.0.1");
    expect(chaves).toHaveLength(2);
  });

  it("dimensiona o limite de e-mail para login, não para cadastro", async () => {
    await executarCadastro(fd(completo));
    const porEmail = registrarTentativa.mock.calls.find((c) =>
      (c[0] as string).startsWith("cadastro:email:"),
    )!;
    expect(porEmail[1]).toBe(8); // limite
    expect(porEmail[2]).toBe(15 * 60); // janela, em segundos
    expect(porEmail[3]).toBeGreaterThan(15 * 60); // teto do backoff > janela
    // Teto CURTO de propósito (finding 5 do review): um teto longo transforma
    // ~9 POSTs numa arma de negação dirigida contra um e-mail conhecido.
    expect(porEmail[3]).toBeLessThanOrEqual(30 * 60);
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

  // ── IP desconhecido / forjado (finding 3 do review) ────────────────────────

  it("SEM x-forwarded-for: não cria bucket global, só conta por e-mail", async () => {
    cabecalhos.delete("x-forwarded-for");
    const r = await executarCadastro(fd(completo));

    const chaves = registrarTentativa.mock.calls.map((c) => c[0] as string);
    // A regressão que isto trava: colapsar todo mundo numa chave única
    // (`cadastro:ip:desconhecido`) fazia a rota se autonegar — 30 cadastros
    // legítimos em 15 min e o cadastro fechava para o mundo inteiro.
    expect(chaves).toEqual([`cadastro:email:${completo.email}`]);
    expect(chaves.some((k) => k.startsWith("cadastro:ip:"))).toBe(false);
    // E o cadastro continua funcionando normalmente.
    expect(criarContaEClinica).toHaveBeenCalledTimes(1);
    expect(r).toEqual({});
  });

  it("x-forwarded-for com lixo forjado não vira chave no store", async () => {
    cabecalhos.set("x-forwarded-for", "não-é-ip, <script>, " + "A".repeat(500));
    await executarCadastro(fd(completo));
    const chaves = registrarTentativa.mock.calls.map((c) => c[0] as string);
    expect(chaves.some((k) => k.startsWith("cadastro:ip:"))).toBe(false);
  });

  it("usa a ÚLTIMA entrada do x-forwarded-for (a que o proxy apenda)", async () => {
    // O começo da cadeia é a parte que o cliente consegue forjar; o fim é o que
    // o proxy confiável acrescenta.
    cabecalhos.set("x-forwarded-for", "1.2.3.4, 9.9.9.9, 198.51.100.22");
    await executarCadastro(fd(completo));
    const chaves = registrarTentativa.mock.calls.map((c) => c[0] as string);
    expect(chaves).toContain("cadastro:ip:198.51.100.22");
    expect(chaves).not.toContain("cadastro:ip:1.2.3.4");
  });

  it("cai para x-real-ip quando não há x-forwarded-for", async () => {
    cabecalhos.delete("x-forwarded-for");
    cabecalhos.set("x-real-ip", "198.51.100.7");
    await executarCadastro(fd(completo));
    const chaves = registrarTentativa.mock.calls.map((c) => c[0] as string);
    expect(chaves).toContain("cadastro:ip:198.51.100.7");
  });

  // ── Saturação de CPU (finding 4 do review) ─────────────────────────────────

  it("rejeita com resposta genérica quando a fila do semáforo satura", async () => {
    // 4 vagas + 32 de fila = 36; a 37ª em diante é recusada na hora.
    // O travamento se solta sozinho: se dependesse do fim do Promise.all,
    // as 4 chamadas em execução nunca terminariam e o semáforo (estado de
    // MÓDULO, compartilhado entre os testes) ficaria ocupado para sempre.
    let liberar!: () => void;
    const travado = new Promise<void>((r) => {
      liberar = r;
    });
    const solta = setTimeout(() => liberar(), 300);
    criarContaEClinica.mockImplementation(async () => {
      await travado;
      return { userId: "u", clinicId: "c" };
    });

    const emVoo = Array.from({ length: 40 }, (_, i) =>
      executarCadastro(fd({ ...completo, email: `s${i}@exemplo.com` })),
    );
    const resultados = await Promise.all(
      emVoo.map((p) =>
        p.then((r) => r).catch(() => ({ error: "VAZOU EXCEÇÃO" })),
      ),
    );
    clearTimeout(solta);
    liberar();

    const recusados = resultados.filter((r) => r.error);
    expect(recusados.length).toBeGreaterThan(0);
    // Nenhuma exceção vaza para o cliente, e a mensagem é genérica — não
    // menciona e-mail, conta nem existência.
    for (const r of recusados) {
      expect(r.error).toBe(
        "Não foi possível concluir o cadastro agora. Tente novamente em instantes.",
      );
    }
  }, 30_000);

  it("a recusa por saturação é a MESMA para e-mail livre e para e-mail cadastrado", async () => {
    let liberar!: () => void;
    const travado = new Promise<void>((r) => {
      liberar = r;
    });
    const solta = setTimeout(() => liberar(), 300);
    // Metade dos e-mails "existe e a senha está errada", metade é nova. Se a
    // recusa por saturação distinguisse os dois, apareceria aqui.
    criarContaEClinica.mockImplementation(
      async (entrada: { email: string }) => {
        await travado;
        if (entrada.email.startsWith("existe"))
          throw new CredencialInvalidaFake();
        return { userId: "u", clinicId: "c" };
      },
    );

    const emVoo = Array.from({ length: 40 }, (_, i) =>
      executarCadastro(
        fd({
          ...completo,
          email: `${i % 2 === 0 ? "existe" : "livre"}${i}@exemplo.com`,
        }),
      ),
    );
    const resultados = await Promise.all(emVoo);
    clearTimeout(solta);
    liberar();

    const mensagens = new Set(
      resultados.filter((r) => r.error).map((r) => r.error),
    );
    expect(mensagens.size).toBe(1);
  }, 30_000);

  // ── Resposta uniforme (anti-enumeração) ────────────────────────────────────

  it("devolve corpo IDÊNTICO para e-mail novo, retomada e senha errada", async () => {
    criarContaEClinica.mockResolvedValue({ userId: "novo", clinicId: "c1" });
    const rNovo = await executarCadastro(fd(completo));

    criarContaEClinica.mockResolvedValue({
      userId: "existente",
      clinicId: "c9",
    });
    const rRetomada = await executarCadastro(fd(completo));

    criarContaEClinica.mockRejectedValue(new CredencialInvalidaFake());
    const rSenhaErrada = await executarCadastro(fd(completo));

    expect(rNovo).toEqual({});
    expect(rRetomada).toEqual(rNovo);
    expect(rSenhaErrada).toEqual(rNovo);
    expect(JSON.stringify(rSenhaErrada)).toBe(JSON.stringify(rNovo));
  });

  /**
   * O custo caro fica no ramo **e-mail novo** (finding 2 do review): é ele que
   * deriva scrypt e faz três inserts. A primeira versão deste teste injetava o
   * custo no ramo barato, ou seja, media a direção que não importava. Aqui os
   * 400 ms vão para o ramo NOVO, e o ramo "senha errada" fica rápido — a
   * direção que de fato acontece em produção.
   */
  async function medir(): Promise<{ msNovo: number; msErrado: number }> {
    const t0 = Date.now();
    await executarCadastro(fd(completo));
    const msNovo = Date.now() - t0;

    criarContaEClinica.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 40));
      throw new CredencialInvalidaFake();
    });
    const t1 = Date.now();
    await executarCadastro(fd(completo));
    const msErrado = Date.now() - t1;
    return { msNovo, msErrado };
  }

  it("normaliza o tempo com o custo NO RAMO CARO (e-mail novo)", async () => {
    criarContaEClinica.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 400));
      return { userId: "u", clinicId: "c" };
    });
    const { msNovo, msErrado } = await medir();

    expect(msNovo).toBeGreaterThanOrEqual(PISO_RESPOSTA_MS - 30);
    expect(msErrado).toBeGreaterThanOrEqual(PISO_RESPOSTA_MS - 30);
    expect(Math.abs(msErrado - msNovo)).toBeLessThan(120);
  }, 20_000);

  it("normaliza o tempo também na direção inversa (custo no e-mail existente)", async () => {
    criarContaEClinica.mockImplementation(async () => ({
      userId: "u",
      clinicId: "c",
    }));
    const t0 = Date.now();
    await executarCadastro(fd(completo));
    const msNovo = Date.now() - t0;

    criarContaEClinica.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 400));
      throw new CredencialInvalidaFake();
    });
    const t1 = Date.now();
    await executarCadastro(fd(completo));
    const msErrado = Date.now() - t1;

    expect(msNovo).toBeGreaterThanOrEqual(PISO_RESPOSTA_MS - 30);
    expect(msErrado).toBeGreaterThanOrEqual(PISO_RESPOSTA_MS - 30);
    expect(Math.abs(msErrado - msNovo)).toBeLessThan(120);
  }, 20_000);

  it("AVISA quando o piso é estourado, em vez de degradar em silêncio", async () => {
    // Piso estourado = a resposta volta a revelar o ramo pelo tempo. Precisa
    // ser observável em produção, senão a proteção morre sem ninguém notar.
    const avisos: string[] = [];
    const original = console.warn;
    console.warn = (...a: unknown[]) => void avisos.push(String(a[0]));
    try {
      criarContaEClinica.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, PISO_RESPOSTA_MS + 200));
        return { userId: "u", clinicId: "c" };
      });
      await executarCadastro(fd(completo));
    } finally {
      console.warn = original;
    }
    expect(avisos.some((a) => a.includes("PISO DE TEMPO ESTOURADO"))).toBe(
      true,
    );
  }, 20_000);

  it("com o piso ESTOURADO, o tempo continua QUANTIZADO — não vira o tempo bruto", async () => {
    // Rodada de correção 1, achado I1. O piso fixo tem um modo de falha que o
    // teste anterior não cobria: assim que UM ramo passa de PISO_RESPOSTA_MS,
    // `respeitarPiso` deixa de esperar e o tempo de resposta passa a ser o
    // tempo BRUTO daquele ramo — ou seja, o canal reabre inteiro, com
    // resolução de milissegundo, exatamente no cenário em que mais importa
    // (ramo de e-mail novo caro sob carga).
    //
    // A correção não é "aumentar o piso" (o que exigiria adivinhar o custo do
    // hardware de produção, que é o que a review disse para não depender).
    // É QUANTIZAR: a resposta sai sempre num múltiplo do piso. Um ramo que
    // gasta 1.3 s e outro que gasta 1.7 s caem no MESMO múltiplo (2.4 s) e
    // continuam indistinguíveis, sem ninguém ter calibrado nada.
    const silenciar = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      criarContaEClinica.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, PISO_RESPOSTA_MS + 150));
        return { userId: "u", clinicId: "c" };
      });
      const t0 = Date.now();
      await executarCadastro(fd(completo));
      const msNovo = Date.now() - t0;

      criarContaEClinica.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, PISO_RESPOSTA_MS + 600));
        throw new CredencialInvalidaFake();
      });
      const t1 = Date.now();
      await executarCadastro(fd(completo));
      const msErrado = Date.now() - t1;

      // Sem quantização estes dois seriam ~1350 ms e ~1800 ms: 450 ms de
      // diferença, medível de fora com folga.
      expect(msNovo).toBeGreaterThanOrEqual(2 * PISO_RESPOSTA_MS - 30);
      expect(msErrado).toBeGreaterThanOrEqual(2 * PISO_RESPOSTA_MS - 30);
      expect(Math.abs(msErrado - msNovo)).toBeLessThan(120);
    } finally {
      silenciar.mockRestore();
    }
  }, 30_000);

  // ── Log de erro do núcleo ──────────────────────────────────────────────────

  it("não despeja o erro cru do núcleo no log (e-mail/parâmetros de query)", async () => {
    // Rodada de correção 1, achado M1. Erro de driver do Postgres carrega os
    // parâmetros da query — aqui, e-mail do titular e potencialmente o hash da
    // senha. Log de servidor não é lugar de dado pessoal (LGPD) e o objeto cru
    // também vaza estrutura interna para quem lê o log.
    const linhas: unknown[][] = [];
    const espiao = vi
      .spyOn(console, "error")
      .mockImplementation((...a: unknown[]) => {
        linhas.push(a);
      });
    try {
      const erroDeDriver = Object.assign(
        new Error("insert into user ... failed"),
        {
          code: "23505",
          parameters: [completo.email, "scrypt$hash$secreto"],
        },
      );
      criarContaEClinica.mockImplementation(async () => {
        throw erroDeDriver;
      });
      await executarCadastro(fd(completo));
    } finally {
      espiao.mockRestore();
    }

    expect(linhas.length).toBeGreaterThan(0);
    const tudo = linhas
      .map((l) => l.map((x) => String(x)).join(" "))
      .join("\n");
    expect(tudo).not.toContain(completo.email);
    expect(tudo).not.toContain("scrypt$hash$secreto");
    // Nenhum argumento pode ser o objeto de erro em si — `String(err)` esconde
    // as propriedades, mas o console de produção serializa o objeto inteiro.
    for (const linha of linhas) {
      for (const arg of linha) expect(arg).not.toBeInstanceOf(Error);
    }
    // E ainda assim precisa ser diagnosticável: nome do erro + código.
    expect(tudo).toContain("Error");
    expect(tudo).toContain("23505");
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
