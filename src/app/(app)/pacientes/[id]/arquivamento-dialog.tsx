"use client";

import { useActionState, useId, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Cluster, Stack } from "@/components/ui/layout";
import { arquivarPacienteAction, desarquivarPacienteAction } from "./actions";
import type { ArquivamentoState } from "./logic";
import { MOTIVO_ARQUIVAMENTO_MAX, MOTIVO_ARQUIVAMENTO_MIN } from "./schemas";

const INICIAL: ArquivamentoState = {};

/**
 * #174 — a tela que faltava no débito D6.
 *
 * As Server Actions existiam desde a fatia do banco e nenhuma tela as
 * chamava: arquivar só era possível pelo job automático, e desarquivar não era
 * possível de jeito nenhum. Sem este diálogo, a régua de 90 dias é uma decisão
 * unilateral do sistema sobre o que a clínica paga.
 *
 * Diálogo (e não botão direto) porque a mudança altera a contagem de pacientes
 * ativos do mês e fica gravada numa trilha append-only — é exatamente o "alto
 * atrito" que o design system reserva para o `Dialog`. O motivo obrigatório é
 * o conteúdo desse atrito: é ele que aparece no `audit_log` quando alguém
 * perguntar meses depois por que este paciente parou (ou voltou) a contar.
 *
 * Não existe variante destrutiva de `Button` neste design system, e é
 * coerente: arquivar não destrói nada. O prontuário continua acessível,
 * exportável e visível na lista — só sai da contagem.
 */
export function ArquivamentoDialog({
  patientId,
  arquivado,
}: {
  patientId: string;
  arquivado: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const campoMotivo = useId();

  const action = arquivado ? desarquivarPacienteAction : arquivarPacienteAction;
  const [estado, formAction, pendente] = useActionState(
    action.bind(null, patientId),
    INICIAL,
  );

  // Fecha só no sucesso. Erro de validação mantém o diálogo aberto com a
  // mensagem ao lado do campo — fechar aqui jogaria fora o texto digitado e
  // esconderia o motivo da recusa.
  //
  // Ajuste durante a renderização (e não `useEffect`) porque a reação depende
  // do estado *anterior* da Server Action: derivar `open` de `estado.ok` puro
  // impediria reabrir o diálogo depois de um sucesso, e fechar num efeito
  // renderiza o diálogo aberto por um frame antes de fechá-lo.
  const [estadoVisto, setEstadoVisto] = useState(estado);
  if (estado !== estadoVisto) {
    setEstadoVisto(estado);
    if (estado.ok) setAberto(false);
  }

  const rotulo = arquivado ? "Desarquivar paciente" : "Arquivar paciente";

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button type="button" variante="neutra" tamanho="sm">
          {rotulo}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{rotulo}</DialogTitle>
        <DialogDescription>
          {arquivado
            ? "O paciente volta a entrar na contagem de pacientes ativos do mês a partir de hoje. O motivo fica registrado no histórico da clínica."
            : "O paciente sai da contagem de pacientes ativos do mês. O prontuário continua acessível e exportável, e nada de clínico muda — isto não é alta. O motivo fica registrado no histórico da clínica."}
        </DialogDescription>
        <form action={formAction}>
          <Stack gap="md" className="mt-4">
            <Field
              label={
                arquivado
                  ? "Motivo do desarquivamento"
                  : "Motivo do arquivamento"
              }
              htmlFor={campoMotivo}
              error={estado.error}
              hint={`Mínimo ${MOTIVO_ARQUIVAMENTO_MIN} caracteres.`}
            >
              <Input
                id={campoMotivo}
                name="motivo"
                multiline
                rows={4}
                required
                minLength={MOTIVO_ARQUIVAMENTO_MIN}
                maxLength={MOTIVO_ARQUIVAMENTO_MAX}
                placeholder={
                  arquivado
                    ? "Ex.: paciente retomou o acompanhamento nesta semana."
                    : "Ex.: família encerrou o acompanhamento em dezembro."
                }
              />
            </Field>
            {estado.bloqueioConta ? (
              <Alert severidade="warning">
                {estado.bloqueioConta.mensagem}
              </Alert>
            ) : null}
            <Cluster gap="sm">
              <Button type="submit" variante="primaria" disabled={pendente}>
                {pendente
                  ? "Salvando…"
                  : `Confirmar ${arquivado ? "desarquivamento" : "arquivamento"}`}
              </Button>
              <DialogClose asChild>
                <Button type="button" variante="terciaria">
                  Cancelar
                </Button>
              </DialogClose>
            </Cluster>
          </Stack>
        </form>
      </DialogContent>
    </Dialog>
  );
}
