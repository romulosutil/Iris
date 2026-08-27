import type { ReactElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { PerfilForm } from "./perfil-form";
import type { PerfilProfissional } from "./logic";

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));
vi.mock("./actions", () => ({
  declararEPsiAction: vi.fn(async () => ({})),
}));

afterEach(cleanup);

async function semViolacoes(ui: ReactElement) {
  const { container } = render(ui);
  const resultado = await axe.run(container, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
    },
    rules: {
      region: { enabled: false },
      "landmark-one-main": { enabled: false },
      "page-has-heading-one": { enabled: false },
      // axe sob jsdom não computa contraste real — a conferência de cor é do
      // Design System, não deste teste.
      "color-contrast": { enabled: false },
    },
  });
  expect(resultado.violations).toEqual([]);
}

const BASE: PerfilProfissional = {
  nome: "Ana Psicóloga",
  email: "ana@clinica.test",
  conselho: "crp",
  registroNumero: "123456",
  registroUf: "SP",
  ePsiVerified: false,
  ePsiNumber: null,
  ePsiDeclaradoEm: null,
};

test("formulário sem declaração não tem violação de acessibilidade", async () => {
  await semViolacoes(<PerfilForm perfil={BASE} />);
});

test("formulário com declaração registrada não tem violação", async () => {
  await semViolacoes(
    <PerfilForm
      perfil={{
        ...BASE,
        ePsiVerified: true,
        ePsiNumber: "06/123456",
        ePsiDeclaradoEm: "2026-08-26T12:00:00.000Z",
      }}
    />,
  );
});

test("o campo do número tem rótulo associado, não só placeholder", () => {
  render(<PerfilForm perfil={BASE} />);
  // Placeholder não é rótulo: some ao digitar e nem todo leitor de tela anuncia.
  expect(
    screen.getByLabelText(/número do cadastro no e-Psi/i),
  ).toBeInstanceOf(HTMLInputElement);
});

test("a declaração é uma caixa de seleção operável, com o texto da norma", () => {
  render(<PerfilForm perfil={BASE} />);
  const caixa = screen.getByRole("checkbox", {
    name: /cadastro ativo na plataforma e-Psi/i,
  });
  expect(caixa).toBeTruthy();
  expect(caixa.getAttribute("aria-checked")).toBe("false");
});

test("a tela não promete verificação que o Iris não faz", () => {
  const { container } = render(<PerfilForm perfil={BASE} />);
  // Copy é barreira jurídica aqui: o produto NÃO consulta a base do CFP, e
  // dizer o contrário vira prova documental contra o operador.
  //
  // A asserção é sobre o texto RENDERIZADO inteiro, não sobre um nó: a frase
  // atravessa um `<strong>` ("não"), e `getByText` casa nó a nó — passaria a
  // falhar por formatação, não por conteúdo.
  const texto = container.textContent?.replace(/\s+/g, " ") ?? "";
  expect(texto).toContain("não consulta a base do CFP");
  expect(texto).toContain("não verifica o número informado");
  expect(texto).toContain("Nenhuma função do Iris é liberada ou bloqueada");
});

test("o registro do conselho aparece formatado a partir do cadastro", () => {
  render(<PerfilForm perfil={BASE} />);
  expect(screen.getByText("CRP SP 123456")).toBeTruthy();
});

test("cadastro sem conselho não inventa registro", () => {
  render(
    <PerfilForm
      perfil={{ ...BASE, conselho: null, registroNumero: null, registroUf: null }}
    />,
  );
  expect(screen.getByText("Não informado no cadastro")).toBeTruthy();
});
