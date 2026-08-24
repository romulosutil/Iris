import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { normalizarPagina, totalDePaginas } from "./logic";
import { lerPaginaTrilha } from "./queries";
import { TrilhaTabela } from "./trilha-tabela";
import { PaginacaoTrilha } from "./paginacao-trilha";

/**
 * #453 — trilha de auditoria da clínica.
 *
 * O layout de `/clinica` já é coordenador-only; o `requireRole` aqui é a segunda
 * camada, no padrão das demais páginas da seção. A terceira é o banco: a view
 * `audit_log_mascarado` filtra papel e clínica no próprio predicado.
 *
 * **Não há try/catch em volta da leitura, de propósito.** Se a query falhar, a
 * exceção sobe para o error boundary. Capturar e renderizar lista vazia
 * transformaria uma falha de banco em "nenhuma atividade registrada" — uma
 * afirmação falsa sobre a clínica, numa tela cujo propósito é ser evidência.
 */
export default async function AuditoriaPage({
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
  const pagina = await lerPaginaTrilha(ctx, normalizarPagina(paginaBruta));

  return (
    <Stack gap="lg" como="main">
      <PageHeader
        breadcrumb={
          <Breadcrumb
            itens={[
              { rotulo: "Clínica", href: "/clinica" },
              { rotulo: "Trilha de Auditoria", atual: true },
            ]}
          />
        }
        title="Trilha de Auditoria"
        description="Registro de quem fez o quê na clínica. A trilha é imutável — ninguém, nem a coordenação, edita ou apaga uma linha — e guarda os últimos 180 dias (Marco Civil, Art. 15)."
      />
      <TrilhaTabela linhas={pagina.linhas} />
      <PaginacaoTrilha
        paginaAtual={pagina.paginaAtual}
        totalPaginas={totalDePaginas(pagina.total)}
        total={pagina.total}
      />
    </Stack>
  );
}
