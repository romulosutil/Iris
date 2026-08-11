import Link from "next/link";
import { eq } from "drizzle-orm";
import { getTenantContext } from "@/auth/tenant";
import { withTenant } from "@/db/rls";
import { clinic } from "@/db/schema";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FAIXAS_PRECIFICACAO, formatarBRL } from "@/lib/billing/calculator";
import { FormularioAtivacao } from "./formulario-ativacao";

export const metadata = {
  title: "Assinatura",
};

/**
 * Rótulo da faixa a partir da lista de preços — nunca digitado à mão. Se uma
 * faixa mudar em `FAIXAS_PRECIFICACAO`, a tabela da tela acompanha; preço
 * duplicado em JSX é preço que descola do que é cobrado.
 */
function faixasParaLinhas() {
  let anterior = 0;
  return FAIXAS_PRECIFICACAO.map((faixa) => {
    const de = anterior + 1;
    const linha = {
      chave: `${de}-${faixa.ateQuantidade ?? "mais"}`,
      intervalo:
        faixa.ateQuantidade === null
          ? `${de}ª ficha ativa em diante`
          : `${de}ª à ${faixa.ateQuantidade}ª ficha ativa`,
      valor: formatarBRL(faixa.valorCentavos),
    };
    anterior = faixa.ateQuantidade ?? anterior;
    return linha;
  });
}

export default async function AssinaturaPage() {
  const ctx = await getTenantContext();
  // Sem `notFound()` para os demais papéis: a recepção é justamente quem
  // esbarra no bloqueio ao cadastrar o 1º paciente e é mandada para cá. Uma
  // tela 404 esconderia o motivo; a tela explica quem pode contratar.
  const podeContratar = ctx.role === "coordenador";
  const linhas = faixasParaLinhas();

  // Só quem vê o formulário precisa do documento — evita uma ida ao banco na
  // renderização de quem não pode contratar. A leitura sai por `withTenant`
  // (`app_role`, RLS ativa): `clinic.cpf_cnpj` tem SELECT de coluna concedido
  // na 0090; a ESCRITA continua sendo exclusiva da função SECURITY DEFINER.
  const documentoAtual = podeContratar
    ? ((
        await withTenant(ctx, (tx) =>
          tx
            .select({ cpfCnpj: clinic.cpfCnpj })
            .from(clinic)
            .where(eq(clinic.id, ctx.clinicId))
            .limit(1),
        )
      )[0]?.cpfCnpj ?? null)
    : null;

  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        title="Assinatura"
        description="Você só paga quando começa a atender: a fatura é do ciclo que já fechou, pelas fichas que tiveram movimento nele."
      />

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold text-[var(--text-primary)]">
          Como funciona a cobrança
        </h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-[var(--text-primary)]">
          <li>
            Configurar a clínica, a equipe e a agenda é gratuito. Nada é cobrado
            durante o onboarding.
          </li>
          <li>
            Ativar a assinatura <strong>não cobra mensalidade</strong>: registra
            o meio de pagamento e libera o cadastro de pacientes. A primeira
            cobrança pelas fichas ativas só nasce quando o primeiro ciclo fecha.
            No Pix Automático, o banco exige um pagamento mínimo para registrar
            a autorização — o valor exato aparece na tela, antes do QR Code.
          </li>
          <li>
            A partir daí, uma única cobrança consolidada a cada 30 dias, pelo
            número de <strong>fichas ativas</strong> do ciclo que acabou de
            fechar. Ficha ativa é a que foi cadastrada dentro do ciclo ou teve
            interação registrada nele: sessão agendada, check-in, evolução no
            prontuário ou evidência aprovada.
          </li>
          <li>
            Ficha sem movimento não é cobrada. Um ciclo inteiro sem cadastro
            novo, sessão, check-in ou evolução fecha em{" "}
            <strong>{formatarBRL(0)}</strong>, e a base de pacientes continua
            inteira e legível.
          </li>
          <li>
            As faixas são <strong>marginais</strong>: uma ficha ativa a mais
            nunca reprecifica as que já estavam lá. Só a ficha nova entra na
            faixa seguinte.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold text-[var(--text-primary)]">
          Preço por ficha ativa, por mês
        </h2>
        <Table>
          <TableCaption>
            Valores marginais: cada ficha é cobrada pela faixa em que ela entra,
            não pela faixa do total.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Faixa</TableHead>
              <TableHead scope="col">Valor por ficha/mês</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((linha) => (
              <TableRow key={linha.chave}>
                <TableCell>{linha.intervalo}</TableCell>
                <TableCell className="font-mono font-semibold">
                  {linha.valor}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold text-[var(--text-primary)]">
          Ativar a assinatura
        </h2>
        {podeContratar ? (
          <FormularioAtivacao documentoAtual={documentoAtual} />
        ) : (
          <>
            <Alert severidade="info" titulo="Só a coordenação contrata">
              Quem assume a assinatura em nome da clínica é o coordenador. Peça
              a ele para abrir esta tela e concluir a ativação — o cadastro de
              pacientes é liberado logo depois.
            </Alert>
            <div>
              <Link href="/pacientes">
                <Button variante="terciaria">Voltar para pacientes</Button>
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
