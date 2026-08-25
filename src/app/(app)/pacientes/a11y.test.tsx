import axe from "axe-core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { ReactElement } from "react";
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));

// `PacienteLayout` passou a ler `patient.clinicalModality` dentro de
// `withTenant` (#305) para esconder a aba "PEI & Metas" no modo convencional.
// O dublê de `@/db/client` acima é um objeto vazio — sem este mock, `withTenant`
// chama `db.transaction` e o teste morre com TypeError antes de renderizar
// qualquer coisa (não é falha de acessibilidade, é ausência de dublê).
vi.mock("@/db/rls", () => ({
  withTenant: async (
    _ctx: unknown,
    fn: (tx: unknown) => Promise<unknown>,
  ): Promise<unknown> =>
    fn({
      select: () => ({
        from: () => ({
          where: async () => [{ clinicalModality: "protocol_driven" }],
        }),
      }),
    }),
}));

const mockObterSituacaoConta = vi.fn();

vi.mock("@/auth/tenant", () => ({
  getTenantContext: async () => ({
    clinicId: "c1",
    userId: "u1",
    role: "coordenador",
  }),
}));

vi.mock("../queries", () => ({
  obterSituacaoConta: (...args: unknown[]) => mockObterSituacaoConta(...args),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/pacientes/p1",
}));

afterEach(() => {
  cleanup();
  mockObterSituacaoConta.mockReset();
});

async function semViolacoes(ui: ReactElement) {
  const { container } = render(ui);
  const r = await axe.run(container, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
    },
    rules: {
      region: { enabled: false },
      "landmark-one-main": { enabled: false },
      "page-has-heading-one": { enabled: false },
      "color-contrast": { enabled: false },
    },
  });
  expect(r.violations).toEqual([]);
}

test("lista de pacientes sem violações", async () => {
  const { ListaPacientes } = await import("./lista-pacientes");
  await semViolacoes(
    <ListaPacientes
      pacientes={[
        {
          id: "p1",
          nome: "Lucas Silva",
          nascimento: "2018-05-12",
          responsavelContato: "Maria Silva",
          escola: "Escola ABC",
          convenio: "Unimed",
          criadoEm: new Date(),
          temPrescricao: true,
          arquivadoEm: null,
        },
        // Segundo paciente SEM prescrição: o selo `Sem prescrição` (#203) só é
        // renderizado neste ramo, e um fixture só com o caso feliz deixaria o
        // contraste e o texto do selo fora da varredura do axe.
        {
          id: "p2",
          nome: "Ana Pereira",
          nascimento: "2019-02-01",
          responsavelContato: "João Pereira",
          escola: "Escola XYZ",
          convenio: "Bradesco",
          criadoEm: new Date(),
          temPrescricao: false,
          arquivadoEm: null,
        },
        // Terceiro paciente ARQUIVADO (#174): o selo "Arquivado" é outro ramo
        // do mesmo lugar onde antes ficava um "Ativo" hardcoded para todo
        // mundo. Sem fixture arquivado, esse ramo nunca entra na varredura.
        {
          id: "p3",
          nome: "Carlos Mendes",
          nascimento: "2017-11-30",
          responsavelContato: "Sonia Mendes",
          escola: "Escola DEF",
          convenio: null,
          criadoEm: new Date(),
          temPrescricao: true,
          arquivadoEm: new Date("2026-06-01T12:00:00Z"),
        },
      ]}
    />,
  );
});

test("avisos de arquivamento sem violações", async () => {
  const { AvisosArquivamento } = await import("./[id]/avisos-arquivamento");
  await semViolacoes(
    <AvisosArquivamento
      desarquivadoAutomaticamenteEm={new Date("2026-07-20T10:00:00Z")}
      avisoPrevioEm={new Date("2026-07-28T10:00:00Z")}
    />,
  );
});

test("diálogo de arquivamento aberto sem violações", async () => {
  const user = userEvent.setup();
  const { ArquivamentoDialog } = await import("./[id]/arquivamento-dialog");
  const { container } = render(
    <ArquivamentoDialog patientId="p1" arquivado={false} />,
  );
  // O conteúdo do Dialog vive num portal fora do `container`: varrer só o
  // container acusaria zero violação sobre um formulário que nem foi montado.
  await user.click(screen.getByRole("button", { name: "Arquivar paciente" }));
  await screen.findByRole("dialog");

  const r = await axe.run(document.body, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
    },
    rules: {
      region: { enabled: false },
      "landmark-one-main": { enabled: false },
      "page-has-heading-one": { enabled: false },
      "color-contrast": { enabled: false },
    },
  });
  expect(r.violations).toEqual([]);
  expect(container).toBeTruthy();
  // Timeout explícito: a varredura do axe sobre o portal aberto passa de 5s
  // (o padrão) quando a suíte inteira roda em paralelo, e o teste falhava por
  // relógio, não por violação. Aumentar aqui em vez de globalmente mantém o
  // padrão apertado para o resto da suíte.
}, 30_000);

test("diálogo de alta clínica aberto sem violações", async () => {
  const user = userEvent.setup();
  const { AltaDialog } = await import("./[id]/alta-dialog");
  const { container } = render(<AltaDialog patientId="p1" comAlta={false} />);
  // Mesmo cuidado do diálogo de arquivamento: o conteúdo vive num portal fora
  // do `container`. Este caso cobre o campo `type="date"`, que o de
  // arquivamento não tem.
  await user.click(
    screen.getByRole("button", { name: "Registrar alta clínica" }),
  );
  await screen.findByRole("dialog");

  const r = await axe.run(document.body, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
    },
    rules: {
      region: { enabled: false },
      "landmark-one-main": { enabled: false },
      "page-has-heading-one": { enabled: false },
      "color-contrast": { enabled: false },
    },
  });
  expect(r.violations).toEqual([]);
  expect(container).toBeTruthy();
}, 30_000);

test("layout do paciente com indicador de segurança e sem violações", async () => {
  const { default: PacienteLayout } = await import("./[id]/layout");
  mockObterSituacaoConta.mockResolvedValue({
    estado: "ativa",
    podeEscrever: true,
    podeCadastrarPaciente: true,
    diasRestantesTrial: null,
    statusAssinatura: "active",
  });

  const jsx = await PacienteLayout({
    children: <div data-testid="child">Conteúdo do Prontuário</div>,
    params: Promise.resolve({ id: "p1" }),
  });

  const user = userEvent.setup();
  const { container } = render(jsx);

  // Verifica que o indicador "Dados Criptografados (RLS Ativo)" é exibido
  expect(screen.getByText(/Dados Criptografados \(RLS Ativo\)/i)).toBeDefined();

  // Verifica se o conteúdo do prontuário (children) é renderizado
  expect(screen.getByTestId("child")).toBeDefined();

  // O gatilho do tooltip é o selo focalizável. `aria-label` em `<span>` sem
  // role é proibido pela ARIA (o leitor de tela descarta), então o nome
  // acessível TEM de vir do texto visível.
  const selo = container.querySelector<HTMLElement>('[tabindex="0"]');
  expect(selo).not.toBeNull();
  expect(selo?.getAttribute("aria-label")).toBeNull();
  expect(selo?.textContent).toContain("Dados Criptografados (RLS Ativo)");

  // O `aria-describedby` do gatilho precisa resolver JÁ no estado de repouso —
  // apontar para id inexistente é descrição que nunca chega.
  const idDescricao = selo?.getAttribute("aria-describedby");
  expect(idDescricao).toBeTruthy();
  const bolha = document.getElementById(idDescricao as string);
  expect(bolha).not.toBeNull();
  expect(bolha?.textContent).toContain("equipe autorizada desta clínica");

  // Foco abre a bolha (WCAG 1.4.13: o conteúdo tem de existir sem ponteiro).
  expect(screen.queryByRole("tooltip")).toBeNull();
  selo?.focus();
  await screen.findByRole("tooltip");

  // Varredura de acessibilidade com axe — com a bolha aberta, porque o
  // conteúdo do tooltip só é exposto nesse estado.
  const r = await axe.run(container, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
    },
    rules: {
      region: { enabled: false },
      "landmark-one-main": { enabled: false },
      "page-has-heading-one": { enabled: false },
      "color-contrast": { enabled: false },
    },
  });
  expect(r.violations).toEqual([]);
  // `violations` sozinho é verde falso aqui: as duas falhas reais deste selo
  // (aria-label proibido e describedby pendurado) caem em `incomplete`, que a
  // asserção padrão da suíte não olha.
  expect(
    r.incomplete
      .map((i) => i.id)
      .filter(
        (id) => id === "aria-prohibited-attr" || id === "aria-valid-attr-value",
      ),
  ).toEqual([]);

  // Esc dispensa a bolha sem tirar o foco do gatilho (1.4.13, "Dismissible").
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  expect(document.activeElement).toBe(selo);
});
