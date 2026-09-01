import { Stack } from "@/components/ui/layout";
import { Alert } from "@/components/ui/alert";
import { RevisaoLista } from "../../revisao/[sessionId]/revisao-lista";
import { carregarRevisao } from "../../revisao/[sessionId]/queries";
import type { TenantContext } from "@/db/rls";

/**
 * "Revisar N evidências" — reusa `carregarRevisao`/`RevisaoLista` de
 * `/revisao/[sessionId]` (T06 absorve a rota, não reescreve a lógica de
 * fricção/aprovação — essa é `avaliarFriccao`, fonte única, spec A8).
 *
 * `podeColapsarAprovacao` (T05, `podeAutoValidar`) agora também é o GESTO
 * (T07, R-07/R-10/R-11): passada para `RevisaoLista`, ela colapsa "Aprovar"
 * em "Aprovar e confirmar" — o mesmo clique já grava o carimbo de
 * `evidence_revision` que hoje só nasceria numa segunda visita a
 * /validacao. Fricção alta continua exigindo justificativa escrita e nunca
 * vai a lote (R-10) — `avaliarFriccao` segue sendo a fonte única, intocada
 * aqui. Não existe gesto de "reabrir revisão" (P2, issue #522, opção a —
 * cortado desta feature).
 */
export async function PassoRevisar({
  ctx,
  sessionId,
  podeColapsarAprovacao,
}: {
  ctx: TenantContext;
  sessionId: string;
  podeColapsarAprovacao: boolean;
}) {
  const dados = await carregarRevisao(ctx, sessionId);
  if (!dados) {
    return (
      <Alert severidade="erro">
        Não foi possível carregar as evidências desta sessão.
      </Alert>
    );
  }

  return (
    <Stack gap="md" como="section" aria-labelledby="revisar-titulo">
      <h2
        id="revisar-titulo"
        className="font-display text-2xl font-bold text-[var(--text-primary)]"
      >
        Revisar evidências
      </h2>
      {podeColapsarAprovacao ? (
        <Alert severidade="info">
          Você é a coordenadora e a terapeuta desta sessão — aprovar aqui já é o
          carimbo final, sem uma segunda revisão em /validacao.
        </Alert>
      ) : null}
      <RevisaoLista
        sessionId={sessionId}
        extracoes={dados.extracoes}
        ehDono={dados.ehDono}
        podeColapsarAprovacao={podeColapsarAprovacao}
      />
    </Stack>
  );
}
