import { afterEach, describe, expect, it, vi } from "vitest";
import { gerarCpfHash } from "./cpf-hash";

// `server-only` é resolvido para um stub vazio em vitest.config.ts (alias
// global, ver comentário lá) — nenhum mock adicional é necessário aqui.

describe("gerarCpfHash", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lança erro se CPF_HASH_SALT não estiver configurado", () => {
    vi.stubEnv("CPF_HASH_SALT", "");
    // stubEnv com "" ainda é falsy no `if (!salt)`, cobrindo tanto ausência
    // quanto string vazia.
    expect(() => gerarCpfHash("52998224725")).toThrow(/CPF_HASH_SALT/);
  });

  it("retorna hex de 64 caracteres quando o salt está configurado", () => {
    vi.stubEnv("CPF_HASH_SALT", "salt-de-teste");
    const hash = gerarCpfHash("52998224725");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("é determinístico: mesma entrada + mesmo salt produz o mesmo hash", () => {
    vi.stubEnv("CPF_HASH_SALT", "salt-de-teste");
    const hash1 = gerarCpfHash("52998224725");
    const hash2 = gerarCpfHash("52998224725");
    expect(hash1).toBe(hash2);
  });

  it("salt diferente produz hash diferente para a mesma entrada (prova que o salt entra no HMAC)", () => {
    // Sem este teste, trocar createHmac("sha256", salt) por createHash("sha256")
    // (ignorando o salt) passaria despercebido — os hashes só divergem aqui
    // porque o salt de fato participa do cálculo.
    vi.stubEnv("CPF_HASH_SALT", "salt-a");
    const hashComSaltA = gerarCpfHash("52998224725");

    vi.stubEnv("CPF_HASH_SALT", "salt-b");
    const hashComSaltB = gerarCpfHash("52998224725");

    expect(hashComSaltA).not.toBe(hashComSaltB);
  });

  it("entradas diferentes produzem hashes diferentes com o mesmo salt", () => {
    vi.stubEnv("CPF_HASH_SALT", "salt-de-teste");
    const hash1 = gerarCpfHash("52998224725");
    const hash2 = gerarCpfHash("11144477735");
    expect(hash1).not.toBe(hash2);
  });
});
