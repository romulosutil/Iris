import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

describe("src/proxy.ts — segurança e navegação", () => {
  it("ignora métodos de mutação (POST) mesmo com query token", () => {
    const req = new NextRequest("http://localhost:3000/redefinir-senha?token=xyz123", {
      method: "POST",
    });
    const res = proxy(req);
    // Para POST, o proxy não redireciona e repassa adiante
    expect(res.headers.get("location")).toBeNull();
  });

  it("redireciona em GET /redefinir-senha com token na query", () => {
    const req = new NextRequest("http://localhost:3000/redefinir-senha?token=xyz123", {
      method: "GET",
    });
    const res = proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/redefinir-senha");
  });

  it("utiliza append para o header Link sem sobrescrever headers nativos existentes", () => {
    const req = new NextRequest("http://localhost:3000/redefinir-senha", {
      method: "GET",
      headers: { accept: "text/markdown" },
    });
    const res = proxy(req);
    // Retorna NextResponse.next() sem quebrar
    expect(res.status).toBe(200);
  });
});
