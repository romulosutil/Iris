import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PacienteLayout from "./layout";
import { getTenantContext } from "@/auth/tenant";
import { obterFatosProntidao } from "./prontidao-queries";

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

vi.mock("./prontidao-queries", () => ({
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
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

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
