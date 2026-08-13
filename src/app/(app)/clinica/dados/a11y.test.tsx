import type { ReactElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { FormularioDadosClinica } from "./formulario-dados-clinica";
import type { DadosClinica } from "./logic";

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));
vi.mock("./actions", () => ({
  salvarDadosClinicaAction: vi.fn(async () => ({})),
}));

afterEach(cleanup);

async function semViolacoes(ui: ReactElement) {
  const { container } = render(ui);
  const resultado = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: {
      region: { enabled: false },
      "landmark-one-main": { enabled: false },
      "page-has-heading-one": { enabled: false },
      "color-contrast": { enabled: false },
    },
  });
  expect(resultado.violations).toEqual([]);
}

const VAZIO: DadosClinica = {
  nome: "Clínica Espectro",
  razaoSocial: null,
  cpfCnpj: null,
  logradouro: null,
  numero: null,
  complemento: null,
  bairro: null,
  cidade: null,
  uf: null,
  cep: null,
  emailFinanceiro: null,
  documentoTravado: false,
};

const PREENCHIDO: DadosClinica = {
  nome: "Clínica Espectro",
  razaoSocial: "Clínica Espectro Ltda",
  cpfCnpj: "12345678000190",
  logradouro: "Rua das Araucárias",
  numero: "120",
  complemento: "Sala 4",
  bairro: "Centro",
  cidade: "Curitiba",
  uf: "PR",
  cep: "80010000",
  emailFinanceiro: "financeiro@clinica.com.br",
  documentoTravado: true,
};

test("FormularioDadosClinica — sem violações axe (cadastro vazio)", async () => {
  await semViolacoes(
    <FormularioDadosClinica dados={VAZIO} documentoTravado={false} />,
  );
}, 15000);

test("FormularioDadosClinica — sem violações axe (documento travado)", async () => {
  await semViolacoes(
    <FormularioDadosClinica dados={PREENCHIDO} documentoTravado={true} />,
  );
}, 15000);
