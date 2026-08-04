import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Retorno do pagamento",
};

/**
 * Retorno pós-checkout (`urlRetorno` da ativação, #36).
 *
 * A página é deliberadamente ignorante: quem confirma o pagamento é o webhook
 * do provedor, não este redirect. O provedor devolve o navegador para cá tanto
 * em pagamento aprovado quanto em Pix ainda não compensado ou cartão em
 * análise — então afirmar "pagamento aprovado" aqui seria inventar um fato que
 * a tela não tem como saber, e que pode ser desmentido minutos depois.
 */
export default function RetornoAssinaturaPage() {
  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        title="Recebemos seu pedido de pagamento"
        description="A confirmação vem do banco e pode levar alguns minutos."
      />

      <Alert severidade="info" titulo="Ainda estamos aguardando a confirmação">
        <p>
          Esta tela não consegue confirmar o pagamento — quem confirma é o
          provedor, e o aviso chega automaticamente para a Iris assim que o
          valor compensa. No Pix isso costuma ser rápido; no cartão, pode levar
          alguns minutos.
        </p>
        <p className="mt-2">
          Você não precisa pagar de novo nem ficar nesta página. Se já concluiu
          o pagamento, é só tentar cadastrar o paciente: quando a confirmação
          chegar, o cadastro passa direto.
        </p>
      </Alert>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-[var(--text-primary)] text-xl font-semibold">
          O que fazer agora
        </h2>
        <ul className="text-[var(--text-primary)] flex list-disc flex-col gap-2 pl-5 text-sm">
          <li>
            Tente cadastrar o paciente. Se a confirmação ainda não tiver
            chegado, a tela avisa e você tenta de novo em alguns minutos.
          </li>
          <li>
            Se o pagamento não tiver sido concluído, volte à tela de assinatura
            e refaça a ativação.
          </li>
        </ul>
        <div className="flex flex-wrap gap-3">
          <Link href="/pacientes/novo">
            <Button variante="primaria">Cadastrar paciente</Button>
          </Link>
          <Link href="/assinatura">
            <Button variante="secundaria">Voltar para a assinatura</Button>
          </Link>
        </div>
      </section>
    </main>
  );
}
