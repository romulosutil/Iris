import { getTenantContext } from "@/auth/tenant";
import { Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { carregarPosturaSeguranca } from "./queries";
import { PosturaEquipe } from "./postura-equipe";

/**
 * #277 — estado de ativação do segundo fator da equipe. Coordenador-only pelo
 * layout de `/clinica`.
 *
 * A leitura NÃO é envolvida em try/catch: uma tela de postura de segurança que
 * renderiza "tudo certo" porque a query estourou afirma algo falso. A exceção
 * sobe para o `error.tsx` do App Router.
 */
export default async function SegurancaPage() {
  const ctx = await getTenantContext();
  const postura = await carregarPosturaSeguranca(ctx);

  return (
    <Stack gap="lg" como="main">
      <PageHeader
        breadcrumb={
          <Breadcrumb
            itens={[
              { rotulo: "Clínica", href: "/clinica" },
              { rotulo: "Segurança", atual: true },
            ]}
          />
        }
        title="Segurança & Governança"
        description="Estado de ativação do segundo fator entre os membros desta clínica."
      />
      <PosturaEquipe postura={postura} />
    </Stack>
  );
}
