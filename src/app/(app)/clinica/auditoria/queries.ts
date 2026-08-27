import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import { fusoDaClinica } from "@/lib/agenda/clinic-timezone";
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
 * **Ordem:** `criado_em DESC NULLS LAST, id DESC NULLS LAST`. O desempate por
 * `id` não é enfeite: com dois registros no mesmo instante (o job de
 * arquivamento grava em lote com um `p_agora` só), uma ordem sem desempate pode
 * devolver o mesmo registro em duas páginas e omitir outro.
 *
 * O `NULLS LAST` explícito casa com a definição do índice (`.desc()` do Drizzle
 * gera `NULLS LAST`; um `ORDER BY ... DESC` escrito à mão tem default
 * `NULLS FIRST`). **Não é o que decide o plano aqui** — ver abaixo —, mas é o
 * que vale se algum dia esta consulta passar a ler a tabela base, onde a
 * divergência de fato descarta o índice: medido em 20k linhas, `FROM audit_log`
 * com `NULLS FIRST` cai em `Seq Scan`.
 *
 * **O que o índice resolve, e o que ele não resolve.**
 * `audit_log_mascarado` é `security_barrier`: o `LIMIT` **não** desce abaixo da
 * view, então a fatia sempre lê as linhas da clínica e faz top-N sort acima da
 * barreira. O índice não é escolhido pela ordenação — é escolhido pelo
 * `Index Cond` de `clinic_id`, e por isso entra com ou sem `NULLS LAST`. O que
 * ele tira do caminho é varrer a trilha das **outras** clínicas: medido em 20k
 * linhas, `Index Scan` 10 ms contra `Seq Scan` 688 ms.
 *
 * O teto do barrier é o preço de ler pela view, e é o lado certo do trade-off:
 * a tabela base traria `patient_id` e `detalhe` para dentro do alcance de um
 * `select` distraído. 10 ms em 20 mil linhas, com a `0070` limitando a trilha a
 * 180 dias, é preço que cabe.
 *
 * **Forma:** a fatia sai numa subconsulta e o `LEFT JOIN app_user` acontece
 * depois, sobre as 50 linhas já escolhidas, em vez de juntar as 20 mil e
 * ordenar depois. Ganho medido pequeno (8,1 ms contra 9,0 ms) — o custo mora na
 * barreira, não no join —, mas é a forma que não piora com o crescimento da
 * trilha.
 */
export async function lerPaginaTrilha(
  ctx: TenantContext,
  paginaPedida: number,
): Promise<PaginaTrilha> {
  return withTenant(ctx, async (tx) => {
    const fuso = await fusoDaClinica(tx, ctx.clinicId);
    const formatador = new Intl.DateTimeFormat("pt-BR", {
      timeZone: fuso,
      dateStyle: "short",
      timeStyle: "short",
    });
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
        FROM (
               SELECT id, criado_em, acao, entidade, ator_id
                 FROM audit_log_mascarado
                ORDER BY criado_em DESC NULLS LAST, id DESC NULLS LAST
                LIMIT ${ITENS_POR_PAGINA} OFFSET ${offset}
             ) a
        LEFT JOIN app_user u ON u.id = a.ator_id
       ORDER BY a.criado_em DESC NULLS LAST, a.id DESC NULLS LAST
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
