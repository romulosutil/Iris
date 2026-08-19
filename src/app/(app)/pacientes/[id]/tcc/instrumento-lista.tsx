import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

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

const ROTULO_TIPO: Record<InstrumentoAplicacaoLinha["tipoInstrumento"], string> =
  {
    phq9: "PHQ-9",
    gad7: "GAD-7",
  };

/**
 * Cortes públicos/estrutura confirmada, não conteúdo licenciado (spec.md
 * RQ8 + Invariantes: "estrutura numérica... pode ser hardcoded — só o TEXTO
 * dos itens é gated"). PHQ-9 (0-27) e GAD-7 (0-21) têm faixas diferentes;
 * GAD-7 não tem a banda "moderadamente grave" (só 4 faixas, não 5).
 *
 * Boundaries são inclusivos no limite inferior de cada faixa (>=), testados
 * nos dois lados (ex.: PHQ-9 4 vs. 5) — off-by-one é o bug clássico aqui.
 */
const CORTES_PHQ9 = [
  { min: 0, rotulo: "mínimo" },
  { min: 5, rotulo: "leve" },
  { min: 10, rotulo: "moderado" },
  { min: 15, rotulo: "moderadamente grave" },
  { min: 20, rotulo: "grave" },
] as const;

const CORTES_GAD7 = [
  { min: 0, rotulo: "mínimo" },
  { min: 5, rotulo: "leve" },
  { min: 10, rotulo: "moderado" },
  { min: 15, rotulo: "grave" },
] as const;

/**
 * Deriva a faixa de corte (label) a partir do tipo de instrumento e do
 * escore total. Função pura, testável isoladamente (sem render) — ver
 * `instrumento-lista.test.tsx`. `escoreTotal === null` (não deveria
 * acontecer em produção, coluna é preenchida no INSERT — mas o tipo da
 * coluna no schema é nullable) retorna `null` em vez de estourar.
 */
export function derivarFaixaDeCorte(
  tipoInstrumento: InstrumentoAplicacaoLinha["tipoInstrumento"],
  escoreTotal: number | null,
): string | null {
  if (escoreTotal === null) return null;
  const cortes = tipoInstrumento === "phq9" ? CORTES_PHQ9 : CORTES_GAD7;
  // Percorre de trás para frente: primeiro corte cujo `min` o escore atinge.
  for (let i = cortes.length - 1; i >= 0; i -= 1) {
    if (escoreTotal >= cortes[i]!.min) return cortes[i]!.rotulo;
  }
  return cortes[0]!.rotulo;
}

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
