import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  extractDatabaseHost,
  isLocalDatabaseHost,
  isLocalDatabase,
  assertSeedAllowed,
} from "./guardrail-seed";

describe("guardrail-seed (D52)", () => {
  const originalEnv = process.env.ALLOW_SEED_REMOTE;

  beforeEach(() => {
    delete process.env.ALLOW_SEED_REMOTE;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ALLOW_SEED_REMOTE = originalEnv;
    } else {
      delete process.env.ALLOW_SEED_REMOTE;
    }
    vi.restoreAllMocks();
  });

  describe("extractDatabaseHost", () => {
    it("extrai hostname de URLs padrão postgres e postgresql com porta", () => {
      expect(
        extractDatabaseHost("postgres://iris:iris@localhost:5433/iris"),
      ).toBe("localhost");
      expect(
        extractDatabaseHost(
          "postgresql://user:pass@127.0.0.1:5432/iris?sslmode=disable",
        ),
      ).toBe("127.0.0.1");
    });

    it("extrai hostname IPv6 com colchetes", () => {
      expect(extractDatabaseHost("postgres://iris:pass@[::1]:5433/iris")).toBe(
        "::1",
      );
      expect(extractDatabaseHost("postgresql://user:pass@[::1]/iris")).toBe(
        "::1",
      );
    });

    it("extrai hostnames remotos", () => {
      expect(
        extractDatabaseHost(
          "postgres://iris:secret@db.easypanel.host:5432/iris_prod",
        ),
      ).toBe("db.easypanel.host");
      expect(
        extractDatabaseHost(
          "postgres://app:secret@staging-postgres.iris.internal/iris",
        ),
      ).toBe("staging-postgres.iris.internal");
      expect(
        extractDatabaseHost("postgresql://user:pass@192.168.1.100:5432/iris"),
      ).toBe("192.168.1.100");
    });

    it("extrai host de strings formato libpq key-value", () => {
      expect(
        extractDatabaseHost("host=localhost port=5432 dbname=iris user=iris"),
      ).toBe("localhost");
      expect(extractDatabaseHost("host=127.0.0.1 dbname=iris")).toBe(
        "127.0.0.1",
      );
      expect(extractDatabaseHost("host=[::1] port=5432 dbname=iris")).toBe(
        "::1",
      );
      expect(extractDatabaseHost("host=remote-server.com dbname=iris")).toBe(
        "remote-server.com",
      );
    });

    it("lança erro para strings vazias, nulas ou malformadas", () => {
      expect(() => extractDatabaseHost("")).toThrow(
        /não informada ou inválida/,
      );
      expect(() => extractDatabaseHost(null as unknown as string)).toThrow(
        /não informada ou inválida/,
      );
      expect(() => extractDatabaseHost("nao-eh-uma-url-nem-tem-host")).toThrow(
        /Não foi possível determinar o host/,
      );
    });
  });

  describe("isLocalDatabaseHost", () => {
    it("identifica corretamente hosts locais / loopback", () => {
      expect(isLocalDatabaseHost("localhost")).toBe(true);
      expect(isLocalDatabaseHost("LOCALHOST")).toBe(true);
      expect(isLocalDatabaseHost("127.0.0.1")).toBe(true);
      expect(isLocalDatabaseHost("::1")).toBe(true);
      expect(isLocalDatabaseHost("[::1]")).toBe(true);
      expect(isLocalDatabaseHost("0.0.0.0")).toBe(true);
      expect(isLocalDatabaseHost("localhost.localdomain")).toBe(true);
    });

    it("rejeita hosts remotos, staging e produção", () => {
      expect(isLocalDatabaseHost("db.easypanel.host")).toBe(false);
      expect(isLocalDatabaseHost("postgres.iris.app")).toBe(false);
      expect(isLocalDatabaseHost("staging.iris.internal")).toBe(false);
      expect(isLocalDatabaseHost("192.168.1.50")).toBe(false);
      expect(isLocalDatabaseHost("10.0.0.1")).toBe(false);
      expect(isLocalDatabaseHost("")).toBe(false);
    });
  });

  describe("isLocalDatabase", () => {
    it("valida connection strings completas", () => {
      expect(isLocalDatabase("postgres://iris:iris@localhost:5433/iris")).toBe(
        true,
      );
      expect(isLocalDatabase("postgres://iris:iris@127.0.0.1:5433/iris")).toBe(
        true,
      );
      expect(isLocalDatabase("postgres://iris:iris@[::1]:5433/iris")).toBe(
        true,
      );
      expect(
        isLocalDatabase("postgres://iris:iris@remote-db.com:5432/iris"),
      ).toBe(false);
    });
  });

  describe("assertSeedAllowed", () => {
    it("lança erro se connection string estiver ausente", () => {
      expect(() => assertSeedAllowed("")).toThrow(/não informada para o seed/);
      expect(() => assertSeedAllowed(undefined)).toThrow(
        /não informada para o seed/,
      );
    });

    it("permite execução em localhost sem necessidade de ALLOW_SEED_REMOTE", () => {
      const result = assertSeedAllowed(
        "postgres://iris:iris@localhost:5433/iris",
      );
      expect(result).toEqual({ isLocal: true, host: "localhost" });
    });

    it("permite execução em 127.0.0.1 sem necessidade de ALLOW_SEED_REMOTE", () => {
      const result = assertSeedAllowed(
        "postgres://iris:iris@127.0.0.1:5432/iris",
      );
      expect(result).toEqual({ isLocal: true, host: "127.0.0.1" });
    });

    it("bloqueia banco remoto quando ALLOW_SEED_REMOTE não está definida", () => {
      delete process.env.ALLOW_SEED_REMOTE;
      expect(() =>
        assertSeedAllowed(
          "postgres://iris:secret@db.easypanel.host:5432/iris_prod",
        ),
      ).toThrowError(
        /\[GUARDRAIL SEED\] Execução bloqueada: o banco de dados de destino \("db\.easypanel\.host"\) não é um ambiente local/,
      );
    });

    it("bloqueia banco remoto quando ALLOW_SEED_REMOTE é false ou outro valor", () => {
      expect(() =>
        assertSeedAllowed(
          "postgres://iris:secret@db.staging.internal:5432/iris",
          "false",
        ),
      ).toThrowError(/\[GUARDRAIL SEED\] Execução bloqueada/);

      expect(() =>
        assertSeedAllowed(
          "postgres://iris:secret@db.staging.internal:5432/iris",
          "0",
        ),
      ).toThrowError(/\[GUARDRAIL SEED\] Execução bloqueada/);

      expect(() =>
        assertSeedAllowed(
          "postgres://iris:secret@db.staging.internal:5432/iris",
          "",
        ),
      ).toThrowError(/\[GUARDRAIL SEED\] Execução bloqueada/);
    });

    it("permite banco remoto quando ALLOW_SEED_REMOTE=true (com log de warning)", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = assertSeedAllowed(
        "postgres://iris:secret@db.staging.internal:5432/iris",
        "true",
      );

      expect(result).toEqual({
        isLocal: false,
        host: "db.staging.internal",
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'ALLOW_SEED_REMOTE=true detectado. Executando seed contra banco remoto: "db.staging.internal"',
        ),
      );
    });

    it("permite banco remoto com flag passada case-insensitive ('TRUE')", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = assertSeedAllowed(
        "postgres://iris:secret@db.staging.internal:5432/iris",
        " TRUE ",
      );

      expect(result).toEqual({
        isLocal: false,
        host: "db.staging.internal",
      });
    });

    it("lê process.env.ALLOW_SEED_REMOTE por default", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      process.env.ALLOW_SEED_REMOTE = "true";

      const result = assertSeedAllowed(
        "postgres://iris:secret@db.staging.internal:5432/iris",
      );

      expect(result).toEqual({
        isLocal: false,
        host: "db.staging.internal",
      });
    });
  });
});
