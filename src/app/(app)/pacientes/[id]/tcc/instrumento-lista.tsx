import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { derivarFaixaDeCorte } from "@/lib/tcc/faixa-de-corte";

/**
 * #393/T6 — lista texto de aplicações de instrumento na aba TCC. Decisão de
 * UX já fechada (design.md/spec.md RQ8): SEM gráfico de tendência, só texto
 * (data + escore + faixa de corte). Server Component (sem "use client"):
 * mesmo padrão do histórico de RPD em `page.tsx:83-195`, que também formata
 * `criadoEm` (Date, não ISO string) direto no server.
 *
 * O tipo da linha é inferido estruturalmente (não importa de
 * `instrumento-logic.ts`, que carrega `"server-only"` no topo — importar o
 * valor/tipo de lá quebraria testes de componente em jsdom). O shape aqui é
 * o subconjunto de colunas de `instrumentoAplicacao` (`schema.ts:2223-2258`)
 * que a UI realmente usa.
 */
export type InstrumentoAplicacaoLinha = {
  id: string;
  tipoInstrumento: "phq9" | "gad7";
  escoreTotal: number | null;
  criadoEm: Date | string;
};

const ROTULO_TIPO: Record<
  InstrumentoAplicacaoLinha["tipoInstrumento"],
  string
> = {
  phq9: "PHQ-9",
  gad7: "GAD-7",
};

/**
 * Os cortes moram em `@/lib/tcc/faixa-de-corte` desde a #464 — a projeção de
 * `historico_relevante` do modo TCC precisa da MESMA régua, e não pode
 * importar este `.tsx` (arrastaria a árvore de componentes de UI para o
 * caminho da extração). Reexportado aqui para não quebrar os importadores
 * existentes (`instrumento-lista.test.tsx`, `grafico-escore-instrumento`).
 */
export { derivarFaixaDeCorte };

function formatarData(valor: Date | string): string {
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime())
    ? String(valor)
    : d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
}

/**
 * Lista texto de aplicações de instrumento (PHQ-9/GAD-7) de um paciente,
 * mais recente primeiro (mesma ordenação de `obterInstrumentoAplicacoes`,
 * `instrumento-logic.ts:183-195`, `orderBy(desc(criadoEm))`). Zero
 * aplicações é estado válido, não erro (memória
 * `fila-validacao-lote-zero-elegiveis`) — mesmo padrão de empty-state de
 * `rpd-sugestoes.tsx:172-180`.
 */
export function InstrumentoLista({
  aplicacoes,
}: {
  aplicacoes: InstrumentoAplicacaoLinha[];
}) {
  if (aplicacoes.length === 0) {
    return (
      <EmptyState
        variant="compact"
        title="Nenhuma aplicação de instrumento registrada"
        description="Quando um PHQ-9 ou GAD-7 for aplicado e registrado, o histórico de escores aparece aqui."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead>Instrumento</TableHead>
          <TableHead>Escore</TableHead>
          <TableHead>Faixa</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {aplicacoes.map((a) => {
          const faixa = derivarFaixaDeCorte(a.tipoInstrumento, a.escoreTotal);
          return (
            <TableRow key={a.id}>
              <TableCell>{formatarData(a.criadoEm)}</TableCell>
              <TableCell>{ROTULO_TIPO[a.tipoInstrumento]}</TableCell>
              <TableCell>{a.escoreTotal ?? "—"}</TableCell>
              <TableCell>{faixa ?? "—"}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
