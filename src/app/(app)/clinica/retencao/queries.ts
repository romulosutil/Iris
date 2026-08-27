import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import { fusoDaClinica } from "@/lib/agenda/clinic-timezone";
import { ITENS_POR_PAGINA, grampearPagina, offsetDaPagina } from "./logic";

/**
 * Uma linha da fila, **já pronta para renderizar**.
 *
 * Não existe campo aqui que a tela não desenhe (R352.C8). Isso é regra, não
 * estilo: a revisão do PR #448 pegou `detalhe` (jsonb) e `entidade_id` viajando
 * até o navegador dentro do payload RSC de um Client Component que nunca os
 * renderizava — invisíveis na tela, legíveis no `view-source`. Aqui o dado é
 * mais sensível que lá: é a lista nominal de quem está prestes a ser apagado.
 *
 * `id` e `nome` ficam porque são usados: o diálogo purga por `id` e confere a
 * digitação contra `nome`. Não há `nascimento`, não há `alta_em` cru, não há
 * `clinic_id`.
 */
export type LinhaFila = {
  id: string;
  nome: string;
  /** `DD/MM/YYYY`, formatado no Postgres. */
  altaEm: string;
  /** `DD/MM/YYYY`, formatado no Postgres. */
  venceEm: string;
  /** Data/hora do aviso prévio no fuso da clínica, ou `null` se ainda não houve. */
  avisadoEm: string | null;
};

export type PaginaFila = {
  linhas: LinhaFila[];
  paginaAtual: number;
  total: number;
};

type LinhaCrua = {
  paciente_id: string;
  nome: string;
  alta_em: string;
  vence_em: string;
  avisado_em: Date | null;
  total: number;
};

/**
 * Página da fila de prontuários com prazo de guarda vencido.
 *
 * **Fonte:** `app_pacientes_expurgaveis(limite, offset)` (`0128`), e não um
 * `select` montado aqui. A função é `SECURITY DEFINER` com guard interno que
 * espelha o predicado da policy de leitura de `patient` (clínica **e** papel),
 * e é ela que possui a fórmula de vencimento — a mesma
 * `app_retencao_vence_em` que o gate do expurgo e o job de aviso prévio usam.
 * Reescrever o predicado nesta camada criaria uma segunda definição de
 * "vencido", e as duas divergiriam no primeiro ajuste de política de retenção.
 *
 * **Datas formatadas no Postgres, com `to_char`.** `date` não tem fuso, e o
 * driver do `pg` converte a coluna para um `Date` de JS à meia-noite **local**
 * do servidor — a partir daí qualquer formatação reintroduz o fuso numa data
 * que não tem nenhum, e o vencimento aparece um dia antes. A única data que
 * passa pelo `Intl` é `avisado_em`, que é `timestamptz` e de fato tem instante.
 *
 * **O `ORDER BY` externo repete o da função de propósito.** A ordenação de
 * dentro de `app_pacientes_expurgaveis` decide QUAIS linhas a página traz (é
 * ela que dá sentido ao `OFFSET`), mas um `SELECT ... FROM funcao()` sem
 * `ORDER BY` próprio não tem ordem garantida na saída. Sem esta linha, a mesma
 * página pode sair embaralhada — numa fila em que o operador confere um nome
 * antes de apagar um prontuário, embaralhar é exatamente o errado.
 *
 * **Duas chamadas, não uma.** A primeira pede uma linha só para ler o `total`
 * (`count(*) OVER ()`, calculado sobre o conjunto filtrado inteiro); a segunda
 * traz a página já grampeada. Sem a primeira não há como grampear na ÚLTIMA
 * página válida — uma página alta voltaria vazia, e fila vazia se lê como
 * "nenhum prontuário vencido", que é afirmação falsa sobre obrigação legal.
 */
export async function lerPaginaExpurgaveis(
  ctx: TenantContext,
  paginaPedida: number,
): Promise<PaginaFila> {
  return withTenant(ctx, async (tx) => {
    const fuso = await fusoDaClinica(tx, ctx.clinicId);
    const formatador = new Intl.DateTimeFormat("pt-BR", {
      timeZone: fuso,
      dateStyle: "short",
      timeStyle: "short",
    });
    const contagem = (await tx.execute<{ total: number }>(
      sql`SELECT total::int AS total FROM app_pacientes_expurgaveis(1, 0)`,
    )) as unknown as { total: number }[];
    const total = Number(contagem[0]?.total ?? 0);

    const pagina = grampearPagina(paginaPedida, total);

    if (total === 0) {
      return { total: 0, paginaAtual: pagina, linhas: [] };
    }

    const cruas = (await tx.execute<LinhaCrua>(sql`
      SELECT f.paciente_id,
             f.nome,
             to_char(f.alta_em,  'DD/MM/YYYY') AS alta_em,
             to_char(f.vence_em, 'DD/MM/YYYY') AS vence_em,
             f.avisado_em,
             f.total::int AS total
        FROM app_pacientes_expurgaveis(${ITENS_POR_PAGINA}, ${offsetDaPagina(pagina)}) f
       ORDER BY f.vence_em ASC, f.paciente_id ASC
    `)) as unknown as LinhaCrua[];

    return {
      total,
      paginaAtual: pagina,
      linhas: cruas.map((linha) => ({
        id: linha.paciente_id,
        nome: linha.nome,
        altaEm: linha.alta_em,
        venceEm: linha.vence_em,
        avisadoEm: linha.avisado_em
          ? formatador.format(new Date(linha.avisado_em))
          : null,
      })),
    };
  });
}
