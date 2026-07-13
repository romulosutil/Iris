import Link from "next/link";
import { Stack, Split } from "@/components/ui/layout";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { control, surface } from "@/components/ui/primitives/surface";
import { cn } from "@/lib/cn";
import { ItemPendente } from "./item-pendente";
import type {
  CapturaAConsolidar,
  ExtracaoPendente,
  ListaPendencias,
  SugestaoDemo,
} from "./queries";
 
// correto (evita botão aninhado dentro de âncora).
const acaoClasses = cn(
  control("sm"),
  surface("solida"),
  "inline-flex shrink-0 items-center justify-center px-5 py-2.5",
  "bg-gold text-ink-anchor font-display text-base font-semibold",
  "transition-[transform,box-shadow,background-color] duration-100 ease-out",
  "hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]",
  "active:translate-x-0 active:translate-y-0 active:shadow-none",
  "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]",
);
 
function ItemCaptura({ item }: { item: CapturaAConsolidar }) {
  return (
    <Card estado="conquistado" destacado={true} titulo="Captura rápida sem nota consolidada">
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
      <Stack className="animate-fade-in-up animate-delay-75 py-4 md:py-8">
        <Alert severidade="info" destacado>
          Dia limpo — nenhuma captura, extração ou sugestão pendente.
        </Alert>
      </Stack>
    );
  }
 
  return (
    <Stack gap="lg" className="animate-fade-in-up animate-delay-75">
      {capturasAConsolidar.length > 0 ? (
        <Stack gap="md" como="section" aria-labelledby="capturas-titulo" className="animate-fade-in-up animate-delay-75">
          <h2
            id="capturas-titulo"
            className="font-display text-ink-anchor text-2xl font-bold"
          >
            Capturas a consolidar
          </h2>
          <Stack gap="md" como="ul">
            {capturasAConsolidar.map((item, idx) => (
              <li
                key={item.sessionId}
                className={cn(
                  "animate-fade-in-up",
                  idx === 0 && "animate-delay-75",
                  idx === 1 && "animate-delay-150",
                  idx >= 2 && "animate-delay-225"
                )}
              >
                <ItemCaptura item={item} />
              </li>
            ))}
          </Stack>
        </Stack>
      ) : null}
 
      {extracaoPendente.length > 0 ? (
        <Stack
          gap="md"
          como="section"
          aria-labelledby="extracao-titulo"
          className="animate-fade-in-up animate-delay-150 pt-6 border-t-2 border-dashed border-graphite"
        >
          <h2
            id="extracao-titulo"
            className="font-display text-ink-anchor text-2xl font-bold"
          >
            Extração pendente de reprocessamento
          </h2>
          <Stack gap="md" como="ul">
            {extracaoPendente.map((item, idx) => (
              <li
                key={item.id}
                className={cn(
                  "animate-fade-in-up",
                  idx === 0 && "animate-delay-75",
                  idx === 1 && "animate-delay-150",
                  idx >= 2 && "animate-delay-225"
                )}
              >
                <ItemPendente item={item} />
              </li>
            ))}
          </Stack>
        </Stack>
      ) : null}
 
      {sugestoesDemo.length > 0 ? (
        <Stack
          gap="md"
          como="section"
          aria-labelledby="sugestoes-titulo"
          className="animate-fade-in-up animate-delay-225 pt-6 border-t-2 border-dashed border-graphite"
        >
          <h2
            id="sugestoes-titulo"
            className="font-display text-ink-anchor text-2xl font-bold"
          >
            Sugestões da IA (candidatas)
          </h2>
          <Stack gap="md" como="ul">
            {sugestoesDemo.map((item, idx) => (
              <li
                key={item.id}
                className={cn(
                  "animate-fade-in-up",
                  idx === 0 && "animate-delay-75",
                  idx === 1 && "animate-delay-150",
                  idx >= 2 && "animate-delay-225"
                )}
              >
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
    </Stack>
  );
}
