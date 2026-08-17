import { afterEach, describe, expect, test } from "vitest";
import { canaisIndisponiveis } from "./notificacao";

describe("notificacao.ts — canaisIndisponiveis (#126)", () => {
  afterEach(() => {
    delete process.env.EMAIL_PROVIDER_API_KEY;
    delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  });

  test("estágio 2 sem EMAIL_PROVIDER_API_KEY registra e-mail indisponível", () => {
    delete process.env.EMAIL_PROVIDER_API_KEY;
    expect(canaisIndisponiveis(2)).toContain(
      "email_responsavel_tecnico_indisponivel",
    );
  });

  test("estágio 2 com EMAIL_PROVIDER_API_KEY configurada não registra indisponibilidade", () => {
    process.env.EMAIL_PROVIDER_API_KEY = "chave-de-teste";
    expect(canaisIndisponiveis(2)).not.toContain(
      "email_responsavel_tecnico_indisponivel",
    );
  });

  test("estágios 0 e 1 nunca checam e-mail (só existe no estágio 2)", () => {
    delete process.env.EMAIL_PROVIDER_API_KEY;
    expect(canaisIndisponiveis(0)).not.toContain(
      "email_responsavel_tecnico_indisponivel",
    );
    expect(canaisIndisponiveis(1)).not.toContain(
      "email_responsavel_tecnico_indisponivel",
    );
  });
});
