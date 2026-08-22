import "server-only";
import { sql } from "drizzle-orm";
import { getTenantContext } from "@/auth/tenant";
import { withTenant } from "@/db/rls";
import { Container } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { Banner } from "@/components/ui/banner";
import { obterHistoricoExportacoes } from "@/lib/export/acervo/motor";
import { ExportacaoView } from "./exportacao-view";

export const dynamic = "force-dynamic";

export default async function ExportacaoAcervoPage() {
  const ctx = await getTenantContext();

  // 1. Gate D1: Responsável da Conta
  const { clinicaNome, isResponsavel } = await withTenant(ctx, async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT nome, responsavel_conta_id FROM clinic WHERE id = ${ctx.clinicId}
    `)) as unknown as { nome: string; responsavel_conta_id: string | null }[];

    const c = rows[0];
    const nome = c?.nome ?? "Clínica";
    const responsavelId = c?.responsavel_conta_id;

    const responsavel =
      responsavelId === ctx.userId ||
      (responsavelId === null && ctx.role === "coordenador");

    return {
      clinicaNome: nome,
      isResponsavel: responsavel,
    };
  });

  if (!isResponsavel) {
    return (
      <Container largura="md" className="py-8">
        <PageHeader
          title="Exportação do Acervo"
          description="Exportação integral de prontuários e relatórios clínicos."
        />
        <Banner variant="alerta" titulo="Acesso Restrito">
          Apenas o responsável pela conta da clínica possui autorização para
          solicitar ou baixar a exportação integral do acervo.
        </Banner>
      </Container>
    );
  }

  // 2. Busca estado inicial no servidor (D9 / AGENTS.md §5.2)
  const { ativo, historico } = await obterHistoricoExportacoes(
    ctx.clinicId,
    ctx.userId,
    ctx.role,
  );

  return (
    <Container largura="md" className="py-8">
      <PageHeader
        title="Exportação do Acervo"
        description={`Exportação integral e portabilidade de dados da clínica ${clinicaNome} (LGPD Art. 18).`}
      />

      <ExportacaoView
        initialAtivo={ativo}
        initialHistorico={historico}
        clinicNome={clinicaNome}
      />
    </Container>
  );
}
