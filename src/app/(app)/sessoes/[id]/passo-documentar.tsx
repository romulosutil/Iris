import { Stack } from "@/components/ui/layout";
import { CapturaForm } from "../../diario/[sessionId]/captura-form";
import { ConsolidarForm } from "../../diario/[sessionId]/consolidar-form";
import type { ProtocoloOpcao } from "./queries";

/**
 * "Documentar": UM passo, dois momentos (brief §3.4, R-36/R-37/R-38) — não
 * duas telas irmãs de mesmo peso como em `/diario/[sessionId]`. Reusa
 * `CapturaForm`/`ConsolidarForm` (T06 é refactor de montagem, não lógica
 * nova): a captura continua sendo `UPDATE` acumulando na linha
 * `captura_rapida` (R-36, `capturarDiarioCore` faz `insert().onConflictDoUpdate`
 * no par `(sessionId, tipo)` — nunca `INSERT` de N linhas).
 */
export function PassoDocumentar({
  sessionId,
  protocolos,
  protocolIdsPreSelecionados,
  asrHabilitado,
  temCaptura,
}: {
  sessionId: string;
  protocolos: ProtocoloOpcao[];
  protocolIdsPreSelecionados: string[];
  asrHabilitado: boolean;
  temCaptura: boolean;
}) {
  return (
    <Stack gap="lg" como="section" aria-labelledby="documentar-titulo">
      <h2
        id="documentar-titulo"
        className="font-display text-2xl font-bold text-[var(--text-primary)]"
      >
        Documentar
      </h2>

      <Stack gap="md" como="section" aria-labelledby="capturar-titulo">
        <h3
          id="capturar-titulo"
          className="font-display text-lg font-bold text-[var(--text-primary)]"
        >
          1. Capturar
        </h3>
        <p className="text-sm text-[var(--text-secondary)]">
          Texto ou áudio, quantas vezes precisar — cada envio atualiza o mesmo
          rascunho desta sessão.
        </p>
        <CapturaForm
          sessionId={sessionId}
          protocolos={protocolos}
          protocolIdsPreSelecionados={protocolIdsPreSelecionados}
          asrHabilitado={asrHabilitado}
        />
      </Stack>

      <Stack gap="md" como="section" aria-labelledby="consolidar-titulo">
        <h3
          id="consolidar-titulo"
          className="font-display text-lg font-bold text-[var(--text-primary)]"
        >
          2. Consolidar
        </h3>
        <p className="text-sm text-[var(--text-secondary)]">
          Fecha o passo e dispara a análise da IA. Uma vez só.
        </p>
        <ConsolidarForm
          sessionId={sessionId}
          podeConsolidar={temCaptura}
          motivoBloqueio={
            temCaptura
              ? undefined
              : "Ainda não há captura salva nesta sessão — registre o texto ou áudio acima antes de consolidar."
          }
        />
      </Stack>
    </Stack>
  );
}
