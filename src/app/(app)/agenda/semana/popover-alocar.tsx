"use client";

import { useEffect, useMemo, useActionState, useState } from "react";
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
  listarDisciplinasEquipeAction,
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
  aoBuscarEntidadeVar?: (termo: string) => void;
  reposicao?: {
    repostaDe: string;
    pacienteFixo: { id: string; nome: string };
    disciplinaFixa: string;
  };
}

const ESTADO_INICIAL: EstadoAcao = {};

function formatarDataBR(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function PopoverAlocar(props: PopoverAlocarProps) {
  const reposicao = props.reposicao;
  const [modo, setModo] = useState<"recorrente" | "avulsa">(reposicao ? "avulsa" : "recorrente");
  const [disciplina, setDisciplina] = useState(
    reposicao?.disciplinaFixa ?? props.disciplinas[0] ?? "",
  );
  const [tipo, setTipo] = useState<"terapia" | (typeof TIPOS_AVULSA)[number]["v"]>(
    reposicao ? "terapia" : "avaliacao",
  );
  const [entidadeVar, setEntidadeVar] = useState<string | null>(
    reposicao ? reposicao.pacienteFixo.id : null,
  );
  const [duracao, setDuracao] = useState(props.duracaoPadrao[disciplina] ?? 60);
  const [disciplinasEquipe, setDisciplinasEquipe] = useState<string[]>([]);
  const [mostrarTodasDisciplinas, setMostrarTodasDisciplinas] = useState(false);

  const action = modo === "recorrente" ? criarRegraAction : criarAvulsaAction;
  const [estado, formAction] = useActionState<EstadoAcao, FormData>(
    action,
    ESTADO_INICIAL,
  );

  const pedePaciente = props.eixo === "terapeuta";
  const opcoesVar = pedePaciente ? props.pacientes : props.terapeutas;
  const patientId = pedePaciente ? entidadeVar : props.entidadeFixa.id;
  const terapeutaId = pedePaciente ? props.entidadeFixa.id : entidadeVar;

  // Busca disciplinas vinculadas na equipe de cuidado do paciente/terapeuta selecionado
  useEffect(() => {
    if (!patientId && !terapeutaId) return;
    let cancelado = false;
    listarDisciplinasEquipeAction(patientId, terapeutaId)
      .then((list) => {
        if (!cancelado) {
          setDisciplinasEquipe(list);
          if (list.length > 0 && !reposicao) {
            setDisciplina((dAtual) => {
              const matched = props.disciplinas.find(
                (d) => d.toLowerCase() === dAtual.toLowerCase() || list.includes(d.toLowerCase()),
              );
              return matched ?? list[0]!;
            });
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [patientId, terapeutaId, reposicao, props.disciplinas]);

  const disciplinasDisponiveis = useMemo(() => {
    if (mostrarTodasDisciplinas || disciplinasEquipe.length === 0) {
      return props.disciplinas;
    }
    const filtradas = props.disciplinas.filter((d) =>
      disciplinasEquipe.includes(d.toLowerCase()),
    );
    return filtradas.length > 0 ? filtradas : props.disciplinas;
  }, [props.disciplinas, disciplinasEquipe, mostrarTodasDisciplinas]);

  function trocarDisciplina(d: string) {
    setDisciplina(d);
    setDuracao(props.duracaoPadrao[d] ?? 60);
  }

  useEffect(() => {
    if (estado.ok) {
      const timer = setTimeout(() => {
        props.aoFechar();
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [estado.ok, props]);

  return (
    <Dialog open={props.aberto} onOpenChange={(o) => !o && props.aoFechar()}>
      <DialogContent>
        <DialogTitle>Alocar horário</DialogTitle>
        <DialogDescription>
          {formatarDataBR(props.dataISO)} às {minParaHora(props.inicioMin)}
        </DialogDescription>

        {/* Toggle Recorrente | Avulsa (C6) — reposição não é regra, sempre
            grava avulsa com repostaDe; toggle não faz sentido aqui. */}
        {!reposicao && (
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
        )}

        {estado.error && (
          <Alert severidade="erro" titulo="Não foi possível alocar">
            {estado.error}
          </Alert>
        )}

        {estado.ok && (
          <Alert severidade="sucesso" titulo="Alocação realizada com sucesso">
            {modo === "recorrente"
              ? "Regra de agendamento recorrente criada e sessões reservadas na agenda."
              : "Sessão avulsa alocada com sucesso na agenda."}
          </Alert>
        )}

        <form action={formAction} className="space-y-4 mt-2">
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
          <input type="hidden" name="repostaDe" value={reposicao?.repostaDe ?? ""} />

          {reposicao ? (
            <Field label="Paciente" htmlFor="popover-alocar-paciente-fixo">
              <Input
                id="popover-alocar-paciente-fixo"
                value={reposicao.pacienteFixo.nome}
                readOnly
                disabled
              />
            </Field>
          ) : (
            <ComboboxEntidade
              label={pedePaciente ? "Paciente" : "Terapeuta"}
              opcoes={opcoesVar}
              valor={entidadeVar}
              aoSelecionar={setEntidadeVar}
              aoBuscar={pedePaciente ? props.aoBuscarEntidadeVar : undefined}
              placeholder={pedePaciente ? "Selecione ou busque um paciente..." : "Selecione um terapeuta..."}
            />
          )}

          {reposicao ? (
            <Field label="Disciplina" htmlFor="popover-alocar-disciplina-fixa">
              <Input
                id="popover-alocar-disciplina-fixa"
                value={disciplina.toUpperCase()}
                readOnly
                disabled
              />
            </Field>
          ) : (
            <Field label="Disciplina" htmlFor="popover-alocar-disciplina">
              <Select value={disciplina} onValueChange={trocarDisciplina}>
                <SelectTrigger id="popover-alocar-disciplina">
                  <SelectValue placeholder="Selecione a disciplina..." />
                </SelectTrigger>
                <SelectContent>
                  {disciplinasDisponiveis.map((d) => {
                    const ehDaEquipe = disciplinasEquipe.includes(d.toLowerCase());
                    return (
                      <SelectItem key={d} value={d}>
                        {d.toUpperCase()} {ehDaEquipe ? " (Equipe de Cuidado)" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {disciplinasEquipe.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMostrarTodasDisciplinas((v) => !v)}
                  className="text-xs text-[var(--text-secondary)] underline hover:text-[var(--text-primary)] mt-1 font-body text-left cursor-pointer"
                >
                  {mostrarTodasDisciplinas
                    ? "Filtrar por disciplinas da equipe do paciente"
                    : "Mostrar todas as disciplinas da clínica"}
                </button>
              )}
            </Field>
          )}

          {modo === "avulsa" && !reposicao && (
            <Field label="Tipo" htmlFor="popover-alocar-tipo">
              <Select
                value={tipo}
                onValueChange={(v) => setTipo(v as typeof tipo)}
              >
                <SelectTrigger id="popover-alocar-tipo">
                  <SelectValue placeholder="Selecione o tipo de sessão..." />
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

          <Field label="Duração da Sessão" htmlFor="popover-alocar-duracao">
            <Select
              value={String(duracao)}
              onValueChange={(v) => setDuracao(Number(v))}
            >
              <SelectTrigger id="popover-alocar-duracao" aria-label="Duração da Sessão">
                <SelectValue placeholder="Selecione a duração..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 minutos</SelectItem>
                <SelectItem value="45">45 minutos</SelectItem>
                <SelectItem value="50">50 minutos (Sessão ABA)</SelectItem>
                <SelectItem value="60">60 minutos (1 hora)</SelectItem>
                <SelectItem value="90">90 minutos (1h30min)</SelectItem>
                <SelectItem value="120">120 minutos (2 horas)</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Button type="submit" variante="primaria" className="w-full mt-2">
            Confirmar alocação
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
