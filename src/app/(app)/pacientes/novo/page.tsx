import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Alert } from "@/components/ui/alert";
import { obterSituacaoConta } from "../../queries";
import { NovoPacienteForm } from "./novo-paciente-form";

export default async function NovoPacientePage() {
  const ctx = await getTenantContext();
  try {
    requireRole(ctx, "admin_recepcao", "coordenador");
  } catch {
    notFound();
  }
  // O pecado da versão anterior era a PRIMEIRA menção a preço ser uma mensagem
  // de erro, depois de dez campos preenchidos. Dizer aqui, antes do formulário,
  // o que o cadastro dispara é o que transforma cobrança em contrato claro.
  const situacao = await obterSituacaoConta(ctx);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={
          <Breadcrumb
            itens={[
              { rotulo: "Pacientes", href: "/pacientes" },
              { rotulo: "Novo paciente", atual: true },
            ]}
          />
        }
        title="Novo paciente"
        description="Cadastro administrativo de paciente"
      />
      {situacao.estado === "trial_aguardando" ? (
        <Alert severidade="info" titulo="Seu período de teste começa aqui">
          Cadastrar o primeiro paciente inicia seus 7 dias de teste. Nada é
          cobrado agora e você não precisa de cartão.
        </Alert>
      ) : null}
      <NovoPacienteForm />
    </div>
  );
}
