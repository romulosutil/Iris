import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/patterns/status-badge";
import { formatarBRL } from "@/lib/billing/calculator";
import { ROTULOS_CICLO } from "@/lib/billing/rotulos-ciclo";
import type { CicloDoHistorico } from "./queries";

/**
 * Datas em UTC de propósito: o ciclo é gravado em `timestamptz` e a fronteira
 * dele é o instante, não o dia local de quem olha. Renderizar no fuso do
 * navegador faria o mesmo ciclo aparecer com data diferente em duas máquinas da
 * mesma clínica.
 */
const formatador = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

function dataOuTravessao(d: Date | null): string {
  return d ? formatador.format(d) : "—";
}

/**
 * Só HTTPS vira link. O valor vem de resposta HTTP de terceiro e vai parar num
 * `href` que a clínica clica; a checagem existe para que uma mudança do lado do
 * gateway — ou uma linha corrompida — não vire destino inesperado a partir de
 * dentro do produto.
 */
function faturaSegura(url: string | null): string | null {
  return url?.startsWith("https://") ? url : null;
}

export interface HistoricoCobrancasProps {
  ciclos: CicloDoHistorico[];
}

export function HistoricoCobrancas({ ciclos }: HistoricoCobrancasProps) {
  if (ciclos.length === 0) {
    return (
      <EmptyState
        title="Nenhuma cobrança fechada ainda"
        description="A primeira fatura nasce quando o ciclo corrente fechar. Até lá não há nada a pagar — e nada some daqui depois."
      />
    );
  }

  return (
    <Table>
      <TableCaption>
        Cada linha é um ciclo já encerrado. O valor é o das fichas que tiveram
        movimento naquele período.
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Período</TableHead>
          <TableHead scope="col">Fichas ativas</TableHead>
          <TableHead scope="col">Valor</TableHead>
          <TableHead scope="col">Situação</TableHead>
          <TableHead scope="col">Vencimento</TableHead>
          <TableHead scope="col">Fatura</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ciclos.map((ciclo) => {
          const { rotulo, variante } = ROTULOS_CICLO[ciclo.status];
          const fatura = faturaSegura(ciclo.invoiceUrl);
          return (
            <TableRow key={ciclo.id}>
              <TableCell className="whitespace-nowrap">
                {formatador.format(ciclo.inicio)} a{" "}
                {formatador.format(ciclo.fim)}
              </TableCell>
              <TableCell className="font-mono">
                {ciclo.pacientesContados}
              </TableCell>
              <TableCell className="font-mono font-semibold">
                {formatarBRL(ciclo.valorCentavos)}
              </TableCell>
              <TableCell>
                <StatusBadge variante={variante}>{rotulo}</StatusBadge>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {dataOuTravessao(ciclo.vencimentoCobranca)}
              </TableCell>
              <TableCell>
                {fatura ? (
                  <a
                    href={fatura}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4 hover:no-underline"
                  >
                    Ver fatura
                    {/* Quatro links "Ver fatura" numa tabela são quatro
                        destinos indistinguíveis na lista de links do leitor de
                        tela. O período completa o nome acessível sem poluir o
                        visual. */}
                    <span className="sr-only">
                      {" "}
                      do ciclo de {formatador.format(ciclo.inicio)} a{" "}
                      {formatador.format(ciclo.fim)}
                    </span>
                  </a>
                ) : (
                  "—"
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
