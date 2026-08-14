"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { formatarDisciplina } from "@/lib/disciplinas";
import { formatarHoras, papelConsomeSaldo } from "@/lib/horas";
import { encerrarVinculoAction } from "./actions";
import type { EncerramentoResultado } from "./logic";

/**
 * Encerrar vínculo: confirmar antes, e dizer o que mudou depois (#203, fatia 6).
 *
 * Encerrar faz DUAS coisas de uma vez, e as duas são invisíveis se ninguém as
 * escrever (plano §3.1 e §3.3):
 *
 *   1. **Corta o acesso ao prontuário na hora, sem carência** (D-A). Não é
 *      efeito colateral desta tela — é o comportamento do banco:
 *      `app_is_on_team` filtra `vigencia_fim IS NULL` e governa a leitura de
 *      todas as tabelas clínicas. Como o corte é imediato e total, a ação
 *      precisa dizer o que faz ANTES de fazer.
 *   2. **Devolve as horas para o saldo da disciplina.** O número na barra muda
 *      no mesmo instante; sem a frase do toast, o coordenador não relaciona a
 *      ação ao número que mudou.
 *
 * O saldo do toast vem do SERVIDOR (`saldoTexto`), calculado pela mesma
 * `calcularCobertura` da barra e dentro da transação do encerramento. Recompor
 * a conta aqui faria o toast citar um saldo que a tela não mostra.
 */
const VAZIO: EncerramentoResultado = {};

export function EncerrarVinculoForm({
  patientId,
  membershipId,
  nomeProfissional,
  disciplina,
  papelNaEquipe,
  horasSemana,
}: {
  patientId: string;
  membershipId: string;
  nomeProfissional: string;
  disciplina: string;
  papelNaEquipe: string;
  horasSemana: string | null;
}) {
  const [state, formAction, isPending] = useActionState(
    encerrarVinculoAction.bind(null, patientId, membershipId),
    VAZIO,
  );
  const { addToast } = useToast();

  /**
   * Qual resultado estava na tela quando o diálogo foi aberto.
   *
   * O diálogo fica aberto enquanto `state` for aquele mesmo objeto — ou seja,
   * até a action responder — e fecha sozinho quando a resposta chega. Fechar no
   * `onClick` do submit, como estava, desmontava o `<form>` no mesmo clique:
   * `isLoading` nunca chegava a aparecer numa ação que faz roundtrip para cortar
   * acesso a prontuário, e o submit dependia de o evento sobreviver ao unmount.
   * Derivar em vez de `setState` num efeito também mantém o lint
   * `react-hooks/set-state-in-effect` quieto.
   */
  const [pedido, setPedido] = useState<EncerramentoResultado | null>(null);
  const confirmando = pedido !== null && state === pedido;

  const nomeDisciplina = formatarDisciplina(disciplina);
  // Gestão do caso não consome saldo (D-C), então não há hora a devolver — e
  // prometer devolução onde não há nenhuma é pior que não dizer nada.
  const devolveHoras = papelConsomeSaldo(papelNaEquipe) && horasSemana !== null;

  useEffect(() => {
    if (state.ok) {
      addToast({
        titulo: "Vínculo encerrado",
        mensagem: montarMensagem(state),
        severidade: "sucesso",
      });
      return;
    }
    if (state.error) {
      addToast({
        titulo: "Não foi possível encerrar",
        mensagem: state.error,
        severidade: "erro",
      });
    }
  }, [state, addToast]);

  return (
    <>
      <Button
        type="button"
        tamanho="sm"
        onClick={() => setPedido(state)}
      >
        Encerrar vínculo
      </Button>

      <Dialog
        open={confirmando}
        onOpenChange={(aberto) => {
          if (!aberto) setPedido(null);
        }}
      >
        <DialogContent>
          <DialogTitle>
            Encerrar o vínculo de {nomeProfissional} ({nomeDisciplina})?
          </DialogTitle>
          <DialogDescription>
            {nomeProfissional} perde o acesso ao prontuário deste paciente
            imediatamente
            {devolveHoras
              ? `, e as ${formatarHoras(horasSemana)} voltam para o saldo de ${nomeDisciplina}`
              : ""}
            . O histórico de atendimentos permanece.
          </DialogDescription>
          <div className="mt-6 flex items-center justify-end gap-3">
            <Button
              type="button"
              variante="neutra"
              tamanho="sm"
              onClick={() => setPedido(null)}
            >
              Cancelar
            </Button>
            {/* Sem `onClick` que feche: o diálogo sai de cena quando a action
                responde, então `isLoading` cobre o roundtrip inteiro e o submit
                não corre atrás de um formulário já desmontado. */}
            <form action={formAction}>
              <Button
                type="submit"
                tamanho="sm"
                isLoading={isPending}
              >
                Encerrar vínculo
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * As duas consequências numa frase só (§3.3).
 *
 * O corte de acesso é dito SEMPRE — é o que o coordenador menos espera e o que
 * mais custa descobrir tarde. O saldo entra quando existe prescrição vigente
 * para nomear; em vínculo legado fora da prescrição (§3.1) não há teto contra o
 * qual falar em saldo, e inventar um número seria mentira educada.
 */
function montarMensagem(state: EncerramentoResultado): string {
  const corteDeAcesso =
    "O acesso deste profissional ao prontuário foi cortado.";
  if (!state.saldoTexto || !state.disciplina) return corteDeAcesso;

  const nome = formatarDisciplina(state.disciplina);
  const devolucao = state.horasDevolvidas
    ? `${nome} voltou para ${state.saldoTexto}.`
    : `${nome} segue em ${state.saldoTexto}.`;
  return `${devolucao} ${corteDeAcesso}`;
}
