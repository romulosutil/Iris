/**
 * #154 — o motor de escalonamento precisa saber SE vale retentar um envio que
 * falhou. Sem essa distinção, ou ele retenta erro permanente às cegas (gasta
 * varredura para chegar na mesma falha) ou descarta falha de rede que só
 * precisava de mais uma tentativa. Estes testes travam a classificação.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { classificarErroResend, enviarEmailRt } from "./resend-rt.mjs";

// `new Resend(...)` é chamado com `new` — a implementação do dublê precisa ser
// `function`, não arrow (arrow não é construtor e o erro vira "is not a
// constructor" dentro do try/catch, mascarando o caminho testado).
vi.mock("resend", () => ({
  Resend: vi.fn(function () {
    return { emails: { send: vi.fn() } };
  }),
}));

const BASE = {
  apiKey: "re_teste",
  fromEmail: "a@b.com",
  appUrl: "https://app.example.com",
  rtEmail: "rt@clinica.example",
};

async function mockarResend(impl) {
  const { Resend } = await import("resend");
  Resend.mockImplementation(function () {
    return { emails: { send: impl } };
  });
}

describe("enviarEmailRt — classificação transitório vs permanente (#154)", () => {
  afterEach(() => vi.clearAllMocks());

  test("rate_limit_exceeded é transitório", async () => {
    await mockarResend(
      vi.fn().mockResolvedValue({
        data: null,
        error: { name: "rate_limit_exceeded", message: "too many requests" },
      }),
    );

    const resultado = await enviarEmailRt(BASE);

    expect(resultado.ok).toBe(false);
    expect(resultado.transitorio).toBe(true);
    expect(resultado.erro).toBe("too many requests");
  });

  test("internal_server_error é transitório", async () => {
    await mockarResend(
      vi.fn().mockResolvedValue({
        data: null,
        error: { name: "internal_server_error", message: "boom no provedor" },
      }),
    );

    const resultado = await enviarEmailRt(BASE);

    expect(resultado.ok).toBe(false);
    expect(resultado.transitorio).toBe(true);
  });

  test("validation_error é permanente", async () => {
    await mockarResend(
      vi.fn().mockResolvedValue({
        data: null,
        error: { name: "validation_error", message: "from invalido" },
      }),
    );

    const resultado = await enviarEmailRt(BASE);

    expect(resultado.ok).toBe(false);
    expect(resultado.transitorio).toBe(false);
    expect(resultado.erro).toBe("from invalido");
  });

  test("exceção de rede (fetch failed) é transitório", async () => {
    await mockarResend(vi.fn().mockRejectedValue(new Error("fetch failed")));

    const resultado = await enviarEmailRt(BASE);

    expect(resultado.ok).toBe(false);
    expect(resultado.transitorio).toBe(true);
    expect(resultado.erro).toBe("fetch failed");
  });

  test("erro desconhecido do provedor é permanente (não retenta às cegas)", async () => {
    await mockarResend(
      vi.fn().mockResolvedValue({
        data: null,
        error: { name: "algo_novo", message: "erro que ainda nao mapeamos" },
      }),
    );

    const resultado = await enviarEmailRt(BASE);

    expect(resultado.ok).toBe(false);
    expect(resultado.transitorio).toBe(false);
  });

  test("apiKey ausente é permanente (configuração, não rede)", async () => {
    const resultado = await enviarEmailRt({ ...BASE, apiKey: "" });

    expect(resultado.ok).toBe(false);
    expect(resultado.transitorio).toBe(false);
  });

  test("appUrl ausente é permanente", async () => {
    const resultado = await enviarEmailRt({ ...BASE, appUrl: "" });

    expect(resultado.ok).toBe(false);
    expect(resultado.transitorio).toBe(false);
  });

  test("sucesso devolve transitorio=false", async () => {
    await mockarResend(
      vi.fn().mockResolvedValue({ data: { id: "msg_1" }, error: null }),
    );

    const resultado = await enviarEmailRt(BASE);

    expect(resultado.ok).toBe(true);
    expect(resultado.transitorio).toBe(false);
    expect(resultado.providerMessageId).toBe("msg_1");
  });
});

describe("classificarErroResend", () => {
  test("nome nulo/indefinido não é transitório", () => {
    expect(classificarErroResend(undefined)).toBe(false);
    expect(classificarErroResend(null)).toBe(false);
  });
});
