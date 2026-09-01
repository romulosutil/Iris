import type { ReactElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// #512 · T13 — `AgendaViewCliente` importa (via `CheckInButton`/`GerirSessao`/
// `AppointmentModal`) `./actions` ("use server"), que puxa
// `getTenantContext` → `@/db/client` (abre conexão Postgres no load). Mesmo
// padrão de `a11y.test.tsx`: neutraliza server-only e o client de banco —
// nenhuma action é de fato invocada neste teste.
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

// `SemanaCliente` faz sua própria leitura reativa via Server Actions
// (`carregarSemanaAction` etc.) — fora do escopo deste teste, que só precisa
// verificar QUE props de gating o toggle repassa a ela.
vi.mock("./semana/semana-cliente", () => ({
  SemanaCliente: (props: { podeCriarSessao: boolean }) => (
    <div data-testid="semana-cliente">
      pode-criar:{String(props.podeCriarSessao)}
    </div>
  ),
}));

const { AgendaViewCliente } = await import("./agenda-view-cliente");

afterEach(cleanup);

const escalaProps = {
  hojeISO: "2026-09-01",
  semanaInicialISO: "2026-08-31",
  disciplinas: ["psicologia"],
  duracaoPadrao: { psicologia: 50 },
};

const sessaoFalta = {
  id: "00000000-0000-0000-0000-000000000000",
  agendadaPara: new Date("2026-09-01T12:00:00-03:00"),
  estado: "falta_paciente" as const,
  terapeutaId: "t1",
  terapeutaNome: "Dra. Sofia",
  pacienteNome: "Paciente P",
  patientId: "p1",
  disciplina: "psicologia",
  checkInEm: null,
};

function montar(ui: ReactElement) {
  return render(ui);
}

test("admin_recepcao: vê as duas escalas, mas sem gesto de criação na Semana", async () => {
  const user = userEvent.setup();
  montar(
    <AgendaViewCliente
      sessoes={[]}
      terapeutas={[{ id: "t1", nome: "Dra. Sofia" }]}
      role="admin_recepcao"
      userId="u1"
      podeGerir
      diaExtenso="segunda-feira, 01 de setembro"
      diaISO="2026-09-01"
      ehHoje
      fuso="America/Sao_Paulo"
      {...escalaProps}
    />,
  );

  // As duas opções da escala existem para quem chega em `/agenda`.
  expect(screen.getByRole("button", { name: "Dia" })).toBeTruthy();
  const botaoSemana = screen.getByRole("button", { name: "Semana" });
  await user.click(botaoSemana);

  const semana = screen.getByTestId("semana-cliente");
  expect(semana.textContent).toBe("pode-criar:false");
});

test("admin_recepcao: 'Repor' (gesto de criação) não aparece na escala Dia", () => {
  montar(
    <AgendaViewCliente
      sessoes={[sessaoFalta]}
      terapeutas={[{ id: "t1", nome: "Dra. Sofia" }]}
      role="admin_recepcao"
      userId="u1"
      podeGerir
      diaExtenso="segunda-feira, 01 de setembro"
      diaISO="2026-09-01"
      ehHoje
      visaoInicial="horario"
      fuso="America/Sao_Paulo"
      {...escalaProps}
    />,
  );

  expect(screen.queryByRole("link", { name: "Repor" })).toBeNull();
});

test("coordenador: vê criação nas duas escalas (Semana e 'Repor' na Dia)", async () => {
  const user = userEvent.setup();
  montar(
    <AgendaViewCliente
      sessoes={[sessaoFalta]}
      terapeutas={[{ id: "t1", nome: "Dra. Sofia" }]}
      role="coordenador"
      userId="u1"
      podeGerir
      diaExtenso="segunda-feira, 01 de setembro"
      diaISO="2026-09-01"
      ehHoje
      visaoInicial="horario"
      fuso="America/Sao_Paulo"
      {...escalaProps}
    />,
  );

  // Gesto de criação na escala Dia ("Repor" em falta).
  expect(screen.getByRole("link", { name: "Repor" })).toBeTruthy();

  // Gesto de criação repassado para a escala Semana.
  const botaoSemana = screen.getByRole("button", { name: "Semana" });
  await user.click(botaoSemana);
  const semana = screen.getByTestId("semana-cliente");
  expect(semana.textContent).toBe("pode-criar:true");
});
