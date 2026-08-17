"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatarDisciplina } from "@/lib/disciplinas";
import { formatarHoras } from "@/lib/horas";
import type { ConfirmacaoSobrealocacao } from "./prescricao-logic";

/**
 * Confirmação de represcrição que sobrealoca (#203, fatia 6 · §MV4).
 *
 * Reduzir o teto abaixo do que a equipe já entrega é LEGÍTIMO — travar
 * obrigaria o coordenador a desmontar a equipe antes de corrigir a prescrição,
 * ordem que a clínica não segue. O refino é confirmar ANTES, com a frase exata
 * que ele vai reencontrar na barra da tela de equipe.
 *
 * Componente compartilhado de propósito: `prescreverDisciplinaAction` é a MESMA
 * action nos DOIS formulários da seção (a linha que altera a carga e o bloco que
 * prescreve uma disciplina nova). Enquanto o diálogo morava só na linha, o
 * formulário de prescrição nova recebia `confirmacao` e não sabia o que fazer
 * com ela: nada salvava, nada aparecia na tela, e o submit virava um clique sem
 * efeito. O caminho é real — encerrar a prescrição mantém os vínculos (é o que o
 * diálogo de encerramento promete), e prescrever de novo com carga menor cai
 * exatamente aí.
 */
export function ConfirmarSobrealocacaoDialog({
  confirmacao,
  formAction,
  isPending,
}: {
  confirmacao: ConfirmacaoSobrealocacao | undefined;
  formAction: (formData: FormData) => void;
  isPending: boolean;
}) {
  /**
   * Qual confirmação o coordenador já descartou.
   *
   * Guarda o OBJETO, não um booleano: `confirmacao` vem do `useActionState` e
   * cada resposta do servidor é um objeto novo, então uma confirmação nova
   * reabre o diálogo sozinha, sem efeito de reset. Sem este estado o diálogo é
   * controlado por um `open` que nada no cliente consegue baixar — Esc, X e
   * clique no overlay não fecham, e o focus trap do Radix prende quem navega por
   * teclado.
   */
  const [descartada, setDescartada] = useState<ConfirmacaoSobrealocacao | null>(
    null,
  );
  const aberto = !!confirmacao && confirmacao !== descartada;

  return (
    <Dialog
      open={aberto}
      onOpenChange={(proximo) => {
        // Fechar sem confirmar = cancelar, e cancelar não desfaz nada: o
        // servidor devolveu a confirmação NO LUGAR de gravar. Por isso o
        // descarte é local — recarregar a página para cancelar jogaria fora as
        // edições não salvas do resto do cadastro clínico.
        if (!proximo && confirmacao) setDescartada(confirmacao);
      }}
    >
      <DialogContent>
        <DialogTitle>Esta redução deixa a disciplina sobrealocada.</DialogTitle>
        <DialogDescription>
          {confirmacao ? (
            <>
              {frasePedido(confirmacao)} <strong>{confirmacao.texto}</strong>
              {confirmacao.avisoSemHoras ? (
                <> {confirmacao.avisoSemHoras}</>
              ) : null}
            </>
          ) : null}
        </DialogDescription>
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button
            type="button"
            variante="neutra"
            tamanho="sm"
            onClick={() => confirmacao && setDescartada(confirmacao)}
          >
            Cancelar
          </Button>
          {/* Reenvia o MESMO pedido com a flag de confirmação — o servidor
              revalida o alocado sob o mesmo lock, e `horasAtuaisEsperadas`
              recusa a gravação se o teto tiver mudado enquanto o diálogo estava
              aberto. O diálogo fica aberto até a resposta chegar: é o único
              lugar onde `isPending` tem onde aparecer. */}
          <form action={formAction}>
            <input
              type="hidden"
              name="disciplina"
              value={confirmacao?.disciplina ?? ""}
            />
            <input
              type="hidden"
              name="horasAlvoSemana"
              value={confirmacao?.horasNovas ?? ""}
            />
            <input
              type="hidden"
              name="horasAtuaisEsperadas"
              value={confirmacao?.horasAtuais ?? ""}
            />
            <input type="hidden" name="confirmarSobrealocacao" value="1" />
            <Button type="submit" tamanho="sm" isLoading={isPending}>
              Salvar mesmo assim
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A primeira frase: o que está sendo pedido.
 *
 * Sem prescrição vigente (`horasAtuais` ausente) a disciplina tem equipe mas
 * nunca teve teto — legado de §3.1. Dizer "passa de 0h para 10h" afirmaria uma
 * prescrição anterior que não existiu, que é o mesmo número inventado que o
 * encerramento de vínculo se recusa a citar.
 */
function frasePedido(c: ConfirmacaoSobrealocacao): string {
  const nome = formatarDisciplina(c.disciplina);
  const alocadas = `a equipe já tem ${formatarHoras(c.horasAlocadas)} alocadas`;
  const pedido =
    c.horasAtuais === undefined
      ? `${nome} passa a ter ${formatarHoras(c.horasNovas)} prescritas`
      : `${nome} passa de ${formatarHoras(c.horasAtuais)} para ${formatarHoras(c.horasNovas)}`;
  return `${pedido}, mas ${alocadas}. A prescrição será salva e a disciplina ficará assim:`;
}
