"use client";

import { useActionState } from "react";
import { Stack } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { reprocessarExtracaoAction, type ReprocessarState } from "./actions";

/**
 * Botão "Reprocessar" de uma extração que falhou, com o retorno da action.
 *
 * Vive junto da action (e não dentro de uma das filas) porque DUAS telas
 * precisam dele: `/pendencias` (fila do terapeuta) e `/excecoes` (painel do
 * coordenador). Numa clínica de uma pessoa só as duas filas são da MESMA
 * pessoa: o fundador recebe apenas o papel `coordenador`
 * (`criarClinicaEVinculo`) e `papelAtivo` faz coordenador vencer sempre, então
 * ele chega ao item de "Extrações que falharam" pelo painel de exceções e
 * antes só encontrava "Abrir diário" — que leva a um formulário de nota em
 * branco, sem nenhuma ação de reprocessar. A separação de produto
 * "coordenador supervisiona / terapeuta age" não tem sentido quando as duas
 * pessoas são a mesma.
 *
 * Quem decide se o botão aparece é a tela chamadora: só quando o usuário É o
 * terapeuta dono da sessão. Não é teatro de UI — a RLS (`extraction_insert` /
 * `extraction_delete`) exige `app_session_terapeuta_id(session_id) =
 * app.user_id`, então para um coordenador que não é o dono o botão só
 * produziria um erro. Esconder é a leitura honesta de uma ação impossível.
 */
export function ReprocessarExtracao({ sessionId }: { sessionId: string }) {
  const [state, formAction, pending] = useActionState<
    ReprocessarState,
    FormData
  >(reprocessarExtracaoAction, {});

  return (
    <Stack gap="sm">
      <form action={formAction} className="contents">
        <input type="hidden" name="sessionId" value={sessionId} />
        <Button type="submit" disabled={pending}>
          {pending ? "Reprocessando…" : "Reprocessar"}
        </Button>
      </form>
      {state.error ? <Alert severidade="erro">{state.error}</Alert> : null}
      {/* Reprocessar que falha DE NOVO (ex.: id de modelo aposentado no
          provider) não pode devolver o mesmo verde de quando deu certo — senão
          o item some da vista do operador e volta na fila sem explicação. */}
      {state.ok && state.aviso ? (
        <Alert severidade="warning" titulo="Reprocessamento não concluiu">
          {state.aviso}
        </Alert>
      ) : state.ok ? (
        <Alert severidade="sucesso">
          Reprocessamento disparado. Se a extração vier, aparece em Sugestões da
          IA.
        </Alert>
      ) : null}
    </Stack>
  );
}
