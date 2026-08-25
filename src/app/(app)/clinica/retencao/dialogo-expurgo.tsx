"use client";

import { useActionState, useId, useState } from "react";
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
import { purgarPacienteAction } from "./actions";
import type { ExpurgoState } from "./logic";
import { MOTIVO_EXPURGO_MAX, MOTIVO_EXPURGO_MIN } from "./schemas";

const INICIAL: ExpurgoState = {};

/**
 * #352 — confirmação por digitação do nome do paciente.
 *
 * **O confirmador é o NOME, não uma palavra fixa.** "Digite EXPURGAR" protege
 * contra o clique acidental; não protege contra purgar o paciente ERRADO — e
 * numa fila de vários nomes parecidos, com linhas adjacentes, esse é o modo de
 * falha provável. Digitar o nome obriga a olhar para a linha certa.
 *
 * **Match exato, sem normalizar caixa nem acento** (R352.C6). Normalizar
 * reduziria o atrito exatamente onde o atrito é o produto. A comparação da UI é
 * espelho da que o core faz contra o nome lido do banco — esta aqui só
 * desabilita o botão; a que vale é a do servidor.
 *
 * **Construído aqui dentro, não como primitivo do design system.** Um
 * confirmador por digitação é útil generalizado, mas generalizar a partir de um
 * caso é como se inventa API errada — quando existir o segundo caso, ele dirá
 * qual é a forma.
 *
 * Não existe variante destrutiva de `Button` neste design system e não é aqui
 * que se inventa uma: isso é escopo de design system, não de #352. O peso do
 * ato mora na copy, no confirmador e no motivo obrigatório.
 */
export function DialogoExpurgo({
  pacienteId,
  nome,
}: {
  pacienteId: string;
  nome: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const campoConfirmacao = useId();
  const campoMotivo = useId();
  const instrucao = useId();

  const [estado, formAction, pendente] = useActionState(
    purgarPacienteAction.bind(null, pacienteId),
    INICIAL,
  );

  // Fecha só no sucesso, ajustando DURANTE a renderização (não em `useEffect`):
  // a reação depende do estado *anterior* da Server Action. Derivar `open` de
  // `estado.ok` puro impediria reabrir o diálogo, e fechar num efeito
  // renderizaria o diálogo aberto por um frame antes de fechá-lo.
  const [estadoVisto, setEstadoVisto] = useState(estado);
  if (estado !== estadoVisto) {
    setEstadoVisto(estado);
    if (estado.ok) setAberto(false);
  }

  const confere = confirmacao === nome;

  return (
    <Dialog
      open={aberto}
      onOpenChange={(proximo) => {
        setAberto(proximo);
        // Fechar e reabrir devolve o campo vazio. Um confirmador que continua
        // preenchido da vez anterior vira um botão já habilitado na abertura
        // seguinte — que é precisamente o clique acidental que ele existe para
        // impedir.
        if (!proximo) setConfirmacao("");
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variante="neutra" tamanho="sm">
          Expurgar prontuário
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Expurgar prontuário de {nome}</DialogTitle>
        <DialogDescription>
          O prazo legal de guarda deste prontuário venceu. O expurgo é
          DEFINITIVO e não tem desfazer: sessões, evidências, relatórios, metas
          e o cadastro do paciente são eliminados. Permanece apenas o registro
          pseudonimizado do ato na trilha de auditoria — sem nome, sem conteúdo
          clínico.
        </DialogDescription>
        <form action={formAction}>
          <Stack gap="md" className="mt-4">
            <Field
              label="Digite o nome do paciente para confirmar"
              htmlFor={campoConfirmacao}
              hint={`Exatamente como está na fila: ${nome}`}
            >
              <Input
                id={campoConfirmacao}
                name="confirmacao"
                value={confirmacao}
                onChange={(evento) => setConfirmacao(evento.target.value)}
                aria-describedby={instrucao}
                autoComplete="off"
                required
              />
            </Field>
            <p id={instrucao} className="sr-only">
              A confirmação diferencia maiúsculas, minúsculas e acentos.
            </p>
            <Field
              label="Motivo do expurgo"
              htmlFor={campoMotivo}
              error={estado.error}
              hint={`Mínimo ${MOTIVO_EXPURGO_MIN} caracteres. Depois do expurgo, esta é a única informação que resta sobre o ato.`}
            >
              <Input
                id={campoMotivo}
                name="motivo"
                multiline
                rows={4}
                required
                minLength={MOTIVO_EXPURGO_MIN}
                maxLength={MOTIVO_EXPURGO_MAX}
                placeholder="Ex.: prazo legal de guarda vencido, eliminação de rotina conforme política de retenção."
              />
            </Field>
            <Cluster gap="sm">
              <Button
                type="submit"
                variante="primaria"
                disabled={pendente || !confere}
              >
                {pendente ? "Expurgando…" : "Expurgar definitivamente"}
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
