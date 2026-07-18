"use client";

import { useActionState, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
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
import { Input } from "@/components/ui/input";
import { minParaHora } from "@/lib/agenda/janela";
import {
  criarAvulsaAction,
  criarRegraAction,
  type EstadoAcao,
} from "./actions";
import { ComboboxEntidade, type Opcao } from "./combobox-entidade";

const TIPOS_AVULSA = [
  { v: "avaliacao", label: "Avaliação" },
  { v: "devolutiva", label: "Devolutiva" },
  { v: "reuniao_pais", label: "Reunião de pais" },
  { v: "outro", label: "Outro" },
] as const;

export interface PopoverAlocarProps {
  aberto: boolean;
  aoFechar: () => void;
  diaSemana: number;
  inicioMin: number;
  dataISO: string;
  semanaVisivelISO: string;
  hojeISO: string;
  eixo: "terapeuta" | "paciente";
  entidadeFixa: { id: string; nome: string };
  pacientes: Opcao[];
  terapeutas: Opcao[];
  disciplinas: string[];
  duracaoPadrao: Record<string, number>;
  /** Busca (debounced) do combobox de entidade variável — só relevante no
   * eixo terapeuta, onde a entidade variável é o paciente (lista grande). */
  aoBuscarEntidadeVar?: (termo: string) => void;
}

const ESTADO_INICIAL: EstadoAcao = {};

function formatarDataBR(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function PopoverAlocar(props: PopoverAlocarProps) {
  const [modo, setModo] = useState<"recorrente" | "avulsa">("recorrente");
  const [disciplina, setDisciplina] = useState(props.disciplinas[0] ?? "");
  const [tipo, setTipo] = useState<(typeof TIPOS_AVULSA)[number]["v"]>("avaliacao");
  const [entidadeVar, setEntidadeVar] = useState<string | null>(null);
  const [duracao, setDuracao] = useState(props.duracaoPadrao[disciplina] ?? 60);

  const action = modo === "recorrente" ? criarRegraAction : criarAvulsaAction;
  const [estado, formAction] = useActionState<EstadoAcao, FormData>(
    action,
    ESTADO_INICIAL,
  );

  const pedePaciente = props.eixo === "terapeuta";
  const opcoesVar = pedePaciente ? props.pacientes : props.terapeutas;
  const patientId = pedePaciente ? entidadeVar : props.entidadeFixa.id;
  const terapeutaId = pedePaciente ? props.entidadeFixa.id : entidadeVar;

  function trocarDisciplina(d: string) {
    setDisciplina(d);
    setDuracao(props.duracaoPadrao[d] ?? 60);
  }

  return (
    <Dialog open={props.aberto} onOpenChange={(o) => !o && props.aoFechar()}>
      <DialogContent>
        <DialogTitle>Alocar horário</DialogTitle>
        <DialogDescription>
          {formatarDataBR(props.dataISO)} às {minParaHora(props.inicioMin)}
        </DialogDescription>

        {/* Toggle Recorrente | Avulsa (C6) */}
        <div role="group" aria-label="Tipo de alocação" className="my-3 flex gap-2">
          <Button
            type="button"
            variante={modo === "recorrente" ? "primaria" : "secundaria"}
            aria-pressed={modo === "recorrente"}
            onClick={() => setModo("recorrente")}
          >
            Recorrente
          </Button>
          <Button
            type="button"
            variante={modo === "avulsa" ? "primaria" : "secundaria"}
            aria-pressed={modo === "avulsa"}
            onClick={() => setModo("avulsa")}
          >
            Avulsa
          </Button>
        </div>

        {estado.error && (
          <Alert severidade="erro" titulo="Não foi possível alocar">
            {estado.error}
          </Alert>
        )}

        <form action={formAction} className="space-y-3">
          <input type="hidden" name="patientId" value={patientId ?? ""} />
          <input type="hidden" name="terapeutaId" value={terapeutaId ?? ""} />
          <input type="hidden" name="diaSemana" value={props.diaSemana} />
          <input type="hidden" name="horaInicio" value={minParaHora(props.inicioMin)} />
          <input type="hidden" name="duracaoMin" value={duracao} />
          <input type="hidden" name="semanaVisivelISO" value={props.semanaVisivelISO} />
          <input type="hidden" name="hojeISO" value={props.hojeISO} />
          <input type="hidden" name="dataISO" value={props.dataISO} />
          {/* Radix Select não emite valor nativo no FormData — hidden inputs
              espelham o estado controlado para `disciplina`/`tipo`. */}
          <input type="hidden" name="disciplina" value={disciplina} />
          {modo === "avulsa" && <input type="hidden" name="tipo" value={tipo} />}
          <input type="hidden" name="modalidade" value="presencial" />

          <ComboboxEntidade
            label={pedePaciente ? "Paciente" : "Terapeuta"}
            opcoes={opcoesVar}
            valor={entidadeVar}
            aoSelecionar={setEntidadeVar}
            aoBuscar={pedePaciente ? props.aoBuscarEntidadeVar : undefined}
          />

          <Field label="Disciplina" htmlFor="popover-alocar-disciplina">
            <Select value={disciplina} onValueChange={trocarDisciplina}>
              <SelectTrigger id="popover-alocar-disciplina">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {props.disciplinas.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {modo === "avulsa" && (
            <Field label="Tipo" htmlFor="popover-alocar-tipo">
              <Select
                value={tipo}
                onValueChange={(v) => setTipo(v as typeof tipo)}
              >
                <SelectTrigger id="popover-alocar-tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_AVULSA.map((t) => (
                    <SelectItem key={t.v} value={t.v}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <Field label="Duração (min)" htmlFor="popover-alocar-duracao">
            <Input
              id="popover-alocar-duracao"
              type="number"
              min={5}
              step={5}
              value={duracao}
              onChange={(e) => setDuracao(Number(e.target.value))}
            />
          </Field>

          <Button type="submit" variante="primaria">
            Confirmar alocação
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
