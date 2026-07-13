import Link from "next/link";
import { Stack, Split } from "@/components/ui/layout";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { ItemPendente } from "./item-pendente";
import type {
  CapturaAConsolidar,
  ExtracaoPendente,
  ListaPendencias,
  SugestaoDemo,
} from "./queries";

// Mesma superfície visual do `Button` (variante primária, risco baixo), mas
// como link de navegação — a ação aqui é ir para a tela da sessão, não
// disparar uma Server Action, então um `<a>` é o elemento semanticamente
// correto (evita botão aninhado dentro de âncora).
const acaoClasses = cn(
  "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center px-5 py-2.5",
  "font-display text-base font-semibold",
  "border-ink-anchor bg-gold text-ink-anchor border-2 shadow-[var(--ds-shadow)]",
  "transition-[transform,box-shadow] duration-100 ease-out",
  "hover:-translate-x-px hover:-translate-y-px",
  "active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
  "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]",
);

function ItemCaptura({ item }: { item: CapturaAConsolidar }) {
  return (
    <Card estado="conquistado" titulo="Captura rápida sem nota consolidada">
      <Split alinha="center">
        <span className="text-ink text-base">
          {item.pacienteNome ?? "Paciente (acesso restrito)"}
        </span>
        <Link href={`/diario/${item.sessionId}`} className={acaoClasses}>
          Consolidar →
        </Link>
      </Split>
    </Card>
  );
}

function ItemExtracao({
  item,
  titulo,
  estado,
  destino,
}: {
  item: ExtracaoPendente | SugestaoDemo;
  titulo: string;
  estado: "conquistado" | "candidato";
  /** Rota da ação: sugestões vão para a revisão; pendências, para o diário. */
  destino: "revisao" | "diario";
}) {
  return (
    <Card estado={estado} titulo={titulo}>
      <Split alinha="center">
        <span className="text-ink text-base">
          {item.pacienteNome ?? "Paciente (acesso restrito)"} ·{" "}
          <span className="text-graphite">{item.subtipo}</span>
        </span>
        <Link href={`/${destino}/${item.sessionId}`} className={acaoClasses}>
          Revisar →
        </Link>
      </Split>
    </Card>
  );
}

/**
 * Componente puramente apresentacional — recebe o resultado já pronto de
 * `listarPendencias` e desenha a fila. Nenhum acesso a banco aqui (mantém a
 * página Server Component fina e permite testar a11y sem mockar `@/db/*`).
 */
export function PendenciasList({
  capturasAConsolidar,
  extracaoPendente,
  sugestoesDemo,
  total,
}: ListaPendencias) {
  if (total === 0) {
    return (
      <p className="text-ink border-ink-anchor bg-surface border-2 border-dashed p-6">
        Dia limpo — nenhuma captura, extração ou sugestão pendente.
      </p>
    );
  }

  return (
    <>
      {capturasAConsolidar.length > 0 ? (
        <Stack gap="md" como="section" aria-labelledby="capturas-titulo">
          <h2
            id="capturas-titulo"
            className="font-display text-ink-anchor text-2xl font-bold"
          >
            Capturas a consolidar
          </h2>
          <Stack gap="md" como="ul">
            {capturasAConsolidar.map((item) => (
              <li key={item.sessionId}>
                <ItemCaptura item={item} />
              </li>
            ))}
          </Stack>
        </Stack>
      ) : null}

      {extracaoPendente.length > 0 ? (
        <Stack gap="md" como="section" aria-labelledby="extracao-titulo">
          <h2
            id="extracao-titulo"
            className="font-display text-ink-anchor text-2xl font-bold"
          >
            Extração pendente de reprocessamento
          </h2>
          <Stack gap="md" como="ul">
            {extracaoPendente.map((item) => (
              <li key={item.id}>
                <ItemPendente item={item} />
              </li>
            ))}
          </Stack>
        </Stack>
      ) : null}

      {sugestoesDemo.length > 0 ? (
        <Stack gap="md" como="section" aria-labelledby="sugestoes-titulo">
          <h2
            id="sugestoes-titulo"
            className="font-display text-ink-anchor text-2xl font-bold"
          >
            Sugestões da IA (candidatas)
          </h2>
          <Stack gap="md" como="ul">
            {sugestoesDemo.map((item) => (
              <li key={item.id}>
                <ItemExtracao
                  item={item}
                  titulo="Sugestão da IA — a confirmar"
                  estado="candidato"
                  destino="revisao"
                />
              </li>
            ))}
          </Stack>
        </Stack>
      ) : null}
    </>
  );
}
