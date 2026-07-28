import type { ReactElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { EmergenciaForm } from "./emergencia-form";
import type { ConfigEmergencia, UsuarioDaClinica } from "./logic";

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));
vi.mock("./actions", () => ({
  salvarEmergenciaAction: vi.fn(async () => ({})),
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

const USUARIOS: UsuarioDaClinica[] = [
  { id: "11111111-1111-4111-8111-111111111111", nome: "Ana Coordenadora", papel: "coordenador" },
  { id: "22222222-2222-4222-8222-222222222222", nome: "Bruno Terapeuta", papel: "terapeuta" },
  { id: "33333333-3333-4333-8333-333333333333", nome: "Carla Recepção", papel: "admin_recepcao" },
];

const VAZIA: ConfigEmergencia = {
  responsavelTecnicoId: null,
  protocoloInterno: null,
  declaradoEm: null,
  declaradoPorNome: null,
};

const PREENCHIDA: ConfigEmergencia = {
  responsavelTecnicoId: USUARIOS[0]!.id,
  protocoloInterno: "1. Acionar a coordenadora de plantão.\n2. Ligar para o RT.",
  declaradoEm: "2026-07-20T13:45:00.000Z",
  declaradoPorNome: "Ana Coordenadora",
};

test("EmergenciaForm — sem violações axe (clínica ainda não configurada)", async () => {
  await semViolacoes(<EmergenciaForm config={VAZIA} usuarios={USUARIOS} />);
}, 15000);

test("EmergenciaForm — sem violações axe (declaração já registrada)", async () => {
  await semViolacoes(<EmergenciaForm config={PREENCHIDA} usuarios={USUARIOS} />);
}, 15000);
