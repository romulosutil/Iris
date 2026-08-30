"use client";

import { useActionState, useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { cancelarAssinaturaAction, type CancelamentoState } from "./actions";
import type { SituacaoConta } from "@/lib/billing/estado-conta";

type AcaoCancelamento = (
  prev: CancelamentoState,
  formData: FormData,
) => Promise<CancelamentoState> | CancelamentoState;

export interface CancelarAssinaturaProps {
  situacaoConta: SituacaoConta;
  /**
   * Costura de teste: em produção é sempre a server action real. Injetar a
   * ação evita que o teste de componente precise de servidor, banco e sessão.
   */
  acao?: AcaoCancelamento;
}

/**
 * Cancelamento pela tela (#36, bloco C2).
 *
 * Só aparece para assinatura VIVA (`active` / `past_due`). A inadimplente vê o
 * botão de propósito: `past_due` é terminal (#319) e é justamente quem mais
 * precisa de saída.
 */
export function CancelarAssinatura({
  situacaoConta,
  acao = cancelarAssinaturaAction,
}: CancelarAssinaturaProps) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, isPending] = useActionState<
    CancelamentoState,
    FormData
  >(acao, {});

  const viva =
    situacaoConta.statusAssinatura === "active" ||
    situacaoConta.statusAssinatura === "past_due";
  if (!viva) return null;

  if (state.sucesso) {
    return (
      <Alert severidade="info" titulo="Assinatura cancelada">
        A cobrança recorrente foi encerrada. O ciclo que estava aberto virou
        débito proporcional aos dias já usados, e você continua com acesso de
        leitura e exportação a toda a base de pacientes.
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        variante="terciaria"
        onClick={() => setAberto(true)}
        disabled={isPending}
      >
        Cancelar assinatura
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogTitle>Cancelar a assinatura?</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-col gap-3 text-sm text-[var(--text-primary)]">
              <p>
                O corte é <strong>imediato</strong>: a autorização de débito no
                seu banco é revogada agora, sem período de cortesia.
              </p>
              <p>
                O ciclo que está aberto é encerrado e vira{" "}
                <strong>débito</strong> proporcional aos dias já usados. Ele
                continua devido depois do cancelamento.
              </p>
              <p>
                Pagar esse débito <strong>não reativa</strong> a assinatura —
                para voltar, é preciso contratar de novo por esta tela.
              </p>
              <p>
                A base de pacientes continua inteira e legível, e a exportação
                continua liberada.
              </p>
            </div>
          </DialogDescription>

          {state.erro ? (
            <Alert severidade="erro" titulo="Não foi possível cancelar">
              {state.erro}
            </Alert>
          ) : null}

          <form action={formAction} className="mt-4 flex flex-wrap gap-3">
            <Button type="submit" variante="primaria" disabled={isPending}>
              {isPending ? "Cancelando…" : "Sim, cancelar assinatura"}
            </Button>
            <DialogClose asChild>
              <Button type="button" variante="terciaria" disabled={isPending}>
                Voltar
              </Button>
            </DialogClose>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
