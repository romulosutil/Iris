/**
 * #453 — lógica pura da trilha de auditoria. Sem banco, sem React: existe para
 * ser exercida por `logic.test.ts` sem subir Postgres.
 *
 * O trabalho real aqui é a TRADUÇÃO. `audit_log.acao` e `audit_log.entidade`
 * guardam o slug interno do esquema (`paciente_arquivado_automaticamente`,
 * `alerta_risco_clinico`). Renderizar isso cru transfere ao coordenador o
 * trabalho de decodificar nomenclatura de banco — que é exatamente o que uma
 * trilha de auditoria não pode exigir de quem audita.
 */

/** Itens por página. Não é "limite fixo": a página N existe e é alcançável. */
export const ITENS_POR_PAGINA = 50;

/**
 * Rótulos de `audit_log.acao`.
 *
 * A cobertura desta tabela é verificada por teste: `logic.test.ts` varre os
 * pontos de escrita do repositório (`INSERT INTO audit_log` nas migrações e
 * `insert(auditLog)` em `src/`) e falha se aparecer um `acao` sem entrada aqui.
 * Sem essa varredura, um `acao` novo passa a renderizar pelo fallback e ninguém
 * percebe — a tradução apodrece em silêncio.
 */
export const ROTULOS_ACAO: Readonly<Record<string, string>> = {
  paciente_arquivado: "Paciente arquivado",
  paciente_desarquivado: "Paciente desarquivado",
  paciente_arquivado_automaticamente: "Paciente arquivado pelo sistema",
  paciente_desarquivado_automaticamente: "Paciente desarquivado pelo sistema",
  arquivamento_aviso_previo: "Aviso prévio de arquivamento",
  paciente_modalidade_clinica_alterada: "Modalidade clínica alterada",
  paciente_purgado: "Paciente expurgado",
  // #352 — alta CLÍNICA, que não se confunde com o arquivamento comercial
  // acima: é ela que abre o relógio de retenção do prontuário.
  alta_registrada: "Alta clínica registrada",
  alta_desfeita: "Alta clínica desfeita",
  // #352 — aviso de que o prazo de guarda do prontuário vence em 90 dias. É o
  // que torna o expurgo NÃO-silencioso, e não se confunde com o
  // `arquivamento_aviso_previo` acima, que é comercial (inatividade).
  expurgo_aviso_previo: "Aviso prévio de expurgo de prontuário",
  relatorio_purgado: "Relatório expurgado",
  alerta_risco_criado: "Alerta de risco aberto",
  alerta_risco_email_rt: "Alerta de risco enviado ao responsável técnico",
  alerta_risco_escalado: "Alerta de risco escalado",
  assinatura_cancelada_por_inadimplencia:
    "Assinatura cancelada por inadimplência",
};

/** Rótulos de `audit_log.entidade`. Mesma varredura, mesma exigência. */
export const ROTULOS_ENTIDADE: Readonly<Record<string, string>> = {
  patient: "Paciente",
  report: "Relatório",
  alerta_risco_clinico: "Alerta de risco",
  subscription: "Assinatura",
};

/**
 * Fallback para slug sem entrada no dicionário: `foo_bar_baz` → `Foo bar baz`.
 *
 * Deliberadamente NÃO devolve o slug cru nem uma string genérica ("Ação
 * desconhecida"). O slug cru é o problema que este módulo existe para resolver;
 * a string genérica apagaria a informação. Humanizar preserva o sentido e
 * continua legível — e o teste de cobertura garante que o fallback seja exceção,
 * não regra.
 */
export function humanizarSlug(slug: string): string {
  const limpo = slug.trim().replace(/_+/g, " ").replace(/\s+/g, " ");
  if (limpo === "") return "—";
  return limpo.charAt(0).toUpperCase() + limpo.slice(1);
}

export function rotularAcao(acao: string): string {
  return ROTULOS_ACAO[acao] ?? humanizarSlug(acao);
}

export function rotularEntidade(entidade: string): string {
  return ROTULOS_ENTIDADE[entidade] ?? humanizarSlug(entidade);
}

/**
 * `?pagina=` vem da URL — ou seja, do usuário. Qualquer coisa que não seja
 * inteiro >= 1 vira 1. Sem isto, `pagina=-3` vira OFFSET negativo (erro de
 * sintaxe no Postgres) e `pagina=1e9` vira uma varredura inútil.
 */
export function normalizarPagina(bruto: string | string[] | undefined): number {
  const valor = Array.isArray(bruto) ? bruto[0] : bruto;
  if (typeof valor !== "string") return 1;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1) return 1;
  return n;
}

/**
 * Total de páginas para `total` registros. Zero registros = 1 página (a página
 * vazia existe e é renderizável), e não 0 — `Pagination` com `totalPaginas = 0`
 * mostraria "Página 1 de 0".
 */
export function totalDePaginas(total: number): number {
  if (total <= 0) return 1;
  return Math.ceil(total / ITENS_POR_PAGINA);
}

/**
 * A página pedida pode não existir mais: a trilha é expurgada fisicamente aos
 * 180 dias (`0070`, Marco Civil Art. 15), então o total encolhe entre a
 * renderização de um link e o clique nele. Grampeia no último página válida em
 * vez de devolver lista vazia — lista vazia numa página alta se lê como
 * "não há registros", que é afirmação falsa.
 */
export function grampearPagina(pagina: number, total: number): number {
  return Math.min(Math.max(pagina, 1), totalDePaginas(total));
}

export function offsetDaPagina(pagina: number): number {
  return (pagina - 1) * ITENS_POR_PAGINA;
}
