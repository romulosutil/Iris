import { Stack } from "@/components/ui/layout";
import { Alert } from "@/components/ui/alert";
import { DetalhesExpansiveis } from "@/components/ui/detalhes-expansivel";
import { ConsolidarForm } from "../../diario/[sessionId]/consolidar-form";

/**
 * #513 — "Corrigir a nota consolidada". `consolidarSessaoCore` sempre soube
 * reconsolidar (upsert em `session_note` + `deveReextrair`), mas depois que
 * `/diario/[sessionId]` virou redirect (#512 · T14) nenhuma tela expunha esse
 * caminho: `deriveEstadoSessao` só devolve o gesto `documentar` enquanto
 * `temNotaConsolidada` é falso, então `PassoDocumentar` — único lugar que
 * montava `ConsolidarForm` — nunca é renderizado com uma nota para editar.
 * Consertar um erro de digitação na nota (caso de uso que o próprio
 * `ConsolidarForm` documenta) ficou sem rota.
 *
 * Por que fora do passo em foco: corrigir a nota não é o próximo passo da
 * sessão — é uma ação de conserto sobre um passo já concluído. Vem depois do
 * gesto primário e fechada por padrão (`DetalhesExpansiveis`), para não
 * competir com "Revisar evidências" / "Ver no acervo".
 *
 * Só o dono: as policies `session_note_update` e `extraction_insert`
 * (`0006_fase2_rls.sql`) exigem `app_session_terapeuta_id(session_id) =
 * app.user_id` — mesma razão de #514 em `PassoDocumentar`.
 */
export function CorrigirNota({
  sessionId,
  texto,
  visibilityLevel,
}: {
  sessionId: string;
  texto: string;
  visibilityLevel: "multidisciplinary" | "discipline_only";
}) {
  return (
    <DetalhesExpansiveis rotulo="Corrigir a nota consolidada">
      <Stack gap="md" como="section" aria-labelledby="corrigir-nota-titulo">
        <h2
          id="corrigir-nota-titulo"
          className="font-display text-lg font-bold text-[var(--text-primary)]"
        >
          Corrigir a nota consolidada
        </h2>

        {/* A consequência não pode ser surpresa: salvar aqui manda o texto de
            volta para a IA (`deveReextrair` com `textoMudou`), gerando novas
            sugestões a revisar. O que já foi decidido (aprovada/editada/
            descartada) sobrevive — a Fase C de `consolidarSessaoCore` só apaga
            'sugerida'/'pendente_reprocessamento'. */}
        <Alert severidade="warning" titulo="Salvar reabre a análise da IA">
          O texto corrigido é reanalisado e pode gerar novas evidências para
          revisar. As evidências que você já aprovou, editou ou descartou
          continuam como estão.
        </Alert>

        <ConsolidarForm
          sessionId={sessionId}
          textoInicial={texto}
          visibilityInicial={visibilityLevel}
          rotuloSubmit="Salvar correção"
        />
      </Stack>
    </DetalhesExpansiveis>
  );
}
