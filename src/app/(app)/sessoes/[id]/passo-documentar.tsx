import { Stack } from "@/components/ui/layout";
import { Alert } from "@/components/ui/alert";
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
 *
 * #514 — ver ≠ escrever. `/sessoes/[id]` deixa a coordenação VER qualquer
 * sessão da clínica (`podeVer`), mas quem escreve captura/consolidação é só o
 * terapeuta dono: as policies `session_note_insert`/`session_note_update` e
 * `extraction_insert` (`0006_fase2_rls.sql`) exigem
 * `app_session_terapeuta_id(session_id) = app.user_id`. Renderizar os
 * formulários para um coordenador não-dono ofereceria uma ação que o banco
 * recusa DEPOIS de a nota inteira estar digitada — trabalho perdido e erro
 * genérico de RLS como única explicação. Por isso `ehDono` decide aqui, e não
 * só na página.
 */
export function PassoDocumentar({
  sessionId,
  protocolos,
  protocolIdsPreSelecionados,
  asrHabilitado,
  temCaptura,
  ehDono,
}: {
  sessionId: string;
  protocolos: ProtocoloOpcao[];
  protocolIdsPreSelecionados: string[];
  asrHabilitado: boolean;
  temCaptura: boolean;
  /** Usuário é o terapeuta da sessão — único que a RLS deixa escrever (#514). */
  ehDono: boolean;
}) {
  return (
    <Stack gap="lg" como="section" aria-labelledby="documentar-titulo">
      <h2
        id="documentar-titulo"
        className="font-display text-2xl font-bold text-[var(--text-primary)]"
      >
        Documentar
      </h2>

      {!ehDono ? (
        <Alert severidade="info" titulo="Somente leitura">
          Só o terapeuta desta sessão captura e consolida a documentação. Você
          acompanha o andamento pela timeline acima e entra na etapa de revisão
          das evidências, quando ela abrir.
        </Alert>
      ) : (
        <>
          <Stack gap="md" como="section" aria-labelledby="capturar-titulo">
            <h3
              id="capturar-titulo"
              className="font-display text-lg font-bold text-[var(--text-primary)]"
            >
              1. Capturar
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Texto ou áudio, quantas vezes precisar — cada envio atualiza o
              mesmo rascunho desta sessão.
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
        </>
      )}
    </Stack>
  );
}
