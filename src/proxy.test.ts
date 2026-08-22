import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { proxy, config } from "./proxy";
import { NOME_COOKIE_TOKEN } from "@/app/(auth)/redefinir-senha/cookie";

describe("src/proxy.ts — segurança e navegação", () => {
  describe("Filtro de métodos", () => {
    it("ignora métodos de mutação (POST) mesmo com query token", () => {
      const req = new NextRequest(
        "http://localhost:3000/redefinir-senha?token=xyz123",
        {
          method: "POST",
        },
      );
      const res = proxy(req);
      // Para POST, o proxy não redireciona e repassa adiante
      expect(res.headers.get("location")).toBeNull();
    });

    it("passa direto para requisições de webhook (POST) sem redirecionamento ou injeção de Link", () => {
      const req = new NextRequest("http://localhost:3000/api/webhooks/asaas", {
        method: "POST",
      });
      const res = proxy(req);
      expect(res.headers.get("location")).toBeNull();
      expect(res.headers.get("Link")).toBeNull();
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
    it("redireciona em GET /redefinir-senha com token na query e define cookie httpOnly com as opções de segurança corretas", () => {
      const req = new NextRequest(
        "http://localhost:3000/redefinir-senha?token=xyz123",
        {
          method: "GET",
        },
      );
      const res = proxy(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe(
        "http://localhost:3000/redefinir-senha",
      );

      // Propriedade de segurança central do middleware (finding C1, ver
      // src/app/(auth)/redefinir-senha/cookie.ts): o token só deixa de vazar via
      // Referer/analytics se o cookie for httpOnly. Valores literais e
      // independentes de cookie.ts — reusar as constantes exportadas de lá faria
      // teste e código errarem juntos numa mutação que alterasse o valor na fonte.
      expect(res.cookies.get(NOME_COOKIE_TOKEN)).toMatchObject({
        value: "xyz123",
        httpOnly: true,
        sameSite: "lax",
        path: "/redefinir-senha",
        maxAge: 15 * 60,
      });
    });

    it("não redireciona em GET /redefinir-senha sem token na query e não define o cookie", () => {
      const req = new NextRequest("http://localhost:3000/redefinir-senha", {
        method: "GET",
      });
      const res = proxy(req);
      // NextResponse.next() returns a generic response, no location header
      expect(res.headers.get("location")).toBeNull();
      expect(res.cookies.get(NOME_COOKIE_TOKEN)).toBeUndefined();
    });

    it("não redireciona em GET para outra rota mesmo com token na query e não define o cookie", () => {
      const req = new NextRequest(
        "http://localhost:3000/outra-rota?token=xyz123",
        {
          method: "GET",
        },
      );
      const res = proxy(req);
      expect(res.headers.get("location")).toBeNull();
      expect(res.cookies.get(NOME_COOKIE_TOKEN)).toBeUndefined();
    });
  });

  describe("Injeção de cabeçalhos Link", () => {
    it("injeta cabeçalho Link com os 5 rels de descoberta para agentes de IA em rotas normais (GET)", () => {
      const req = new NextRequest("http://localhost:3000/redefinir-senha", {
        method: "GET",
        headers: { accept: "text/markdown" },
      });
      const res = proxy(req);
      expect(res.status).toBe(200);
      const link = res.headers.get("Link");
      expect(link).toContain('</.well-known/api-catalog>; rel="api-catalog"');
      expect(link).toContain('</docs/api>; rel="service-doc"');
      expect(link).toContain('</auth.md>; rel="authorizing-agent"');
      expect(link).toContain(
        '</.well-known/mcp/server-card.json>; rel="mcp-server-card"',
      );
      expect(link).toContain(
        '</.well-known/agent-skills/index.json>; rel="agent-skills"',
      );
    });

    it("não injeta cabeçalho Link em rotas /_next alcançáveis pelo matcher (path sem ponto)", () => {
      const req = new NextRequest("http://localhost:3000/_next/webpack-hmr", {
        method: "GET",
      });
      const res = proxy(req);
      expect(res.headers.get("Link")).toBeNull();
    });

    it("não injeta cabeçalho Link em rotas /api (incluindo autenticação e webhooks)", () => {
      const rotasApi = ["/api/auth/session", "/api/webhooks/asaas"];
      for (const rota of rotasApi) {
        const req = new NextRequest(`http://localhost:3000${rota}`, {
          method: "GET",
        });
        const res = proxy(req);
        expect(
          res.headers.get("Link"),
          `Rota ${rota} não deve ter Link`,
        ).toBeNull();
      }
    });

    it("não injeta cabeçalho Link em rotas /.well-known", () => {
      const req = new NextRequest(
        "http://localhost:3000/.well-known/apple-app-site-association",
        {
          method: "GET",
        },
      );
      const res = proxy(req);
      expect(res.headers.get("Link")).toBeNull();
    });

    it("não injeta cabeçalho Link em arquivos estáticos com extensão (.) alcançáveis pelo matcher", () => {
      const req = new NextRequest("http://localhost:3000/robots.txt", {
        method: "GET",
      });
      const res = proxy(req);
      expect(res.headers.get("Link")).toBeNull();
    });
  });

  describe("Perímetro do matcher (config.matcher)", () => {
    function matchesProxyMatcher(pathname: string): boolean {
      return config.matcher.some((pattern) =>
        Boolean(getPathMatch(pattern)(pathname)),
      );
    }

    describe("Rotas que DEVEM ser interceptadas (entram no proxy/middleware)", () => {
      it("intercepta a rota crítica de segurança /redefinir-senha", () => {
        expect(matchesProxyMatcher("/redefinir-senha")).toBe(true);
      });

      it("intercepta páginas da aplicação e rotas de autenticação", () => {
        const rotasApp = [
          "/",
          "/login",
          "/cadastro",
          "/redefinir-senha",
          "/pacientes",
          "/pacientes/123",
          "/pacientes/123/anamnese",
          "/pacientes/123/tcc",
          "/clinica",
          "/agenda",
          "/supervisao",
          "/validacao",
          "/alertas-risco",
          "/pendencias",
        ];

        for (const rota of rotasApp) {
          expect(
            matchesProxyMatcher(rota),
            `Rota de aplicação '${rota}' deve entrar no proxy`,
          ).toBe(true);
        }
      });

      it("intercepta rotas de API e webhooks para processamento pelo runtime", () => {
        const rotasApi = [
          "/api/auth/session",
          "/api/auth/sign-in",
          "/api/auth/callback/credentials",
          "/api/webhooks/asaas",
          "/api/health",
        ];

        for (const rota of rotasApi) {
          expect(
            matchesProxyMatcher(rota),
            `Rota de API/Webhook '${rota}' deve entrar no proxy`,
          ).toBe(true);
        }
      });

      it("intercepta arquivos de descoberta de agentes e metadados na raiz", () => {
        const rotasDescoberta = [
          "/robots.txt",
          "/sitemap.xml",
          "/.well-known/api-catalog",
          "/.well-known/mcp/server-card.json",
          "/.well-known/agent-skills/index.json",
          "/.well-known/apple-app-site-association",
          "/auth.md",
          "/docs/api",
        ];

        for (const rota of rotasDescoberta) {
          expect(
            matchesProxyMatcher(rota),
            `Rota de descoberta '${rota}' deve entrar no proxy`,
          ).toBe(true);
        }
      });
    });

    describe("Rotas que DEVEM passar direto (filtradas antes do proxy)", () => {
      it("ignora assets estáticos internos do Next.js (_next/static e _next/image)", () => {
        const rotasEstaticasNext = [
          "/_next/static/chunks/main.js",
          "/_next/static/chunks/app.js",
          "/_next/static/css/styles.css",
          "/_next/static/media/inter.woff2",
          "/_next/image",
        ];

        for (const rota of rotasEstaticasNext) {
          expect(
            matchesProxyMatcher(rota),
            `Asset estático '${rota}' não deve entrar no proxy`,
          ).toBe(false);
        }
      });

      it("ignora favicon e assets estáticos de marca (/brand/*)", () => {
        const rotasMarcaEFavicon = [
          "/favicon.ico",
          "/brand/logo.svg",
          "/brand/icons/apple-touch-icon.png",
          "/brand/manifest.json",
          "/brand/splash.png",
        ];

        for (const rota of rotasMarcaEFavicon) {
          expect(
            matchesProxyMatcher(rota),
            `Asset de marca/favicon '${rota}' não deve entrar no proxy`,
          ).toBe(false);
        }
      });
    });
  });
});
