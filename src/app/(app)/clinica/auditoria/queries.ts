import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import { FUSO_CLINICA } from "@/app/(app)/agenda/fuso";
import {
  ITENS_POR_PAGINA,
  grampearPagina,
  offsetDaPagina,
  rotularAcao,
  rotularEntidade,
} from "./logic";

/**
 * Uma linha da trilha, **já pronta para renderizar**.
 *
 * Não existe campo aqui que a tela não desenhe. Isso é regra, não estilo: a
 * revisão do PR #448 pegou `detalhe` (jsonb, campo livre que pode carregar PII)
 * e `entidade_id` viajando até o navegador dentro do payload RSC de um Client
 * Component que nunca os renderizava — invisíveis na tela, legíveis no
 * `view-source`. O que não é renderizado não atravessa a fronteira.
 *
 * A leitura vem da view `audit_log_mascarado`, que já não projeta `patient_id`
 * nem `detalhe`. Ou seja: o vazamento não é evitado por disciplina de quem
 * escreve o `select` — é impossível pela forma da fonte.
 */
export type LinhaTrilha = {
  id: string;
  /** Já formatado no fuso da clínica, no servidor. Nada de `toLocaleString` no
   *  corpo de render: SSR formataria no fuso do servidor e o cliente no dele,
   *  e o resultado é hydration mismatch. */
  quando: string;
  ator: string;
  acao: string;
  entidade: string;
};

export type PaginaTrilha = {
  linhas: LinhaTrilha[];
  paginaAtual: number;
  total: number;
};

type LinhaCrua = {
  id: string;
  criado_em: Date;
  acao: string;
  entidade: string;
  ator_nome: string | null;
};

const formatador = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_CLINICA,
  dateStyle: "short",
  timeStyle: "short",
});

/**
 * Página da trilha de auditoria da clínica corrente.
 *
 * **Fonte:** `audit_log_mascarado` — para os dois papéis que a view admite
 * (`coordenador` e `admin_recepcao`), não só para a recepção. A view impõe o
 * isolamento de tenant no próprio predicado (`clinic_id = app_clinic_id_exigido()`)
 * e filtra o papel; a tabela base continua coordenador-only pela policy
 * `audit_select` da `0046`, e `db/tests/trilha-auditoria.int.test.ts` afirma as
 * duas coisas separadamente. Ler pela view aqui não afrouxa nada — mantém a
 * separação construída pela `0046` como fronteira do banco em vez de um `select`
 * que alguém precisa lembrar de manter enxuto.
 *
 * **Ordem:** `criado_em DESC, id DESC`. O desempate por `id` não é enfeite: com
 * dois registros no mesmo instante (o job de arquivamento grava em lote com um
 * `p_agora` só), uma ordem sem desempate pode devolver o mesmo registro em duas
 * páginas e omitir outro.
 */
export async function lerPaginaTrilha(
  ctx: TenantContext,
  paginaPedida: number,
): Promise<PaginaTrilha> {
  return withTenant(ctx, async (tx) => {
    const contagem = (await tx.execute<{ total: number }>(
      sql`SELECT count(*)::int AS total FROM audit_log_mascarado`,
    )) as unknown as { total: number }[];
    const total = Number(contagem[0]?.total ?? 0);

    const pagina = grampearPagina(paginaPedida, total);
    const offset = offsetDaPagina(pagina);

    const cruas = (await tx.execute<LinhaCrua>(sql`
      SELECT a.id,
             a.criado_em,
             a.acao,
             a.entidade,
             u.name AS ator_nome
        FROM audit_log_mascarado a
        LEFT JOIN app_user u ON u.id = a.ator_id
       ORDER BY a.criado_em DESC, a.id DESC
       LIMIT ${ITENS_POR_PAGINA} OFFSET ${offset}
    `)) as unknown as LinhaCrua[];

    return {
      total,
      paginaAtual: pagina,
      linhas: cruas.map((linha) => ({
        id: linha.id,
        quando: formatador.format(new Date(linha.criado_em)),
        // `ator_id` nulo é ação automática do sistema (job de escalonamento,
        // varredura de arquivamento) — não existe humano a quem atribuir, e a
        // FK é `ON DELETE SET NULL`, então conta excluída também cai aqui.
        ator: linha.ator_nome ?? "Sistema",
        acao: rotularAcao(linha.acao),
        entidade: rotularEntidade(linha.entidade),
      })),
    };
  });
}
