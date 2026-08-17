import { Chip, ChipGroup } from "@/components/ui/chip";
import type { ReforcadorAtual } from "./queries";

/**
 * 🎯 REFORÇADORES ATUAIS — já chega filtrado/ordenado de `reforcadoresAtuaisDe`
 * (mais recente por item, "saciado" excluído, "alta" primeiro — R17). Aqui só
 * renderiza; nenhuma leitura ou recomputo de série acontece na UI.
 */
export function ReforcadoresAtuaisSection({
  itens,
}: {
  itens: ReforcadorAtual[];
}) {
  if (itens.length === 0) {
    return (
      <p className="text-text-body text-sm">
        Nenhum reforçador ativo registrado (ou todos marcados como saciados).
      </p>
    );
  }
  return (
    <ChipGroup rotulo="Reforçadores atuais do paciente">
      {itens.map((r) => (
        <Chip key={r.item}>
          {r.item}
          {r.valencia === "alta" ? (
            <span className="sr-only"> (preferência alta)</span>
          ) : (
            <span className="sr-only"> (preferência baixa)</span>
          )}
        </Chip>
      ))}
    </ChipGroup>
  );
}
