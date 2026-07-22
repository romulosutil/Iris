"use client";

import { useActionState, useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  conflitosAction,
  contarFuturasAction,
  encerrarRegraAction,
  estenderAction,
  type EstadoAcao,
  type EstadoEstender,
} from "./actions";

function formatarBR(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const ESTADO_ESTENDER_INICIAL: EstadoEstender = {};
const ESTADO_ENCERRAR_INICIAL: EstadoAcao = {};

export interface PopoverRegraProps {
  regraId: string;
  rotulo: string;
  proximaSessaoISO: string | null;
  hojeISO: string;
  onClose: () => void;
}

/** Etapa D (F2/F4/F5): detalhe/ações de uma regra recorrente, acionado pelo
 * overlay acionável do bloco na grade (`CalendarioSemana`). */
export function PopoverRegra({
  regraId,
  rotulo,
  proximaSessaoISO,
  hojeISO,
  onClose,
}: PopoverRegraProps) {
  const [estender, estenderFn, estPending] = useActionState<EstadoEstender, FormData>(
    estenderAction,
    ESTADO_ESTENDER_INICIAL,
  );
  const [encerrar, encerrarFn, encPending] = useActionState<EstadoAcao, FormData>(
    encerrarRegraAction,
    ESTADO_ENCERRAR_INICIAL,
  );
  const [confirmando, setConfirmando] = useState(false);
  const [futuras, setFuturas] = useState<number | null>(null);
  const [conflitos, setConflitos] = useState<string[]>([]);

  useEffect(() => {
    let vivo = true;
    conflitosAction(regraId).then((ds) => {
      if (vivo) setConflitos(ds);
    });
    return () => {
      vivo = false;
    };
  }, [regraId]);

  async function abrirConfirmacao() {
    setFuturas(await contarFuturasAction(regraId, hojeISO)); // F5: contagem real
    setConfirmando(true);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>{rotulo}</DialogTitle>
        {/* F4: rótulo honesto — "próxima sessão", não "toda semana" */}
        <DialogDescription>Próxima sessão: {formatarBR(proximaSessaoISO)}</DialogDescription>

        {/* F2: estender declara alvo (+12 semanas) e reporta gerado/pulado
            inline (não toast) */}
        <form action={estenderFn} className="mt-3">
          <input type="hidden" name="regraId" value={regraId} />
          <input type="hidden" name="hojeISO" value={hojeISO} />
          <Button type="submit" variante="secundaria" disabled={estPending}>
            Estender +12 semanas
          </Button>
        </form>
        {estender.ok && (
          <p role="status" className="text-ink font-body mt-2 text-sm">
            {estender.geradas} sessões criadas
            {estender.puladas ? `, ${estender.puladas} não criadas por conflito` : ""}.
          </p>
        )}

        {/* F2: lista persistente das datas puladas por conflito (não é toast) */}
        {conflitos.length > 0 && (
          <div role="status" className="mt-3 flex flex-col gap-2">
            <p className="text-[var(--text-primary)] font-body text-sm font-semibold">
              {conflitos.length}{" "}
              {conflitos.length === 1 ? "data não criada" : "datas não criadas"} por conflito:
            </p>
            <div className="max-h-48 overflow-y-auto border-2 border-[var(--border-brutal)] rounded-[var(--radius-control)] bg-[var(--surface-elevated)] p-3">
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 font-mono text-xs text-[var(--text-primary)]">
                {conflitos.map((d) => (
                  <li key={d} className="bg-[var(--surface-card)] px-2 py-1 border border-[var(--border-brutal)]/40 rounded-[var(--radius-xs)] text-center">
                    {formatarBR(d)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* F5: encerrar com confirmação de contagem real (não estimativa) */}
        {!confirmando ? (
          <Button
            type="button"
            variante="secundaria"
            className="mt-3"
            onClick={abrirConfirmacao}
          >
            Encerrar (esta e futuras)
          </Button>
        ) : (
          <form action={encerrarFn} className="mt-3 space-y-2">
            <input type="hidden" name="regraId" value={regraId} />
            <input type="hidden" name="ateFimISO" value={hojeISO} />
            <p className="text-ink font-body text-sm">
              Remove {futuras ?? 0} sessões futuras (a partir de amanhã). As de hoje e o
              histórico ficam.
            </p>
            <div className="flex gap-2">
              <Button type="submit" variante="secundaria" disabled={encPending}>
                Confirmar encerramento
              </Button>
              <Button type="button" variante="terciaria" onClick={() => setConfirmando(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        )}

        {(estender.error || encerrar.error) && (
          <Alert severidade="erro" titulo="Não foi possível concluir" className="mt-3">
            {estender.error ?? encerrar.error}
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}
