import Link from "next/link";
import { getTenantContext } from "@/auth/tenant";
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
import {
  FAIXAS_PRECIFICACAO,
  VALOR_PRIMEIRO_PACIENTE_CENTAVOS,
  formatarBRL,
} from "@/lib/billing/calculator";
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
          ? `${de}º paciente em diante`
          : `${de}º ao ${faixa.ateQuantidade}º paciente`,
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

  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        title="Assinatura"
        description="Você só paga quando começa a atender: a cobrança nasce no cadastro do primeiro paciente."
      />

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-[var(--text-primary)] text-xl font-semibold">
          Como funciona a cobrança
        </h2>
        <ul className="text-[var(--text-primary)] flex list-disc flex-col gap-2 pl-5 text-sm">
          <li>
            Configurar a clínica, a equipe e a agenda é gratuito. Nada é cobrado
            durante o onboarding.
          </li>
          <li>
            Para liberar o primeiro paciente, o mês 1 custa{" "}
            <strong>{formatarBRL(VALOR_PRIMEIRO_PACIENTE_CENTAVOS)}</strong>.
          </li>
          <li>
            Depois disso, uma única cobrança consolidada a cada 30 dias, pelo
            número de pacientes ativos no período.
          </li>
          <li>
            As faixas são <strong>marginais</strong>: cadastrar mais um paciente
            nunca reprecifica os que já estavam lá — só o paciente novo entra na
            faixa seguinte.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-[var(--text-primary)] text-xl font-semibold">
          Preço por paciente ativo, por mês
        </h2>
        <Table>
          <TableCaption>
            Valores marginais: cada paciente é cobrado pela faixa em que ele
            entra, não pela faixa do total.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Faixa</TableHead>
              <TableHead scope="col">Valor por paciente/mês</TableHead>
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
        <h2 className="font-display text-[var(--text-primary)] text-xl font-semibold">
          Ativar a assinatura
        </h2>
        {podeContratar ? (
          <FormularioAtivacao />
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

// Importado no fim para manter o topo do arquivo legível; é o Client Component
// que fala com a server action.
import { FormularioAtivacao as FormularioAtivacaoSlot } from "./formulario-ativacao";
