import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { lerDadosClinica } from "./logic";
import { FormularioDadosClinica } from "./formulario-dados-clinica";

/**
 * #262 — dados fiscais/cadastrais da clínica. Coordenador-only: alimenta o
 * faturamento (cobranças e nota fiscal), não é configuração de terapeuta.
 */
export default async function DadosClinicaPage() {
  const ctx = await getTenantContext();
  try {
    requireRole(ctx, "coordenador");
  } catch {
    notFound();
  }

  const dados = await lerDadosClinica(ctx);

  return (
    <Stack gap="lg" como="main">
      <PageHeader
        breadcrumb={
          <Breadcrumb
            itens={[
              { rotulo: "Clínica", href: "/clinica" },
              { rotulo: "Dados da Clínica", atual: true },
            ]}
          />
        }
        title="Dados da Clínica"
        description="Cadastro fiscal da clínica — razão social, CPF/CNPJ, endereço e e-mail financeiro usados na cobrança e na nota fiscal."
      />
      <FormularioDadosClinica
        dados={dados}
        documentoTravado={dados.documentoTravado}
      />
    </Stack>
  );
}
