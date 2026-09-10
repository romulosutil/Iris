import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PacienteLayout from "./layout";
import { getTenantContext } from "@/auth/tenant";
import { obterFatosProntidao } from "@/lib/patient/prontidao-queries";

// Mock das dependências de tenant e billing
vi.mock("next/navigation", () => ({
  usePathname: vi.fn().mockReturnValue("/pacientes/pac_1"),
  useRouter: vi.fn().mockReturnValue({ refresh: vi.fn() }),
}));

vi.mock("@/auth/tenant", () => ({
  getTenantContext: vi.fn().mockResolvedValue({
    tenantId: "tenant_1",
    clinicId: "clinic_1",
    userId: "user_1",
    role: "terapeuta",
  }),
}));

vi.mock("@/lib/patient/prontidao-queries", () => ({
  // Task 7c — a porta devolve `{ fatos, modalidade }`, não os fatos soltos.
  obterFatosProntidao: vi.fn(async () => ({
    fatos: {
      temFichaClinica: false,
      temAnamnese: false,
      temProtocoloAtivo: false,
      temMetaAtiva: false,
      temInstrumentoAplicado: false,
      temSessaoConsolidada: false,
    },
    modalidade: null,
  })),
}));

// D65 — a barra de ciclo de vida renderiza `AltaDialog`/`ArquivamentoDialog`,
// que importam `./actions` (`"use server"`, puxa cookies e banco). Só os
// gatilhos interessam aqui; o contrato diálogo↔action tem teste próprio
// (`alta-dialog.test.tsx`) e a gravação, `alta.int.test.ts`.
vi.mock("./actions", () => ({
  registrarAltaAction: vi.fn(),
  desfazerAltaAction: vi.fn(),
  arquivarPacienteAction: vi.fn(),
  desarquivarPacienteAction: vi.fn(),
}));

vi.mock("../../queries", () => ({
  obterSituacaoConta: vi.fn().mockResolvedValue({
    podeEscrever: true,
    estado: "ativa",
  }),
}));

const mockWithTenant = vi.fn();
vi.mock("@/db/rls", () => ({
  withTenant: (...args: unknown[]) => mockWithTenant(...args),
}));

vi.mock("@/db/schema", () => ({
  patient: {
    id: "id",
    clinicalModality: "clinicalModality",
    arquivadoEm: "arquivadoEm",
    altaEm: "altaEm",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

/** D65 — linha do paciente com estado de ciclo de vida explícito. */
function mockPaciente(linha: {
  clinicalModality: string;
  altaEm?: string | null;
  arquivadoEm?: Date | null;
}) {
  mockWithTenant.mockImplementation(async (_ctx, fn) => {
    const mockTx = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([
        {
          clinicalModality: linha.clinicalModality,
          altaEm: linha.altaEm ?? null,
          arquivadoEm: linha.arquivadoEm ?? null,
        },
      ]),
    };
    return fn(mockTx);
  });
}

function mockModalidade(clinicalModality: string) {
  mockWithTenant.mockImplementation(async (_ctx, fn) => {
    const mockTx = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ clinicalModality }]),
    };
    return fn(mockTx);
  });
}

describe("PacienteLayout - Abas do Prontuário", () => {
  it("exibe PEI & Metas e Anamnese para paciente na modalidade protocol_driven", async () => {
    mockModalidade("protocol_driven");

    const LayoutComponent = await PacienteLayout({
      children: <div data-testid="child-content">Conteúdo</div>,
      params: Promise.resolve({ id: "pac_1" }),
    });

    render(LayoutComponent);

    expect(screen.getByText("Evolução")).not.toBeNull();
    expect(screen.getByText("Anamnese")).not.toBeNull();
    const linkAnamnese = screen.getByRole("link", { name: "Anamnese" });
    expect(linkAnamnese.getAttribute("href")).toBe("/pacientes/pac_1/anamnese");
    expect(screen.getByText("PEI & Metas")).not.toBeNull();
    expect(screen.queryByText("TCC")).toBeNull();
    expect(screen.queryByText("Temas")).toBeNull();
  });

  it("exibe só TCC para paciente na modalidade cognitive_behavioral, SEM Anamnese", async () => {
    mockModalidade("cognitive_behavioral");

    const LayoutComponent = await PacienteLayout({
      children: <div data-testid="child-content">Conteúdo</div>,
      params: Promise.resolve({ id: "pac_2" }),
    });

    render(LayoutComponent);

    expect(screen.getByText("Evolução")).not.toBeNull();
    expect(screen.getByText("TCC")).not.toBeNull();
    expect(screen.queryByText("Anamnese")).toBeNull();
    expect(screen.queryByText("PEI & Metas")).toBeNull();
    expect(screen.queryByText("Temas")).toBeNull();
  });

  it("exibe só Temas para paciente na modalidade conventional, SEM a aba Evolução e SEM Anamnese", async () => {
    mockModalidade("conventional");

    const LayoutComponent = await PacienteLayout({
      children: <div data-testid="child-content">Conteúdo</div>,
      params: Promise.resolve({ id: "pac_3" }),
    });

    render(LayoutComponent);

    // A aba "Evolução" some aqui de propósito: `page.tsx` redireciona
    // `conventional` para `Temas`, e uma aba que só redireciona mente sobre
    // ter conteúdo próprio. O acompanhamento desse modo é narrativo — o
    // hexágono de eixos VB-MAPP que a Evolução renderiza descreve outra
    // clínica, não a dele.
    expect(screen.queryByText("Evolução")).toBeNull();
    expect(screen.getByText("Temas")).not.toBeNull();
    expect(screen.queryByText("Anamnese")).toBeNull();
    expect(screen.queryByText("PEI & Metas")).toBeNull();
    expect(screen.queryByText("TCC")).toBeNull();
  });

  it("mantém a aba Evolução quando a modalidade não resolve (paciente fora da RLS), SEM Anamnese", async () => {
    // Sem esta garantia, um paciente sem linha visível ficaria com o
    // prontuário sem porta de entrada: nenhuma aba central E nenhuma Evolução.
    mockWithTenant.mockImplementation(async (_ctx, fn) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
      return fn(mockTx);
    });

    const LayoutComponent = await PacienteLayout({
      children: <div data-testid="child-content">Conteúdo</div>,
      params: Promise.resolve({ id: "pac_4" }),
    });

    render(LayoutComponent);

    expect(screen.getByText("Evolução")).not.toBeNull();
    expect(screen.queryByText("Anamnese")).toBeNull();
    expect(screen.queryByText("PEI & Metas")).toBeNull();
    expect(screen.queryByText("TCC")).toBeNull();
    expect(screen.queryByText("Temas")).toBeNull();
  });

  it("mostra a escada de prontidão no topo do prontuário", async () => {
    mockModalidade("protocol_driven");
    vi.mocked(getTenantContext).mockResolvedValueOnce({
      clinicId: "clinic_1",
      userId: "user_1",
      role: "coordenador",
    });

    const LayoutComponent = await PacienteLayout({
      children: <div data-testid="child-content">Conteúdo</div>,
      params: Promise.resolve({ id: "pac_1" }),
    });

    render(LayoutComponent);

    expect(
      screen.getByText(/para este prontuário gerar dados/i),
    ).not.toBeNull();
    // Gesto primário DO COORDENADOR: ele é `papelQueResolve` do primeiro
    // degrau pendente (`ficha_clinica`), então o cartão dá o botão. Afirmar só
    // "o cartão renderizou" deixaria passar a troca do botão pelo texto de
    // espera — que é exatamente a diferença entre os papéis.
    const gesto = screen.getByTestId("gesto-primario");
    expect(gesto.textContent).toContain("Preencher a ficha clínica");
    expect(gesto.getAttribute("href")).toBe(
      "/pacientes/pac_1/cadastro-clinico",
    );
  });

  // ── Os dois terapeutas (spec §6: 4 papéis × gesto primário) ──────────────
  // A #512 passou com 31 testes verdes na action e ZERO na rota: o defeito
  // atravessou pelo buraco de "a matriz da função pura já cobre". Cobre a
  // função; não cobre QUAL papel o `ctx` da rota entrega ao cartão.

  it("terapeuta NA equipe: cartão sem botão, gesto delegado à coordenação", async () => {
    mockModalidade("protocol_driven");
    // `role: "terapeuta"` é o padrão do mock de `getTenantContext`; explícito
    // aqui para o caso não depender da ordem dos testes.
    vi.mocked(getTenantContext).mockResolvedValueOnce({
      clinicId: "clinic_1",
      userId: "user_1",
      role: "terapeuta",
    });

    const LayoutComponent = await PacienteLayout({
      children: <div data-testid="child-content">Conteúdo</div>,
      params: Promise.resolve({ id: "pac_1" }),
    });

    render(LayoutComponent);

    expect(
      screen.getByText(/para este prontuário gerar dados/i),
    ).not.toBeNull();
    // Nenhum botão morto: `ficha_clinica.papelQueResolve === "coordenador"`,
    // então `montarProntidao` zera a `rota` para o terapeuta e o cartão troca
    // o `Button` pelo texto de espera. Um link aqui levaria ao `notFound()`
    // do `requireRole` do destino.
    expect(screen.queryByTestId("gesto-primario")).toBeNull();
    expect(
      screen.getByText(/Aguardando Coordenação: Preencher a ficha clínica/),
    ).not.toBeNull();
  });

  it("terapeuta FORA da equipe (cobertura): lê os fatos e NÃO finge bloqueado", async () => {
    // D-A10 ratificado pela opção (b) — o definer `app_fatos_prontidao`
    // (`0149`) espelha `goal_select` MAIS o recorte de cobertura. O terapeuta
    // de cobertura enxerga os MESMOS fatos que o coordenador enxerga.
    //
    // Sob a régua descartada ("está na equipe de cuidado"), os seis `EXISTS`
    // voltariam `false` para linhas que EXISTEM e este prontuário — completo —
    // apareceria BLOQUEADO só para ele: bloqueio funcional novo, gerado por uma
    // regra que não é sobre esse papel. É a metade simétrica da §4a: o cartão
    // não pode fingir pronto, e também não pode fingir bloqueado.
    mockModalidade("protocol_driven");
    vi.mocked(obterFatosProntidao).mockClear();
    vi.mocked(obterFatosProntidao).mockResolvedValueOnce({
      fatos: {
        temFichaClinica: true,
        temAnamnese: true,
        temProtocoloAtivo: true,
        temMetaAtiva: true,
        temInstrumentoAplicado: false,
        temSessaoConsolidada: true,
      },
      modalidade: "protocol_driven",
    });
    vi.mocked(getTenantContext).mockResolvedValueOnce({
      clinicId: "clinic_1",
      userId: "user_cobertura",
      role: "terapeuta",
    });

    const LayoutComponent = await PacienteLayout({
      children: <div data-testid="child-content">Conteúdo</div>,
      params: Promise.resolve({ id: "pac_1" }),
    });

    render(LayoutComponent);

    // Ele NÃO é barrado como a recepção: a leitura acontece.
    expect(obterFatosProntidao).toHaveBeenCalledTimes(1);
    // Escada cumprida (`proximo === null`) ⇒ o cartão some inteiro. Nenhum
    // gesto primário, e — o ponto de D-A10 — nenhuma espera fabricada.
    expect(screen.queryByText(/para este prontuário gerar dados/i)).toBeNull();
    expect(screen.queryByTestId("gesto-primario")).toBeNull();
    expect(screen.queryByText(/Aguardando/)).toBeNull();
    // A casca do prontuário continua de pé para ele.
    expect(screen.getByTestId("child-content")).not.toBeNull();
  });

  it("não consulta os fatos para a recepção", async () => {
    // Limpa o histórico de chamadas: os testes anteriores usam o papel
    // padrão "terapeuta" do mock de `getTenantContext`, que TAMBÉM aciona
    // `obterFatosProntidao` — sem isto a asserção veria as chamadas deles.
    vi.mocked(obterFatosProntidao).mockClear();
    mockModalidade("protocol_driven");
    vi.mocked(getTenantContext).mockResolvedValueOnce({
      clinicId: "clinic_1",
      userId: "user_1",
      role: "admin_recepcao",
    });

    const LayoutComponent = await PacienteLayout({
      children: <div data-testid="child-content">Conteúdo</div>,
      params: Promise.resolve({ id: "pac_1" }),
    });

    render(LayoutComponent);

    expect(obterFatosProntidao).not.toHaveBeenCalled();
    // §4a — e não basta não consultar: nenhum gesto e nenhum degrau clínico
    // nomeado. A escada afirmaria "falta meta" sobre prontuário completo, ao
    // papel que a política proíbe de ler dado clínico.
    expect(screen.queryByText(/para este prontuário gerar dados/i)).toBeNull();
    expect(screen.queryByTestId("gesto-primario")).toBeNull();
    // "Ficha Clínica" sozinho não serve de sonda: é rótulo de ABA, sempre
    // presente. A sonda é a descrição do DEGRAU, que só a escada renderiza.
    expect(screen.queryByText(/Diagnóstico, medicações/i)).toBeNull();
    expect(screen.queryByText(/Aguardando/)).toBeNull();
  });
});

/**
 * D65 — as ações de ciclo de vida vivem NESTA casca, e não no `PageHeader` de
 * `page.tsx`.
 *
 * O defeito que estes casos discriminam: em `conventional` a rota base
 * redireciona para `/temas` antes de renderizar header nenhum, então o botão de
 * alta simplesmente não existia para essa modalidade — e sem `alta_em` o
 * prontuário nunca fica elegível a expurgo (`app_paciente_expurgavel`, `0128`).
 * Um teste que só renderizasse `page.tsx` passaria verde sobre o buraco: a
 * modalidade afetada nunca chega lá.
 *
 * Mutação que tem de derrubar: mover o `<CicloDeVidaPaciente>` de volta para
 * `page.tsx` derruba o caso de `conventional`.
 */
describe("PacienteLayout - ciclo de vida do prontuário (D65)", () => {
  const PAPEIS = ["protocol_driven", "cognitive_behavioral", "conventional"];

  async function renderizar(id: string) {
    const LayoutComponent = await PacienteLayout({
      children: <div data-testid="child-content">Conteúdo</div>,
      params: Promise.resolve({ id }),
    });
    render(LayoutComponent);
  }

  // As ações moram atrás do menu `⋯` ("Ações do prontuário") na faixa de
  // abas: o gatilho visível é UM botão, e os rótulos são `menuitem` só depois
  // de abri-lo. Um teste que procurasse `button` "Registrar alta clínica"
  // direto acusaria ausência sobre uma ação que existe.
  async function abrirMenuDeAcoes() {
    const usuario = userEvent.setup();
    await usuario.click(
      screen.getByRole("button", { name: "Ações do prontuário" }),
    );
    await screen.findByRole("menu");
  }

  it.each(PAPEIS)(
    "coordenador vê Registrar alta e Arquivar em %s",
    async (modalidade) => {
      mockPaciente({ clinicalModality: modalidade });
      vi.mocked(getTenantContext).mockResolvedValueOnce({
        clinicId: "clinic_1",
        userId: "user_1",
        role: "coordenador",
      });

      await renderizar("pac_1");
      await abrirMenuDeAcoes();

      expect(
        screen.getByRole("menuitem", { name: "Registrar alta clínica" }),
      ).not.toBeNull();
      expect(
        screen.getByRole("menuitem", { name: "Arquivar paciente" }),
      ).not.toBeNull();
    },
  );

  it("o menu de ações fica na faixa de abas, ao lado do selo de acesso", async () => {
    // A regressão que este caso vigia: voltar a barra para uma faixa solta
    // abaixo das abas. O gatilho `⋯` e o selo têm de ser descendentes do MESMO
    // contêiner que envolve o `<nav>` das abas — é o slot `acoes` do `TabsNav`.
    mockPaciente({ clinicalModality: "conventional" });
    vi.mocked(getTenantContext).mockResolvedValueOnce({
      clinicId: "clinic_1",
      userId: "user_1",
      role: "coordenador",
    });

    await renderizar("pac_1");

    const nav = screen.getByRole("navigation", {
      name: "Seções do prontuário do paciente",
    });
    const faixa = nav.parentElement;
    expect(faixa).not.toBeNull();
    expect(
      faixa!.contains(
        screen.getByRole("button", { name: "Ações do prontuário" }),
      ),
    ).toBe(true);
    expect(
      faixa!.contains(screen.getByText("Acesso restrito à equipe")),
    ).toBe(true);
  });

  it("selecionar uma ação do menu abre o diálogo correspondente", async () => {
    // O diálogo roda em modo controlado (sem botão próprio): quem o abre é o
    // item do menu. Sem este caso, um `aoSelecionar` vazio passaria verde nos
    // testes de presença acima.
    mockPaciente({ clinicalModality: "conventional" });
    vi.mocked(getTenantContext).mockResolvedValueOnce({
      clinicId: "clinic_1",
      userId: "user_1",
      role: "coordenador",
    });

    await renderizar("pac_1");
    await abrirMenuDeAcoes();
    await userEvent
      .setup()
      .click(screen.getByRole("menuitem", { name: "Registrar alta clínica" }));

    const dialogo = await screen.findByRole("dialog", {
      name: "Registrar alta clínica",
    });
    expect(dialogo).not.toBeNull();
    // Só o diálogo escolhido abre — o de arquivamento segue fechado.
    expect(
      screen.queryByRole("dialog", { name: "Arquivar paciente" }),
    ).toBeNull();
  });

  it("terapeuta não vê nenhum gatilho de alta nem de arquivamento", async () => {
    // `requireRole` recusa os dois cores para `terapeuta`; um botão aqui viraria
    // erro no submit em vez de recusa legível.
    mockPaciente({ clinicalModality: "conventional" });
    vi.mocked(getTenantContext).mockResolvedValueOnce({
      clinicId: "clinic_1",
      userId: "user_1",
      role: "terapeuta",
    });

    await renderizar("pac_1");

    // Sem ação nenhuma, o menu `⋯` não existe — nem vazio.
    expect(
      screen.queryByRole("button", { name: "Ações do prontuário" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /alta clínica/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /rquivar/ })).toBeNull();
  });

  it("admin_recepcao arquiva mas NÃO dá alta", async () => {
    // A assimetria é do core: arquivar é ato administrativo (sai da contagem de
    // ativos da fatura); alta é ato clínico que abre o prazo legal de guarda.
    mockPaciente({ clinicalModality: "conventional" });
    vi.mocked(getTenantContext).mockResolvedValueOnce({
      clinicId: "clinic_1",
      userId: "user_1",
      role: "admin_recepcao",
    });

    await renderizar("pac_1");
    await abrirMenuDeAcoes();

    expect(
      screen.queryByRole("menuitem", { name: /alta clínica/i }),
    ).toBeNull();
    expect(
      screen.getByRole("menuitem", { name: "Arquivar paciente" }),
    ).not.toBeNull();
  });

  it("paciente com alta exibe o selo Alta Concluída e o gatilho vira Desfazer", async () => {
    mockPaciente({ clinicalModality: "conventional", altaEm: "2026-03-10" });
    vi.mocked(getTenantContext).mockResolvedValueOnce({
      clinicId: "clinic_1",
      userId: "user_1",
      role: "coordenador",
    });

    await renderizar("pac_1");

    expect(screen.getByText("Alta Concluída")).not.toBeNull();

    await abrirMenuDeAcoes();
    expect(
      screen.getByRole("menuitem", { name: "Desfazer alta clínica" }),
    ).not.toBeNull();
    expect(
      screen.queryByRole("menuitem", { name: "Registrar alta clínica" }),
    ).toBeNull();
  });

  it("sem alta não há selo Alta Concluída", async () => {
    mockPaciente({ clinicalModality: "conventional", altaEm: null });
    vi.mocked(getTenantContext).mockResolvedValueOnce({
      clinicId: "clinic_1",
      userId: "user_1",
      role: "coordenador",
    });

    await renderizar("pac_1");

    expect(screen.queryByText("Alta Concluída")).toBeNull();
  });

  it("terapeuta em paciente com alta ainda LÊ o selo, mesmo sem gatilho", async () => {
    // Selo é informação clínica, não permissão: o terapeuta precisa saber que o
    // acompanhamento foi encerrado antes de registrar evolução nova.
    mockPaciente({
      clinicalModality: "conventional",
      altaEm: "2026-03-10",
      arquivadoEm: new Date("2026-03-10T12:00:00Z"),
    });
    vi.mocked(getTenantContext).mockResolvedValueOnce({
      clinicId: "clinic_1",
      userId: "user_1",
      role: "terapeuta",
    });

    await renderizar("pac_1");

    expect(screen.getByText("Alta Concluída")).not.toBeNull();
    expect(screen.getByText("Arquivado")).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: "Ações do prontuário" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /alta clínica/i })).toBeNull();
  });
});
