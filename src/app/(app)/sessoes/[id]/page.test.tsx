import { cloneElement, isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { TenantContext } from "@/db/rls";
import type { DadosSessao } from "./queries";
import { montarProntidao, type FatosProntidao } from "@/lib/patient/prontidao";

/**
 * Prova da spec §6 — **4 papéis × gesto primário** na superfície "Documentar".
 *
 * Por que este arquivo existe: a #512 fechou com 31 testes verdes na action e
 * ZERO na rota, e o defeito atravessou exatamente por esse buraco. A matriz da
 * função pura (`prontidao.test.ts`) prova que `montarProntidao` decide certo
 * dado um `role`; ela não prova NADA sobre qual `role` a rota entrega, nem
 * sobre qual componente a rota escolhe com o resultado. `passo-em-foco.test.tsx`
 * cobre a régua `podeDocumentar` isolada do papel. O que faltava — e é o que
 * está aqui — é montar `SessaoPage` com o `ctx` de cada papel e afirmar QUAL
 * gesto aparece, ou que nenhum aparece.
 *
 * Mesmo padrão de mocks de `passo-em-foco.test.tsx` / `../a11y.test.tsx`:
 * `PassoDocumentar` reusa `CapturaForm`/`ConsolidarForm` de `/diario`, que
 * importam `./actions` ("use server") → `getTenantContext` → `@/db/client`.
 * No jsdom só renderizamos — nenhuma action roda.
 */
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));

class ErroNotFound extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
    this.name = "ErroNotFound";
  }
}
const notFound = vi.fn(() => {
  throw new ErroNotFound();
});

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  usePathname: () => "/sessoes/sess_1",
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const getTenantContext = vi.fn();
vi.mock("@/auth/tenant", () => ({
  getTenantContext: () => getTenantContext(),
}));

const carregarSessao = vi.fn();
vi.mock("./queries", () => ({
  carregarSessao: (...args: unknown[]) => carregarSessao(...args),
}));

const { default: SessaoPage } = await import("./page");

afterEach(cleanup);

const SESSION_ID = "00000000-0000-0000-0000-0000000000s1";
const PATIENT_ID = "00000000-0000-0000-0000-0000000000p1";
const CLINIC_ID = "00000000-0000-0000-0000-0000000000c1";

const ctxDe = (role: TenantContext["role"], userId: string): TenantContext => ({
  clinicId: CLINIC_ID,
  userId,
  role,
});

/** Prontuário incompleto: falta protocolo e meta (ambos BLOQUEANTES em
 * `protocol_driven`), ficha e anamnese já feitas. É o estado que trava o
 * "Documentar" — e o único em que dá para comparar gesto entre papéis. */
const FATOS_INCOMPLETOS: FatosProntidao = {
  temFichaClinica: true,
  temAnamnese: true,
  temProtocoloAtivo: false,
  temMetaAtiva: false,
  temInstrumentoAplicado: false,
  temSessaoConsolidada: false,
};

/** Escada cumprida: nada bloqueia, `podeDocumentar === true`. */
const FATOS_COMPLETOS: FatosProntidao = {
  temFichaClinica: true,
  temAnamnese: true,
  temProtocoloAtivo: true,
  temMetaAtiva: true,
  temInstrumentoAplicado: true,
  temSessaoConsolidada: true,
};

const resultadoDocumentar = {
  estado: "realizada",
  gesto: "documentar",
} as const;

/**
 * A prontidão é montada pela função REAL, não por um literal escrito à mão:
 * um objeto costurado no teste provaria só que o componente sabe renderizar o
 * objeto do teste. Aqui o `role` do `ctx` é o MESMO que entra na régua — que é
 * precisamente o acoplamento que a #512 deixou sem prova.
 */
function dados(
  ctx: TenantContext,
  fatos: FatosProntidao,
  overrides: Partial<DadosSessao> = {},
): DadosSessao {
  return {
    sessionId: SESSION_ID,
    patientId: PATIENT_ID,
    pacienteNome: "Paciente Teste",
    terapeutaId: ctx.userId,
    podeVer: true,
    ehDono: true,
    podeColapsarAprovacao: false,
    resultado: resultadoDocumentar,
    temCaptura: false,
    notaConsolidada: null,
    protocolos: [],
    protocolIdsPreSelecionados: [],
    prontidao: montarProntidao({
      modalidade: "protocol_driven",
      fatos,
      role: ctx.role,
      patientId: PATIENT_ID,
    }),
    ...overrides,
  };
}

async function montarPagina(ctx: TenantContext, d: DadosSessao | null) {
  getTenantContext.mockResolvedValue(ctx);
  carregarSessao.mockResolvedValue(d);
  return SessaoPage({ params: Promise.resolve({ id: SESSION_ID }) });
}

/**
 * `SessaoPage` devolve uma árvore que contém OUTRO Server Component assíncrono
 * (`PassoEmFoco`). O renderizador de cliente do React 19 recusa isso —
 * "`<PassoEmFoco>` is an async Client Component" — e o `body` sai VAZIO. Sem
 * este passo, toda asserção de ausência ("não tem botão") ficaria verde sobre
 * uma tela que nunca renderizou: o teste-que-não-testa-nada.
 *
 * Resolver a subárvore aqui preserva o que importa provar — a COMPOSIÇÃO real
 * da rota, com o `ctx` que ela mesma buscou e o `dados` que ela mesma passou
 * adiante. Chamar `PassoEmFoco` direto do teste (como `passo-em-foco.test.tsx`
 * faz, de propósito, para isolar a régua) recriaria a fiação à mão e voltaria
 * a deixar `page.tsx` sem oráculo — o buraco da #512.
 */
async function resolverAssincronos(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) {
    return Promise.all(node.map((n) => resolverAssincronos(n)));
  }
  if (!isValidElement(node)) return node;

  const el = node as React.ReactElement<{ children?: ReactNode }>;
  if (
    typeof el.type === "function" &&
    el.type.constructor.name === "AsyncFunction"
  ) {
    const fn = el.type as (props: unknown) => Promise<ReactNode>;
    return resolverAssincronos(await fn(el.props));
  }

  // Componentes de cliente (`CapturaForm` e afins) NÃO são invocados aqui —
  // eles têm hooks e quem os monta é o `render`. Só descemos pelos filhos.
  if (el.props?.children === undefined) return el;
  return cloneElement(
    el,
    undefined,
    await resolverAssincronos(el.props.children),
  );
}

async function renderPagina(ctx: TenantContext, d: DadosSessao) {
  const ui = await resolverAssincronos(await montarPagina(ctx, d));
  render(ui as React.ReactElement);
  // Sonda POSITIVA antes de qualquer asserção de ausência: se o cabeçalho não
  // está aqui, a árvore não montou e nenhum `queryBy…toBeNull` vale nada.
  expect(screen.getByText("Paciente Teste")).toBeTruthy();
}

beforeEach(() => {
  notFound.mockClear();
});

describe("SessaoPage — passo Documentar, 4 papéis × gesto primário", () => {
  it("coordenador: gesto primário é 'Prescrever um protocolo'", async () => {
    const ctx = ctxDe("coordenador", "user_coord");
    await renderPagina(ctx, dados(ctx, FATOS_INCOMPLETOS));

    expect(
      screen.getByText("Esta sessão ainda não pode ser documentada"),
    ).toBeTruthy();
    // Ele é `papelQueResolve` do degrau bloqueante ⇒ ganha o botão.
    const gesto = screen.getByTestId("gesto-primario");
    expect(gesto.textContent).toContain("Prescrever um protocolo");
    expect(gesto.getAttribute("href")).toBe(
      `/pacientes/${PATIENT_ID}/cadastro-clinico`,
    );
    // E não o formulário: a régua morde antes.
    expect(screen.queryByText("Documentar")).toBeNull();
  });

  it("terapeuta NA equipe: nenhum gesto — espera nomeada pela coordenação", async () => {
    const ctx = ctxDe("terapeuta", "user_terapeuta");
    await renderPagina(ctx, dados(ctx, FATOS_INCOMPLETOS));

    expect(
      screen.getByText("Esta sessão ainda não pode ser documentada"),
    ).toBeTruthy();
    // Botão morto seria pior que botão ausente: `/cadastro-clinico` recusaria
    // o terapeuta no `requireRole` do destino, gastando o clique sem explicar.
    expect(screen.queryByTestId("gesto-primario")).toBeNull();
    expect(
      screen.getByText(/Aguardando Coordenação: Prescrever um protocolo/),
    ).toBeTruthy();
    expect(screen.queryByText("Documentar")).toBeNull();
  });

  it("terapeuta FORA da equipe (cobertura): gesto primário é o próprio 'Documentar'", async () => {
    // D-A10, opção (b) ratificada: `app_fatos_prontidao` (`0149`) espelha
    // `goal_select` MAIS o recorte de cobertura, então o terapeuta de
    // cobertura lê os MESMOS fatos que o coordenador. Sob a régua descartada
    // ("está na equipe de cuidado") os `EXISTS` voltariam `false` para linhas
    // que EXISTEM e ele veria BLOQUEADO um prontuário que a coordenação vê
    // pronto — bloqueio funcional novo, por regra que não é sobre esse papel.
    const ctx = ctxDe("terapeuta", "user_cobertura");
    // Dono pelo recorte de cobertura (`atendido_por_id`), não por
    // `terapeuta_id`: `ehProfissionalResponsavel` já resolve os dois.
    await renderPagina(
      ctx,
      dados(ctx, FATOS_COMPLETOS, { terapeutaId: "user_titular" }),
    );

    expect(screen.getByText("Documentar")).toBeTruthy();
    expect(
      screen.queryByText("Esta sessão ainda não pode ser documentada"),
    ).toBeNull();
    expect(screen.queryByText(/Aguardando/)).toBeNull();
  });

  it("admin_recepcao: nenhum gesto — a rota nem chega a renderizar", async () => {
    // `podeVer` é `coordenador OR ehProfissionalResponsavel`; a recepção não é
    // nenhum dos dois. O gesto dela nesta superfície é ausência de superfície.
    const ctx = ctxDe("admin_recepcao", "user_recepcao");
    await expect(
      montarPagina(
        ctx,
        dados(ctx, FATOS_INCOMPLETOS, { podeVer: false, ehDono: false }),
      ),
    ).rejects.toBeInstanceOf(ErroNotFound);

    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("§4a — sem leitura clínica, a tela não nomeia degrau clínico algum", async () => {
    // A metade simétrica: o cartão não pode fingir PRONTO, e também não pode
    // fingir BLOQUEADO. `montarProntidao` devolve escada VAZIA para papel fora
    // de {coordenador, terapeuta} — mesmo alimentada com fatos `false`, que sob
    // a RLS da recepção é o que os seis `EXISTS` devolveriam para linhas que
    // EXISTEM. Aqui `podeVer` é forçado a `true` de propósito: em produção o
    // `notFound()` do teste acima intercepta antes, e sem esta montagem a
    // regra da §4a ficaria sem oráculo nenhum nesta superfície.
    const ctx = ctxDe("admin_recepcao", "user_recepcao");
    const d = dados(ctx, FATOS_INCOMPLETOS);
    expect(d.prontidao.degraus).toEqual([]);
    expect(d.prontidao.podeDocumentar).toBe(false);

    await renderPagina(ctx, d);

    // Nenhum degrau clínico nomeado — nem como rótulo, nem como descrição.
    expect(screen.queryByText(/Prescrever um protocolo/)).toBeNull();
    expect(screen.queryByText(/Ativar ao menos uma meta/)).toBeNull();
    expect(screen.queryByText(/Preencher a ficha clínica/)).toBeNull();
    expect(screen.queryByTestId("gesto-primario")).toBeNull();
    // E nenhum formulário: fail-closed continua fechado.
    expect(screen.queryByText("Documentar")).toBeNull();
  });
});
