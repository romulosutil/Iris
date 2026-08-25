import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));
vi.mock("./actions", () => ({ purgarPacienteAction: vi.fn() }));

const { FilaTabela } = await import("./fila-tabela");
const { normalizarPagina, grampearPagina, totalDePaginas, offsetDaPagina } =
  await import("./logic");

const LINHAS = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    nome: "Ana Clara Ferrão",
    altaEm: "10/03/2016",
    venceEm: "10/03/2026",
    avisadoEm: "10/12/2025 03:00",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    nome: "Bruno Sampaio",
    altaEm: "01/01/2015",
    venceEm: "01/01/2025",
    avisadoEm: null,
  },
];

describe("FilaTabela", () => {
  /**
   * Fila vazia é o estado NORMAL de uma clínica nova, não uma falha. Renderizar
   * uma tabela com cabeçalho e nenhuma linha diria "algo deu errado"; o
   * empty-state diz o contrário, e diz por quê.
   */
  it("fila vazia renderiza empty-state, não tabela", () => {
    render(<FilaTabela linhas={[]} />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(
      screen.getByText("Nenhum prontuário com prazo vencido"),
    ).toBeTruthy();
  });

  it("desenha uma linha por prontuário, com alta e vencimento", () => {
    render(<FilaTabela linhas={LINHAS} />);
    const corpo = screen.getAllByRole("rowgroup")[1] as HTMLElement;

    expect(within(corpo).getAllByRole("row")).toHaveLength(2);
    expect(screen.getByText("Ana Clara Ferrão")).toBeTruthy();
    expect(screen.getByText("10/03/2026")).toBeTruthy();
    expect(screen.getByText("01/01/2025")).toBeTruthy();
  });

  /**
   * O selo distingue o prontuário que venceu COM aviso prévio do que venceu
   * sem. Sem aviso é sinal de que o job de varredura não rodou — informação que
   * o coordenador precisa ver antes de apagar qualquer coisa, e que uma coluna
   * só com a data (vazia ou não) não comunica.
   */
  it("distingue avisado de não avisado", () => {
    render(<FilaTabela linhas={LINHAS} />);
    expect(screen.getByText(/Avisado em 10\/12\/2025 03:00/)).toBeTruthy();
    expect(screen.getByText("Sem aviso prévio")).toBeTruthy();
  });

  it("cada linha tem seu próprio gatilho de expurgo", () => {
    render(<FilaTabela linhas={LINHAS} />);
    expect(
      screen.getAllByRole("button", { name: "Expurgar prontuário" }),
    ).toHaveLength(2);
  });
});

describe("paginação da fila", () => {
  /**
   * 25, não 50 como a trilha de auditoria: cada linha desta fila é um convite a
   * apagar um prontuário inteiro. Página curta é atrito deliberado.
   */
  it("pagina de 25 em 25", () => {
    expect(totalDePaginas(25)).toBe(1);
    expect(totalDePaginas(26)).toBe(2);
    expect(offsetDaPagina(3)).toBe(50);
  });

  /** Zero registros = 1 página; `totalPaginas = 0` mostraria "Página 1 de 0". */
  it("fila vazia ainda tem uma página", () => {
    expect(totalDePaginas(0)).toBe(1);
    expect(grampearPagina(7, 0)).toBe(1);
  });

  /**
   * O total encolhe entre a renderização do link e o clique: purgar alguém tira
   * a linha da fila. Grampear na ÚLTIMA página válida, e não devolver lista
   * vazia — vazio numa página alta se lê como "não há prontuários vencidos",
   * afirmação falsa sobre obrigação legal.
   */
  it("grampeia na última página existente", () => {
    expect(grampearPagina(9, 30)).toBe(2);
    expect(grampearPagina(1, 30)).toBe(1);
  });

  /** `?pagina=` vem do usuário: negativo viraria OFFSET negativo (erro de sintaxe). */
  it("normaliza pagina inválida para 1", () => {
    expect(normalizarPagina(undefined)).toBe(1);
    expect(normalizarPagina("-3")).toBe(1);
    expect(normalizarPagina("1.5")).toBe(1);
    expect(normalizarPagina("abc")).toBe(1);
    expect(normalizarPagina(["4", "9"])).toBe(4);
  });
});
