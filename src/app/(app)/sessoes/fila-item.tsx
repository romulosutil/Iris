import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Stack } from "@/components/ui/layout";
import type { SessaoTravada } from "@/lib/sessao/fila";
import { ROTULO_ESTADO, ROTULO_MOTIVO } from "./[id]/timeline";

/**
 * Item da fila `/sessoes` (#512 · T04 · R-17, R-18, R-31, R-32).
 *
 * Todo item que chega aqui já é `precisa_atencao` — `contarTravadas`/
 * `listarTravadas` (T02) só devolvem sessão nesse estado (ver comentário em
 * `@/lib/sessao/fila`, `coletarTravadas`). Por isso o selo de estado é sempre
 * `ROTULO_ESTADO.precisa_atencao`, importado de `./[id]/timeline` — mesma
 * regra do T06: o vocabulário vem de `estado.ts`/`timeline.tsx`, nunca é
 * redefinido aqui (R-05).
 */

type ItemFilaDado = Pick<SessaoTravada, "motivo" | "itensNaFilaValidacao">;

/**
 * Custo declarado do gesto (R-17). Decisão desta task, documentada porque não
 * há medição real no repo:
 *   - `extracao_travada` dispara um job (reprocessamento), não pede leitura
 *     humana → sempre "instantâneo".
 *   - `sem_nota_apos_24h` é sempre a mesma estimativa fixa (documentar não
 *     escala com nenhuma contagem disponível aqui).
 *   - `na_fila_validacao` escala com `itensNaFilaValidacao`. A fórmula
 *     (`minutos = n + 1`) foi calibrada para bater o exemplo literal do brief
 *     ("Revisar 3 evidências · ~4 min") — é estimativa, não medição; se um
 *     dado real de tempo de revisão aparecer, troca aqui, num lugar só.
 */
export function custoItemFila(item: ItemFilaDado): string {
  switch (item.motivo) {
    case "extracao_travada":
      return "Reprocessar · instantâneo";
    case "sem_nota_apos_24h":
      return "Documentar · ~5 min";
    case "na_fila_validacao": {
      const n = item.itensNaFilaValidacao;
      const minutos = n + 1;
      const evidencias = n === 1 ? "1 evidência" : `${n} evidências`;
      return `Revisar ${evidencias} · ~${minutos} min`;
    }
  }
}

/**
 * Linha de dívida ao lado do selo de estado (R-18): "Documentada · 3
 * evidências esperando você" é o exemplo do brief — aqui o selo é sempre
 * "Precisa de atenção" (ver nota acima), então a dívida é o que muda por
 * item. `na_fila_validacao` declara a contagem (o número que fez a sessão
 * travar); os outros dois motivos reusam `ROTULO_MOTIVO` (T01/T06) — nenhum
 * texto de motivo é redefinido aqui.
 */
export function dividaItemFila(item: ItemFilaDado): string {
  if (item.motivo === "na_fila_validacao") {
    const n = item.itensNaFilaValidacao;
    return n === 1
      ? "1 evidência esperando você"
      : `${n} evidências esperando você`;
  }
  return ROTULO_MOTIVO[item.motivo];
}

export function ItemFila({ item }: { item: SessaoTravada }) {
  return (
    <Link
      href={`/sessoes/${item.sessionId}`}
      className="block rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4 hover:bg-[var(--surface-hover)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display font-semibold text-[var(--text-primary)]">
          {item.patientNome ?? "Paciente (acesso restrito)"}
        </p>
        {/* R-18: o selo NUNCA aparece sem a linha de dívida logo abaixo. */}
        <span className="font-display rounded-[var(--radius-xs)] border-2 border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-3 py-1 text-xs font-semibold text-[var(--status-warning-fg)]">
          {ROTULO_ESTADO.precisa_atencao}
        </span>
      </div>
      <p className="text-sm text-[var(--text-secondary)]">
        {item.terapeutaNome ?? "Terapeuta"} · {dividaItemFila(item)}
      </p>
      {/* R-17: custo declarado, separado da dívida — dívida diz o que falta,
       * custo diz quanto vai custar resolver. */}
      <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
        {custoItemFila(item)}
      </p>
    </Link>
  );
}

/**
 * Lista/empty-state da fila (R-31 "default"/"vazio", R-32, R-33).
 *
 * R-32: decide pelo ARRAY real de itens (`itens.length === 0`), nunca por um
 * booleano `vazio` calculado em outro módulo — é a mesma classe de defeito
 * documentada na memória do repo `erro-renderizado-como-empty-state`: um
 * `catch { setState(null) }` (ou, aqui, um `vazio` que divergisse do array)
 * faria uma falha real parecer "Nada travado". Como cada item que chega aqui
 * já é `precisa_atencao` (T02), uma sessão com extração travada nunca é
 * confundida com fila vazia: ela é, ela mesma, a prova de que a fila não está
 * vazia.
 */
export function FilaLista({
  itens,
  vazioTexto,
}: {
  itens: readonly SessaoTravada[];
  vazioTexto: string | null;
}) {
  if (itens.length === 0) {
    return (
      <Alert severidade="sucesso" titulo="Nada travado" destacado>
        {vazioTexto ?? "Nada travado por aqui."}
      </Alert>
    );
  }

  return (
    <Stack gap="sm">
      {itens.map((item) => (
        <ItemFila key={item.sessionId} item={item} />
      ))}
    </Stack>
  );
}
