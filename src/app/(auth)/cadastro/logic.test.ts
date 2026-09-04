import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capturarLog } from "@/lib/observabilidade/captura-de-log";

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
  enviarEmailTransacional,
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
    enviarEmailTransacional: vi.fn(),
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

// Dublê OBRIGATÓRIO: o ramo CredencialInvalida dispara este e-mail em
// background (`void enviarEmailTransacional(...).catch(...)`, ver logic.ts).
// Sem o mock, o teste chama o módulo real — que só devolve `{ enviado: false
// }` se EMAIL_PROVIDER_API_KEY/RESEND_API_KEY estiverem ausentes do
// ambiente. Um `.env.local` de dev exportado pro shell (ou uma chave de CI
// futura) faria estes testes gastarem cota real da Resend a cada rodada.
vi.mock("@/lib/email/transacional", () => ({
  enviarEmailTransacional,
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
  email: "aline@clinicapasso.com.br",
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

  it.each([
    "aline@exemplo.com.br",
    "aline@exemplo.com",
    "aline@example.com",
    "aline@EXAMPLE.COM",
  ])("recusa domínio fictício %s ANTES do núcleo", (email) => {
    const r = validarCadastro(fd({ ...completo, email }));
    expect(r).toEqual({
      ok: false,
      error: "Use um e-mail real — este domínio não recebe mensagens.",
    });
  });

  it("recusa senha acima de 128 caracteres ANTES do núcleo", () => {
    // Rodada de correção 3. 129 caracteres é o gatilho exato: o Better-Auth
    // lança `APIError` no sign-up (`maxPasswordLength`) e NÃO lança no
    // `password.verify`, então os dois ramos divergiam sem tocar scrypt.
    // Barrado aqui, o núcleo nem roda. Erro específico é legítimo neste ponto
    // porque a validação não olha o banco e não depende de o e-mail existir.
    const r = validarCadastro(fd({ ...completo, senha: "x".repeat(129) }));
    expect(r).toEqual({
      ok: false,
      error: "A senha pode ter no máximo 128 caracteres.",
    });
    // O limite em si passa.
    expect(
      validarCadastro(fd({ ...completo, senha: "x".repeat(128) })).ok,
    ).toBe(true);
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
    enviarEmailTransacional.mockResolvedValue({ enviado: true });
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
      executarCadastro(fd({ ...completo, email: `s${i}@clinicapasso.com.br` })),
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
          email: `${i % 2 === 0 ? "existe" : "livre"}${i}@clinicapasso.com.br`,
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
   * CLASSE, não caso (rodada de correção 3).
   *
   * Este mesmo Critical já se mudou de lugar três vezes nesta fatia: fechou em
   * "conta completa" e reapareceu em "conta incompleta"; fechou lá e virou
   * canal de tempo; fechou o tempo e voltou pelo CORPO da resposta. O gatilho
   * da terceira vez foi uma senha de 129 caracteres: o Better-Auth aplica
   * `maxPasswordLength` no sign-up e NÃO no `password.verify`, então e-mail
   * novo dava `APIError` (corpo de erro) e e-mail existente dava
   * `CredencialInvalida` (corpo de sucesso). Um POST, um bit, determinístico —
   * imune ao piso de tempo e ao trabalho simétrico, porque nem toca scrypt.
   *
   * Um teste que só cobrisse "senha de 129 caracteres" não impediria a quarta
   * relocação. O que se assere aqui é a invariante: QUALQUER desfecho do
   * núcleo — inclusive um que ainda não existe — produz a resposta do sucesso.
   * A tabela existe para que adicionar um desfecho novo seja uma linha.
   */
  const DESFECHOS_DO_NUCLEO: [string, () => unknown][] = [
    ["sucesso (e-mail novo)", () => ({ userId: "u", clinicId: "c" })],
    [
      "CredencialInvalida (e-mail existe, senha errada)",
      () => {
        throw new CredencialInvalidaFake();
      },
    ],
    [
      "APIError do Better-Auth (senha > maxPasswordLength)",
      () => {
        // O caso que reabriu o oráculo: só o ramo de e-mail NOVO chega no
        // sign-up, que é onde o Better-Auth aplica o teto de 128.
        const e = new Error("Password too long");
        e.name = "APIError";
        throw e;
      },
    ],
    [
      "erro de driver Postgres (unique violation)",
      () => {
        // Só acontece no ramo de e-mail novo (é ele que faz os inserts) — ou
        // seja, mapear este erro para corpo próprio é o mesmo vazamento.
        throw Object.assign(new Error("duplicate key"), { code: "23505" });
      },
    ],
    [
      "hash corrompido em auth_account (verify lança)",
      () => {
        // Minor registrado pelo controlador: hash inválido faz
        // `password.verify` lançar em vez de devolver false. Só é alcançável
        // no ramo de e-mail EXISTENTE, logo é oráculo pelo lado oposto.
        throw new Error("Invalid scrypt hash format");
      },
    ],
    [
      "throw de não-Error (string)",
      () => {
        throw "pane";
      },
    ],
    [
      "throw de undefined",
      () => {
        throw undefined;
      },
    ],
  ];

  it.each(DESFECHOS_DO_NUCLEO)(
    "desfecho do núcleo %s colapsa na resposta do sucesso",
    async (_nome, produzir) => {
      const silencio = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        criarContaEClinica.mockImplementation(async () => produzir());
        const r = await executarCadastro(fd(completo));
        expect(r).toEqual({});
        expect(JSON.stringify(r)).toBe("{}");
        // `error` ausente é o que faz `actions.ts` redirecionar — se qualquer
        // desfecho trouxesse `error`, o redirect também viraria o oráculo.
        expect(Object.hasOwn(r, "error")).toBe(false);
      } finally {
        silencio.mockRestore();
      }
    },
    20_000,
  );

  it("nenhum par de desfechos do núcleo é distinguível entre si", async () => {
    // A asserção anterior é por linha; esta é sobre o CONJUNTO. Se um desfecho
    // novo entrar na tabela e vazar, os dois testes caem — este mostra o par.
    const silencio = vi.spyOn(console, "error").mockImplementation(() => {});
    const respostas: [string, string][] = [];
    try {
      for (const [nome, produzir] of DESFECHOS_DO_NUCLEO) {
        criarContaEClinica.mockImplementation(async () => produzir());
        respostas.push([
          nome,
          JSON.stringify(await executarCadastro(fd(completo))),
        ]);
      }
    } finally {
      silencio.mockRestore();
    }
    const distintas = new Set(respostas.map(([, r]) => r));
    expect(
      distintas.size,
      `respostas distinguíveis: ${JSON.stringify(respostas)}`,
    ).toBe(1);
  }, 30_000);

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

  it("STRADDLE: ramos em lados diferentes do piso não são amplificados", async () => {
    // Rodada de correção 2, achado I1 reaberto. A quantização da rodada 1
    // tinha um modo de falha PIOR que o piso puro: quando os dois ramos caem
    // em degraus DIFERENTES do quantum, o degrau vira amplificador. Medido
    // pelo re-reviewer na rota real: barato=1216 caro=2407 delta=1191ms.
    //
    // Com piso puro, nos mesmos custos, o delta observável é o delta do
    // TRABALHO (aqui ~400ms de custo injetado, na prática 38ms medidos contra
    // Postgres real) — nunca um quantum inteiro. Este teste fixa isso: os
    // custos são escolhidos de propósito para cair em lados opostos do piso.
    const custoBarato = PISO_RESPOSTA_MS - 300; // fica ABAIXO do piso
    const custoCaro = PISO_RESPOSTA_MS + 100; // fica ACIMA do piso

    criarContaEClinica.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, custoCaro));
      return { userId: "u", clinicId: "c" };
    });
    const t0 = Date.now();
    await executarCadastro(fd(completo));
    const msCaro = Date.now() - t0;

    criarContaEClinica.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, custoBarato));
      throw new CredencialInvalidaFake();
    });
    const t1 = Date.now();
    await executarCadastro(fd(completo));
    const msBarato = Date.now() - t1;

    // Com quantização isto daria ~2400 vs ~1200 = 1200ms de delta.
    expect(msBarato).toBeGreaterThanOrEqual(PISO_RESPOSTA_MS - 30);
    expect(msCaro).toBeGreaterThanOrEqual(PISO_RESPOSTA_MS - 30);
    expect(Math.abs(msCaro - msBarato)).toBeLessThan(250);
  }, 30_000);

  it("a espera na FILA do semáforo não entra na janela normalizada", async () => {
    // Rodada de correção 2. `iniciadoEm` fixado antes do semáforo punha a
    // espera na fila (até TIMEOUT_FILA_MS) dentro de `decorrido` — e a espera
    // é justamente a parte do relógio que o ATACANTE controla, carregando o
    // endpoint. Com ela dentro da janela, dá para empurrar o total para além
    // do piso sob demanda e voltar a ler o tempo do trabalho.
    //
    // O piso passa a ser contado a partir da AQUISIÇÃO da vaga. Consequência
    // observável: quem esperou na fila responde em `espera + piso`, não em
    // `piso`. É isso que este teste mede.
    const custoNucleo = 600;
    criarContaEClinica.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, custoNucleo));
      return { userId: "u", clinicId: "c" };
    });

    // 4 vagas ocupadas por `custoNucleo`; a 5ª espera por elas.
    const ocupantes = Array.from({ length: 4 }, (_, i) =>
      executarCadastro(
        fd({ ...completo, email: `ocup${i}@clinicapasso.com.br` }),
      ),
    );
    await new Promise((r) => setTimeout(r, 20)); // garante a ordem na fila
    const t0 = Date.now();
    const atrasado = executarCadastro(
      fd({ ...completo, email: "fila@clinicapasso.com.br" }),
    );
    await Promise.all([...ocupantes, atrasado]);
    const msAtrasado = Date.now() - t0;

    // Com `iniciadoEm` antes do semáforo daria ~max(piso, espera+núcleo) =
    // ~1200ms. Contado da aquisição, dá ~espera(600) + piso(1200) = ~1800ms.
    expect(msAtrasado).toBeGreaterThanOrEqual(
      PISO_RESPOSTA_MS + custoNucleo - 150,
    );
  }, 30_000);

  it("não emite log correlacionado ao ramo quando o piso é estourado", async () => {
    // Rodada de correção 2, quebra nova encontrada na re-review: o aviso
    // `PISO DE TEMPO ESTOURADO` só disparava no ramo que estourava — ou seja,
    // a linha de log correlacionava 1:1 com "o e-mail era novo". Quem lê o log
    // ganhava o oráculo de graça, e o custo do próprio log caía FORA da janela
    // normalizada. O canal saiu; observabilidade de estouro fica com métrica
    // genérica de duração de requisição, que não distingue ramo.
    const log = capturarLog();
    try {
      criarContaEClinica.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, PISO_RESPOSTA_MS + 200));
        return { userId: "u", clinicId: "c" };
      });
      await executarCadastro(fd(completo));
    } finally {
      log.restaurar();
    }
    // #560 (F4): mede o registro antes do transporte, e não o `console` — o
    // oráculo continua sendo "nenhuma linha correlacionada ao ramo saiu".
    expect(log.bruto()).not.toContain("PISO");
    expect(log.registros).toHaveLength(0);
  }, 30_000);

  // ── Log de erro do núcleo ──────────────────────────────────────────────────

  it("não despeja o erro cru do núcleo no log (e-mail/parâmetros de query)", async () => {
    // Rodada de correção 1, achado M1. Erro de driver do Postgres carrega os
    // parâmetros da query — aqui, e-mail do titular e potencialmente o hash da
    // senha. Log de servidor não é lugar de dado pessoal (LGPD) e o objeto cru
    // também vaza estrutura interna para quem lê o log.
    const log = capturarLog();
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
      log.restaurar();
    }

    const registro = log.evento("cadastro.falha-ao-criar-conta-e-clinica");
    expect(registro?.nivel).toBe("error");
    // A asserção negativa varre TUDO que foi capturado, não só o registro
    // esperado: o e-mail não pode reaparecer por outro caminho.
    const tudo = log.bruto();
    expect(tudo).not.toContain(completo.email);
    expect(tudo).not.toContain("scrypt$hash$secreto");
    // Nem a `message` do driver, que é onde o SQL e os params moram.
    expect(tudo).not.toContain("insert into user");
    // E ainda assim precisa ser diagnosticável: classe do erro + SQLSTATE, em
    // campos próprios. `erroNome` e não `nome`: `nome` é chave de PII na
    // redaction (é o nome do paciente no domínio) e sairia `[redigido]`.
    expect(registro?.erroNome).toBe("Error");
    expect(registro?.codigo).toBe("23505");
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
        executarCadastro(
          fd({ ...completo, email: `p${i}@clinicapasso.com.br` }),
        ),
      ),
    );
    expect(pico).toBeGreaterThan(0);
    expect(pico).toBeLessThanOrEqual(4);
  }, 30_000);
});
