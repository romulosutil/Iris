import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import { NOME_COOKIE_TOKEN } from "@/app/(auth)/redefinir-senha/cookie";

describe("src/proxy.ts — segurança e navegação", () => {
  describe("Filtro de métodos", () => {
    it("ignora métodos de mutação (POST) mesmo com query token", () => {
      const req = new NextRequest("http://localhost:3000/redefinir-senha?token=xyz123", {
        method: "POST",
      });
      const res = proxy(req);
      // Para POST, o proxy não redireciona e repassa adiante
      expect(res.headers.get("location")).toBeNull();
    });

    it("processa métodos de leitura (HEAD)", () => {
      const req = new NextRequest("http://localhost:3000/redefinir-senha", {
        method: "HEAD",
      });
      const res = proxy(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("Link")).not.toBeNull();
    });
  });

  describe("Interceptação de /redefinir-senha", () => {
    it("redireciona em GET /redefinir-senha com token na query e define cookie", () => {
      const req = new NextRequest("http://localhost:3000/redefinir-senha?token=xyz123", {
        method: "GET",
      });
      const res = proxy(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost:3000/redefinir-senha");

      const cookies = res.cookies.get(NOME_COOKIE_TOKEN);
      expect(cookies?.value).toBe("xyz123");
    });

    it("não redireciona em GET /redefinir-senha sem token na query", () => {
      const req = new NextRequest("http://localhost:3000/redefinir-senha", {
        method: "GET",
      });
      const res = proxy(req);
      // NextResponse.next() returns a generic response, no location header
      expect(res.headers.get("location")).toBeNull();
    });

    it("não redireciona em GET para outra rota mesmo com token na query", () => {
      const req = new NextRequest("http://localhost:3000/outra-rota?token=xyz123", {
        method: "GET",
      });
      const res = proxy(req);
      expect(res.headers.get("location")).toBeNull();
    });
  });

  describe("Injeção de cabeçalhos Link", () => {
    it("utiliza append para o header Link sem sobrescrever headers nativos existentes em rotas normais", () => {
      const req = new NextRequest("http://localhost:3000/redefinir-senha", {
        method: "GET",
        headers: { accept: "text/markdown" },
      });
      const res = proxy(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("Link")).toContain("api-catalog");
    });

    it("não injeta cabeçalho Link em rotas /_next", () => {
      const req = new NextRequest("http://localhost:3000/_next/static/css/app.css", {
        method: "GET",
      });
      const res = proxy(req);
      expect(res.headers.get("Link")).toBeNull();
    });

    it("não injeta cabeçalho Link em rotas /api", () => {
      const req = new NextRequest("http://localhost:3000/api/auth/session", {
        method: "GET",
      });
      const res = proxy(req);
      expect(res.headers.get("Link")).toBeNull();
    });

    it("não injeta cabeçalho Link em rotas /.well-known", () => {
      const req = new NextRequest("http://localhost:3000/.well-known/apple-app-site-association", {
        method: "GET",
      });
      const res = proxy(req);
      expect(res.headers.get("Link")).toBeNull();
    });

    it("não injeta cabeçalho Link em arquivos estáticos com extensão (.)", () => {
      const req = new NextRequest("http://localhost:3000/favicon.ico", {
        method: "GET",
      });
      const res = proxy(req);
      expect(res.headers.get("Link")).toBeNull();
    });
  });
});
