import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { normalizarPagina, totalDePaginas } from "./logic";
import { lerPaginaExpurgaveis } from "./queries";
import { FilaTabela } from "./fila-tabela";
import { PaginacaoFila } from "./paginacao-fila";

/**
 * #352 — fila de retenção e expurgo.
 *
 * O layout de `/clinica` já é coordenador-only; o `requireRole` aqui é a
 * segunda camada, no padrão das 29 telas irmãs. A terceira é o banco:
 * `app_pacientes_expurgaveis` é `SECURITY DEFINER` e carrega no corpo o
 * predicado de clínica **e** papel.
 *
 * **Não há try/catch em volta da leitura, de propósito.** Se a query falhar, a
 * exceção sobe para o error boundary. Capturar e renderizar lista vazia
 * transformaria uma falha de banco em "nenhum prontuário vencido" — afirmação
 * falsa sobre uma obrigação legal da clínica, e do lado perigoso: a clínica
 * concluiria que não tem nada a eliminar.
 */
export default async function RetencaoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getTenantContext();
  try {
    requireRole(ctx, "coordenador");
  } catch {
    notFound();
  }

  const { pagina: paginaBruta } = await searchParams;
  const pagina = await lerPaginaExpurgaveis(ctx, normalizarPagina(paginaBruta));

  return (
    <Stack gap="lg" como="main">
      <PageHeader
        breadcrumb={
          <Breadcrumb
            itens={[
              { rotulo: "Clínica", href: "/clinica" },
              { rotulo: "Retenção & Expurgo", atual: true },
            ]}
          />
        }
        title="Retenção & Expurgo"
        description="Prontuários cujo prazo legal de guarda venceu. Eliminá-los é obrigação da clínica como controladora (LGPD, Art. 16) — não é limpeza opcional. O expurgo é definitivo e não tem desfazer."
      />
      <FilaTabela linhas={pagina.linhas} />
      <PaginacaoFila
        paginaAtual={pagina.paginaAtual}
        totalPaginas={totalDePaginas(pagina.total)}
        total={pagina.total}
      />
    </Stack>
  );
}
