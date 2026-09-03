import { Pill } from "@/components/ui/primitives/pill";

/** Estados devolvidos por `calcularStatusTrial` em `(admin)/benjamin/queries.ts`. */
export type StatusClinica =
  "isenta" | "trial" | "ativa" | "inadimplente" | "cancelada";

/**
 * Mapeia o status comercial da clínica para o esquema semântico do DS. É o
 * MESMO mapa nas duas telas que exibem status (visão geral e gestão de
 * clínicas) — antes cada uma repetia a própria escada de ternários com paleta
 * crua, e as duas já divergiam em detalhe.
 *
 * `violeta` fica de fora de propósito: no Espectro Brutal ele significa
 * "sugerido pela IA", e status de assinatura é fato administrativo.
 */
const esquema: Record<
  StatusClinica,
  "menta" | "ouro" | "azul" | "coral" | "neutral"
> = {
  ativa: "menta",
  trial: "ouro",
  isenta: "azul",
  inadimplente: "coral",
  cancelada: "coral",
};

/**
 * Selo de status da clínica. O rótulo carrega o significado por extenso — a
 * cor é reforço, nunca o único canal (§4C do DS).
 *
 * `variant="outline"` porque estes selos aparecem repetidos linha a linha numa
 * tabela densa: o preenchimento sólido com borda âncora empasta a leitura da
 * coluna. Nos KPIs, que são poucos e grandes, o selo continua sólido.
 */
export function StatusClinicaPill({ status }: { status: StatusClinica }) {
  return (
    <Pill variant="outline" colorScheme={esquema[status]} size="sm">
      {status.toUpperCase()}
    </Pill>
  );
}
