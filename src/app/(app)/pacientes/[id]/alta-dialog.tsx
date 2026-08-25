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
import { desfazerAltaAction, registrarAltaAction } from "./actions";
import type { AltaState } from "./logic";
import { MOTIVO_ALTA_MAX, MOTIVO_ALTA_MIN } from "./schemas";

const INICIAL: AltaState = {};

/**
 * #352 — a tela que faltava para `patient.alta_em`.
 *
 * A coluna existia desde o modelo de dados e a fórmula de retenção dependia
 * dela, mas nenhum caminho do app escrevia ali. Consequência: a fila de expurgo
 * era vazia em produção **por construção** — não porque nada vencia, mas porque
 * nenhum prontuário nunca recebia alta. Este diálogo é o que destrava a fila.
 *
 * Diálogo (e não campo solto na ficha) porque a data da alta ABRE o relógio de
 * retenção: dela sai o vencimento do prazo legal de guarda e, no fim dele, a
 * eliminação definitiva do prontuário. É o "alto atrito" que o design system
 * reserva ao `Dialog`, e o motivo obrigatório é o conteúdo desse atrito — é ele
 * que responde, anos depois, por que este prontuário entrou na contagem.
 *
 * A copy diz que a alta arquiva porque isso é verdade e é surpreendente: quem
 * arquiva é o trigger `patient_alta_arquiva_trg` (`0065`), no banco, e o
 * coordenador precisa saber que o paciente sai da contagem de ativos da fatura
 * no mesmo ato — senão a mudança aparece só no fechamento do ciclo.
 *
 * E diz que desfazer NÃO desarquiva porque essa é a assimetria que confunde: o
 * trigger só age na transição `NULL → NOT NULL`. Corrigir a data da alta é ato
 * clínico; devolver o paciente à contagem da fatura é ato administrativo, com
 * botão e motivo próprios.
 *
 * Não existe variante destrutiva de `Button` neste design system, e aqui isso é
 * coerente: registrar alta não destrói nada. O prontuário continua acessível e
 * exportável — o que muda é a data a partir da qual o prazo de guarda corre.
 */
export function AltaDialog({
  patientId,
  comAlta,
}: {
  patientId: string;
  comAlta: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const campoData = useId();
  const campoMotivo = useId();

  const action = comAlta ? desfazerAltaAction : registrarAltaAction;
  const [estado, formAction, pendente] = useActionState(
    action.bind(null, patientId),
    INICIAL,
  );

  // Fecha só no sucesso, ajustando DURANTE a renderização (não em `useEffect`):
  // a reação depende do estado *anterior* da Server Action. Derivar `open` de
  // `estado.ok` puro impediria reabrir o diálogo depois de um sucesso, e fechar
  // num efeito renderiza o diálogo aberto por um frame antes de fechá-lo.
  const [estadoVisto, setEstadoVisto] = useState(estado);
  if (estado !== estadoVisto) {
    setEstadoVisto(estado);
    if (estado.ok) setAberto(false);
  }

  const rotulo = comAlta ? "Desfazer alta clínica" : "Registrar alta clínica";

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
          {comAlta
            ? "A data da alta é apagada e o prazo de guarda do prontuário volta a não ter início. O paciente NÃO é desarquivado por isso — devolvê-lo à contagem de pacientes ativos é uma ação separada. O motivo fica registrado no histórico da clínica."
            : "A partir da data da alta começa a contar o prazo legal de guarda do prontuário; vencido o prazo, ele entra na fila de expurgo e a clínica é avisada com 90 dias de antecedência. O paciente também sai da contagem de pacientes ativos da fatura. O motivo fica registrado no histórico da clínica."}
        </DialogDescription>
        <form action={formAction}>
          <Stack gap="md" className="mt-4">
            {comAlta ? null : (
              <Field
                label="Data da alta"
                htmlFor={campoData}
                hint="Alta é fato consumado: não é possível registrar uma data futura."
              >
                {/*
                  Sem `max` no input: o valor teria de vir do relógio, e um
                  relógio lido na renderização diverge entre servidor e cliente
                  (erro de hidratação). Quem recusa data futura é o
                  `dataAltaSchema` no core — que é a barreira real de qualquer
                  jeito, já que um POST direto na action não passa por HTML.
                */}
                <Input id={campoData} name="data" type="date" required />
              </Field>
            )}
            <Field
              label={comAlta ? "Motivo para desfazer" : "Motivo da alta"}
              htmlFor={campoMotivo}
              error={estado.error}
              hint={`Mínimo ${MOTIVO_ALTA_MIN} caracteres.`}
            >
              <Input
                id={campoMotivo}
                name="motivo"
                multiline
                rows={4}
                required
                minLength={MOTIVO_ALTA_MIN}
                maxLength={MOTIVO_ALTA_MAX}
                placeholder={
                  comAlta
                    ? "Ex.: data digitada errada no registro anterior."
                    : "Ex.: objetivos terapêuticos alcançados, encerramento acordado com a família."
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
                  : comAlta
                    ? "Confirmar desfazimento"
                    : "Confirmar alta"}
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
