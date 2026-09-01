import { describe, expect, it } from "vitest";
import { podeCriarSessaoEmAgenda } from "./gating";

// #512 · T09 (P1, #521, opção a) — só `coordenador` vê o gesto de criar
// sessão em `/agenda`, mesmo `admin_recepcao` tendo `requireAgendar` na
// camada de auth (fato A1 da spec — não muda).
describe("podeCriarSessaoEmAgenda — T09 (P1)", () => {
  it("coordenador pode", () => {
    expect(podeCriarSessaoEmAgenda("coordenador")).toBe(true);
  });

  it("admin_recepcao NÃO pode ver o gesto, apesar de requireAgendar concedê-lo na auth", () => {
    expect(podeCriarSessaoEmAgenda("admin_recepcao")).toBe(false);
  });

  it("terapeuta não pode", () => {
    expect(podeCriarSessaoEmAgenda("terapeuta")).toBe(false);
  });
});
