import { Card } from "@/components/ui/card";
import { DataRow } from "@/components/ui/data-row";
import { StatusBadge } from "@/components/ui/patterns/status-badge";
import { formatarBRL } from "@/lib/billing/calculator";
import { ROTULOS_ASSINATURA } from "@/lib/billing/rotulos-assinatura";
import type { CicloCorrente } from "./queries";

/**
 * Datas em UTC de propósito: a fronteira do ciclo é gravada em `timestamptz` e
 * é um INSTANTE, não o dia local de quem olha. Renderizar no fuso do navegador
 * faria o mesmo ciclo aparecer com data diferente em duas máquinas da mesma
 * clínica. Mesmo argumento de `historico-cobrancas.tsx`.
 *
 * O prazo da carência, no bloco B2, é o contrário: dia CIVIL no fuso da
 * clínica. São medidas diferentes, não uma inconsistência.
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

export interface CartaoAssinaturaProps {
  ciclo: CicloCorrente | null;
  /** `SituacaoConta.debitoCentavos`: soma dos ciclos em `devido`. */
  debitoCentavos: number;
}

/**
 * O cartão "Sua assinatura" (#36, bloco B1).
 *
 * Some inteiro para quem nunca contratou (`null` ou `free_tier`): a tela desses
 * é a tabela de preços mais o formulário, e um cartão dizendo "sem assinatura"
 * só empurraria a ação para baixo.
 *
 * ## O que este cartão NÃO mostra, e por quê
 *
 * Fichas ativas acumuladas e valor projetado do ciclo corrente ficaram de fora
 * de propósito. `billing_apurar_ciclo` (0075) ESCREVE — apaga e reinsere
 * `billing_cycle_patient`, carimba `apurado_em` e move o status para `apurado`
 * — e o `GRANT EXECUTE` dela é só de `iris_auth`, então nem executável daqui
 * ela é. Replicar o predicado dela sob `app_role` subconta, porque
 * `session_note_select` passa por `app_session_conteudo_visivel` (0123) e
 * esconde do coordenador a nota sob sigilo de disciplina: o número na tela
 * divergiria da fatura justamente para quem usa sigilo. A projeção sai por uma
 * função read-only SECURITY DEFINER, em spec própria — não daqui.
 */
export function CartaoAssinatura({
  ciclo,
  debitoCentavos,
}: CartaoAssinaturaProps) {
  if (!ciclo || ciclo.statusAssinatura === "free_tier") return null;

  const { rotulo, variante } = ROTULOS_ASSINATURA[ciclo.statusAssinatura];
  const periodo =
    ciclo.cicloAtualInicio && ciclo.cicloAtualFim
      ? `${formatador.format(ciclo.cicloAtualInicio)} a ${formatador.format(ciclo.cicloAtualFim)}`
      : "—";

  return (
    <Card titulo="Sua assinatura">
      <div className="flex flex-col gap-1">
        <DataRow
          title="Situação"
          trailing={<StatusBadge variante={variante}>{rotulo}</StatusBadge>}
        />
        <DataRow
          title="Ciclo corrente"
          subtitle="Período que está sendo medido agora."
          trailing={<span className="font-mono">{periodo}</span>}
        />
        <DataRow
          title="Próximo fechamento"
          subtitle="Dia em que a fatura deste ciclo nasce."
          trailing={
            <span className="font-mono">
              {dataOuTravessao(ciclo.cicloAtualFim)}
            </span>
          }
        />
        <DataRow
          title="Ativa desde"
          trailing={
            <span className="font-mono">
              {dataOuTravessao(ciclo.ativadaEm)}
            </span>
          }
        />
        {debitoCentavos > 0 ? (
          <DataRow
            title="Débito em aberto"
            subtitle="De ciclo já encerrado e ainda não pago."
            trailing={
              <span className="font-mono font-semibold">
                {formatarBRL(debitoCentavos)}
              </span>
            }
          />
        ) : null}
      </div>
      <p className="mt-3 text-sm text-[var(--text-secondary)]">
        O valor deste ciclo só é fechado quando o ciclo fecha: ele depende de
        quantas fichas tiveram movimento até o último dia. Cada fatura já
        emitida está no histórico de cobranças, abaixo.
      </p>
    </Card>
  );
}
