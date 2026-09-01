import "server-only";
import type { TenantContext } from "@/db/rls";
import { listarTravadas, type SessaoTravada } from "@/lib/sessao/fila";

/**
 * `/sessoes` — queries e escopo (#512 · T03 · R-09, R-14, R-15, R-16, R-19,
 * R-33).
 *
 * Este módulo NÃO reimplementa o predicado da fila: toda a leitura de banco
 * já saiu de `contarTravadas`/`listarTravadas` (T02, `@/lib/sessao/fila`),
 * que é a fonte única do escopo por papel (R-09) e da ordenação por tempo
 * travado (R-19, `agendada_para ASC` como proxy — ver comentário lá). Aqui só
 * existe processamento EM MEMÓRIA sobre o conjunto já escopado: filtro por
 * terapeuta (R-16), ordenação alternativa (R-15) e paginação da página.
 *
 * Por que isso não fere R-12 (predicado único): o WHERE de escopo nunca é
 * reescrito aqui — `listarTravadas` já devolveu o conjunto certo por papel.
 * O que muda depois é apresentação, não elegibilidade.
 */

/** Cookie de persistência do filtro por terapeuta (R-16). Decisão desta task:
 * cookie, não querystring — o requisito pede persistência que "vale para a
 * fila e para a grade semanal" (C3), ou seja, atravessa rota; querystring
 * morre ao trocar de página sem o parâmetro. O cookie é lido por
 * `page.tsx` e escrito pela Server Action `definirFiltroTerapeuta`
 * (`./actions.ts`). */
export const COOKIE_FILTRO_TERAPEUTA = "iris_sessoes_terapeuta";

/**
 * Ordenação visível e trocável (R-15). Os dois valores operam sobre o MESMO
 * campo (`agendadaPara` — não existe coluna de "tempo travado", G2 proíbe
 * migração), só a direção muda:
 *   - `tempo_travado`: mais antiga primeiro (ASC) — quanto mais antiga, mais
 *     tempo passou travada. Default do coordenador.
 *   - `dia`: mais recente primeiro (DESC) — leitura "o que aconteceu por
 *     último", mais natural para o terapeuta revisar o próprio dia a dia.
 *     Default do terapeuta.
 * O controle na tela é o MESMO widget para os dois papéis (R-15: "o controle
 * é o mesmo e está à vista"); só o valor default muda por papel.
 */
export type Ordenacao = "tempo_travado" | "dia";

export type OpcoesFilaSessoes = {
  /** Ver `OpcoesFila.agora` em `@/lib/sessao/fila` — mesma razão (R-04). */
  agora?: Date;
  pagina?: number;
  porPagina?: number;
  ordenacao?: Ordenacao;
  /** `null`/`undefined` = sem filtro. Ignorado para papel `terapeuta`: ele já
   * só vê as próprias sessões (R-09), filtrar por si mesmo não muda nada. */
  terapeutaId?: string | null;
};

export type TerapeutaDaFila = { id: string; nome: string };

export type FilaSessoesResultado = {
  /** Página pedida, já recortada. */
  itens: SessaoTravada[];
  /** Tamanho do conjunto FILTRADO (o que a paginação percorre). */
  total: number;
  /** Tamanho do conjunto do escopo por papel, ANTES do filtro por terapeuta —
   * é o número que `escopoTexto` (R-14) enuncia. */
  totalNoEscopo: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
  ordenacao: Ordenacao;
  /** Escopo dito por extenso (R-14) — "7 sessões da clínica" / "7 sessões
   * suas". Pronto para a UI renderizar literalmente, sem recompor números. */
  escopoTexto: string;
  /** `true` quando o conjunto FILTRADO está vazio — dispara o empty-state. */
  vazio: boolean;
  /** Copy do empty-state (R-33). Contém literalmente "Nada travado" sempre
   * que `vazio` é `true`; `null` caso contrário. */
  vazioTexto: string | null;
  /** Opções para o filtro por terapeuta (R-16) — derivadas do conjunto do
   * escopo, sem consulta adicional a `user_role`/`equipe`. */
  terapeutas: TerapeutaDaFila[];
};

const POR_PAGINA_DEFAULT = 10;

/** Default de ordenação por papel (R-15). */
export function ordenacaoDefaultPorPapel(
  role: TenantContext["role"],
): Ordenacao {
  return role === "coordenador" ? "tempo_travado" : "dia";
}

/** Escopo dito por extenso (R-14, C6). */
function escopoTextoDoPapel(
  role: TenantContext["role"],
  totalNoEscopo: number,
): string {
  if (role === "coordenador") {
    return totalNoEscopo === 1
      ? "1 sessão da clínica"
      : `${totalNoEscopo} sessões da clínica`;
  }
  return totalNoEscopo === 1 ? "1 sessão sua" : `${totalNoEscopo} sessões suas`;
}

function ordenar(
  itens: readonly SessaoTravada[],
  ordenacao: Ordenacao,
): SessaoTravada[] {
  const sinal = ordenacao === "tempo_travado" ? 1 : -1;
  return [...itens].sort(
    (a, b) => sinal * (a.agendadaPara.getTime() - b.agendadaPara.getTime()),
  );
}

/**
 * Carrega a fila de `/sessoes` já escopada, filtrada, ordenada e paginada.
 *
 * `admin_recepcao` nunca chega aqui de fato (R-23, `listarTravadas` já
 * devolve `[]` sem tocar o banco) — este módulo não repete o guard, ele já
 * está na única fonte da leitura.
 */
export async function carregarFilaSessoes(
  ctx: TenantContext,
  opcoes: OpcoesFilaSessoes = {},
): Promise<FilaSessoesResultado> {
  const agora = opcoes.agora ?? new Date();

  // Sem `limite`/`offset` aqui de propósito: precisamos do conjunto inteiro
  // do escopo para montar a lista de terapeutas do filtro (R-16), calcular
  // `escopoTexto` (R-14) sobre o total NÃO filtrado, e só então paginar em
  // memória o resultado já filtrado/ordenado (R-19 — não há LIMIT duplo).
  const { itens: doEscopo, total: totalNoEscopo } = await listarTravadas(ctx, {
    agora,
  });

  const terapeutasMap = new Map<string, string>();
  for (const s of doEscopo) {
    if (!terapeutasMap.has(s.terapeutaId)) {
      terapeutasMap.set(s.terapeutaId, s.terapeutaNome ?? "Terapeuta");
    }
  }
  const terapeutas: TerapeutaDaFila[] = Array.from(
    terapeutasMap,
    ([id, nome]) => ({ id, nome }),
  ).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const filtrado =
    ctx.role === "coordenador" && opcoes.terapeutaId
      ? doEscopo.filter((s) => s.terapeutaId === opcoes.terapeutaId)
      : doEscopo;

  const ordenacao = opcoes.ordenacao ?? ordenacaoDefaultPorPapel(ctx.role);
  const ordenado = ordenar(filtrado, ordenacao);

  const porPagina = opcoes.porPagina ?? POR_PAGINA_DEFAULT;
  const total = ordenado.length;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const paginaPedida = opcoes.pagina ?? 1;
  const pagina = Math.min(Math.max(1, paginaPedida), totalPaginas);
  const offset = (pagina - 1) * porPagina;
  const itens = ordenado.slice(offset, offset + porPagina);

  const vazio = total === 0;

  return {
    itens,
    total,
    totalNoEscopo,
    pagina,
    porPagina,
    totalPaginas,
    ordenacao,
    escopoTexto: escopoTextoDoPapel(ctx.role, totalNoEscopo),
    vazio,
    // R-33: "Nada travado" tem que aparecer com essas palavras, sempre que a
    // fila (já filtrada) está vazia — inclusive quando o vazio vem do filtro
    // por terapeuta, não só de um escopo inteiro limpo.
    vazioTexto: vazio ? "Nada travado por aqui." : null,
    terapeutas,
  };
}
