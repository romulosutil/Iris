"use client";

import { useActionState, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { marcarEstadoAction, type SessionEstado } from "./actions";
import { ComboboxEntidade, type Opcao } from "./semana/combobox-entidade";

const ESTADOS: { v: SessionEstado; label: string }[] = [
  { v: "realizada", label: "Realizada" },
  { v: "falta_paciente", label: "Falta do paciente" },
  { v: "falta_terapeuta", label: "Falta do terapeuta" },
  { v: "cancelada", label: "Cancelada" },
];

const MODALIDADES = [
  { v: "presencial", label: "Presencial" },
  { v: "online", label: "Online" },
] as const;

const ESTADO_INICIAL: { error?: string; ok?: boolean } = {};

export interface GerirSessaoProps {
  sessionId: string;
  terapeutas: Opcao[];
}

export function GerirSessao({ sessionId, terapeutas }: GerirSessaoProps) {
  const [aberto, setAberto] = useState(false);
  const [estadoEscolhido, setEstadoEscolhido] =
    useState<SessionEstado>("realizada");
  const [justificada, setJustificada] = useState(false);
  const [substitutoId, setSubstitutoId] = useState<string | null>(null);
  const [modalidade, setModalidade] =
    useState<(typeof MODALIDADES)[number]["v"]>("presencial");

  const [state, formAction] = useActionState(
    marcarEstadoAction,
    ESTADO_INICIAL,
  );

  const ehFalta =
    estadoEscolhido === "falta_paciente" ||
    estadoEscolhido === "falta_terapeuta";

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button type="button" variante="neutra">
          Gerir
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Gerir sessão</DialogTitle>
        <DialogDescription>
          Marque o estado final da sessão após o atendimento.
        </DialogDescription>

        {state.error && (
          <Alert severidade="erro" titulo="Não foi possível atualizar">
            {state.error}
          </Alert>
        )}

        <form action={formAction} className="space-y-3">
          <input type="hidden" name="sessionId" value={sessionId} />
          {/* Radix Select não emite valor nativo no FormData — hidden inputs
              espelham o estado controlado. */}
          <input type="hidden" name="estado" value={estadoEscolhido} />
          <input
            type="hidden"
            name="justificada"
            value={justificada ? "true" : ""}
          />
          <input
            type="hidden"
            name="atendidoPorId"
            value={substitutoId ?? ""}
          />
          <input type="hidden" name="modalidade" value={modalidade} />

          <Field label="Estado" htmlFor="gerir-sessao-estado">
            <Select
              value={estadoEscolhido}
              onValueChange={(v) => setEstadoEscolhido(v as SessionEstado)}
            >
              <SelectTrigger id="gerir-sessao-estado" aria-label="Estado">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESTADOS.map((e) => (
                  <SelectItem key={e.v} value={e.v}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {ehFalta && (
            <div role="group" aria-label="Justificada" className="flex gap-2">
              <span className="text-ink font-display self-center text-sm font-semibold">
                Justificada
              </span>
              <Button
                type="button"
                variante={justificada ? "primaria" : "secundaria"}
                aria-pressed={justificada}
                onClick={() => setJustificada(true)}
              >
                Sim
              </Button>
              <Button
                type="button"
                variante={!justificada ? "primaria" : "secundaria"}
                aria-pressed={!justificada}
                onClick={() => setJustificada(false)}
              >
                Não
              </Button>
            </div>
          )}

          <ComboboxEntidade
            label="Substituto (quem atendeu)"
            opcoes={terapeutas}
            valor={substitutoId}
            aoSelecionar={setSubstitutoId}
          />

          <Field label="Modalidade" htmlFor="gerir-sessao-modalidade">
            <Select
              value={modalidade}
              onValueChange={(v) => setModalidade(v as typeof modalidade)}
            >
              <SelectTrigger
                id="gerir-sessao-modalidade"
                aria-label="Modalidade"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODALIDADES.map((m) => (
                  <SelectItem key={m.v} value={m.v}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Button type="submit" variante="primaria">
            Salvar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
