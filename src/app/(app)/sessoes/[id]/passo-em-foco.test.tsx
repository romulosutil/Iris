import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { TenantContext } from "@/db/rls";
import type { DadosSessao } from "./queries";
import type { Prontidao } from "@/lib/patient/prontidao";

// T07b — Task 7 (`b2775dfc`) reportou a lacuna de cobertura desta task: mutar
// o `if (!dados.prontidao.podeDocumentar)` de `page.tsx` não fazia NENHUM
// teste ficar vermelho (a suíte de integração só afirma sobre `queries.ts`).
// `PassoEmFoco` foi extraído para `passo-em-foco.tsx` (mesmo comportamento,
// import próprio) para este arquivo poder renderizar o passo "documentar"
// direto, sem montar `SessaoPage` inteira. Mesmo padrão de mocks de
// `../a11y.test.tsx`: `PassoDocumentar` reusa `CapturaForm`/`ConsolidarForm`
// de `/diario`, que importam `./actions` ("use server") → `getTenantContext`
// → `@/db/client`; `PassoRevisar`/`ReprocessarExtracao` puxam cadeia
// semelhante. No jsdom só renderizamos os componentes — nenhuma action roda.
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));

const { PassoEmFoco } = await import("./passo-em-foco");

afterEach(cleanup);

const SESSION_ID = "00000000-0000-0000-0000-000000000000";

const ctx: TenantContext = {
  clinicId: "00000000-0000-0000-0000-0000000000c1",
  userId: "00000000-0000-0000-0000-0000000000u1",
  role: "terapeuta",
};

const resultadoDocumentar = {
  estado: "realizada",
  gesto: "documentar",
} as const;

const prontidaoBloqueada: Prontidao = {
  degraus: [
    {
      id: "meta",
      rotulo: "Ativar ao menos uma meta",
      descricao: "Evidência sem meta resolvida é descartada na materialização.",
      estado: "bloqueante",
      rota: null,
      papelQueResolve: "coordenador",
    },
  ],
  proximo: {
    id: "meta",
    rotulo: "Ativar ao menos uma meta",
    descricao: "Evidência sem meta resolvida é descartada na materialização.",
    estado: "bloqueante",
    rota: null,
    papelQueResolve: "coordenador",
  },
  podeDocumentar: false,
  quemResolve: "Coordenação",
};

const prontidaoLiberada: Prontidao = {
  degraus: [],
  proximo: null,
  podeDocumentar: true,
  quemResolve: null,
};

function dadosBase(prontidao: Prontidao): DadosSessao {
  return {
    sessionId: SESSION_ID,
    patientId: "00000000-0000-0000-0000-0000000000p1",
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
    prontidao,
  };
}

// Mutação que Task 7 relatou: comentar o `if (!dados.prontidao.podeDocumentar)`
// deixaria este teste passando MESMO SEM a régua — é por isso que o teste de
// baixo (podeDocumentar: true) também precisa existir, provando que o cartão
// NÃO aparece quando a prontidão está liberada.
test("gesto 'documentar' bloqueado: mostra o CartaoProntidao, não o formulário", async () => {
  const ui = await PassoEmFoco({
    sessionId: SESSION_ID,
    ctx,
    dados: dadosBase(prontidaoBloqueada),
    resultado: resultadoDocumentar,
  });
  render(ui);

  expect(
    screen.getByText("Esta sessão ainda não pode ser documentada"),
  ).toBeTruthy();
  expect(screen.queryByText("Documentar")).toBeNull();
});

test("gesto 'documentar' liberado: mostra o formulário, não o CartaoProntidao", async () => {
  const ui = await PassoEmFoco({
    sessionId: SESSION_ID,
    ctx,
    dados: dadosBase(prontidaoLiberada),
    resultado: resultadoDocumentar,
  });
  render(ui);

  expect(screen.getByText("Documentar")).toBeTruthy();
  expect(
    screen.queryByText("Esta sessão ainda não pode ser documentada"),
  ).toBeNull();
});
