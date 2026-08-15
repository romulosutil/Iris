import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { mensagemDeEstado } from "@/lib/billing/estado-conta";
import { ativarEhASaida } from "@/lib/billing/estado-conta-ui";
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
          cobrado agora e você não precisa de cartão. Seus dados e prontuários
          continuam sempre acessíveis para leitura e exportação ao fim do teste.
        </Alert>
      ) : null}
      {/* Conta bloqueada avisa ANTES do formulário, não depois de dez campos
          preenchidos: o submit já é defendido em `logic.ts` (essa defesa
          permanece intacta — este aviso é informação, nunca a barreira). */}
      {!situacao.podeCadastrarPaciente ? (
        <Alert severidade="erro" destacado titulo="Conta em somente-leitura">
          <p>{mensagemDeEstado(situacao.estado, situacao.debitoCentavos)}</p>
          {/* Mesmo critério do formulário, pelo mesmo predicado: em
              `pagamento_em_processamento` há cobrança em voo e o link geraria
              uma segunda cobrança no mesmo mês. */}
          {ativarEhASaida(situacao.estado) ? (
            <p className="mt-2">
              <Link
                href="/assinatura"
                className="font-semibold underline underline-offset-4"
              >
                Ativar a assinatura
              </Link>
            </p>
          ) : null}
        </Alert>
      ) : null}
      <NovoPacienteForm />
    </div>
  );
}
