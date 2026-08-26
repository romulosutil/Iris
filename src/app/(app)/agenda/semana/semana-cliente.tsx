"use client";

import { useEffect, useState, useTransition } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  diasDaSemana,
  segundaDaSemana,
  semanaEhPassada,
} from "@/lib/agenda/semana";
import { CalendarioSemana } from "./calendario-semana";
import { PopoverAlocar } from "./popover-alocar";
import { PopoverRegra } from "./popover-regra";
import { ComboboxEntidade, type Opcao } from "./combobox-entidade";
import {
  carregarSemanaAction,
  listarPacientesAction,
  proximaSessaoAction,
} from "./actions";
import type { BlocoAgenda } from "@/lib/agenda/projecao";
import type { FaixaDia } from "@/lib/agenda/janela";

interface DadosSemana {
  blocos: BlocoAgenda[];
  janelas: FaixaDia[];
  bloqueios: { dataInicio: string; dataFim: string }[];
}

const SEM_DADOS: DadosSemana = { blocos: [], janelas: [], bloqueios: [] };

/** Task 8: prefill de reposição (vindo de `/agenda/semana?repor=...` — botão
 * "Repor" em faltas). `terapeutaId` é o terapeuta PREVISTO da falta original,
 * editável no calendário (só fixa a entidade inicial do eixo="terapeuta"). */
export interface Prefill {
  repostaDe: string;
  patientId: string;
  patientNome: string;
  terapeutaId: string;
  disciplina: string;
}

interface Props {
  terapeutas: Opcao[];
  semanaInicialISO: string;
  hojeISO: string;
  disciplinas: string[];
  duracaoPadrao: Record<string, number>;
  prefill?: Prefill;
  fuso: string;
}

function recuarSemana(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}
function avancarSemana(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

/**
 * Shell client: mantém estado de UI (eixo/semana/entidade/slot selecionado)
 * e orquestra grade + popover. A leitura por semana é reativa — dispara
 * `carregarSemanaAction` (Server Action fina sobre `carregarSemana`) sempre
 * que eixo/semana/entidade mudam.
 */
export function SemanaCliente({
  terapeutas,
  semanaInicialISO,
  hojeISO,
  disciplinas,
  duracaoPadrao,
  prefill,
  fuso,
}: Props) {
  // Task 8 (reposição): eixo é sempre "terapeuta" quando há prefill — a
  // entidade fixa no calendário é o terapeuta PREVISTO da falta (editável
  // aqui, via combobox), enquanto paciente+disciplina ficam fixados no
  // popover ao abrir o slot. Trocar de eixo perderia esse contexto, então o
  // toggle Por terapeuta/Por paciente é escondido nesse fluxo.
  const [eixo, setEixo] = useState<"terapeuta" | "paciente">("terapeuta");
  const [semanaISO, setSemanaISO] = useState(semanaInicialISO);
  const [entidade, setEntidade] = useState<Opcao | null>(() => {
    if (prefill) {
      return (
        terapeutas.find((t) => t.id === prefill.terapeutaId) ?? {
          id: prefill.terapeutaId,
          nome: "—",
        }
      );
    }
    return terapeutas[0] ?? null;
  });
  const [pacientes, setPacientes] = useState<Opcao[]>([]);
  const [slot, setSlot] = useState<{
    diaSemana: number;
    inicioMin: number;
    dataISO: string;
  } | null>(null);
  const [dados, setDados] = useState<DadosSemana>(SEM_DADOS);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, iniciarTransicao] = useTransition();
  const [regraSelecionada, setRegraSelecionada] = useState<{
    id: string;
    rotulo: string;
    proximaSessaoISO: string | null;
  } | null>(null);

  const dias = diasDaSemana(semanaISO);
  const passada = semanaEhPassada(semanaISO, hojeISO);
  const opcoesEntidade = eixo === "terapeuta" ? terapeutas : pacientes;

  // Leitura reativa (o adendo da Task 11): recarrega a semana quando
  // eixo/entidade/semana mudam. `carregarSemana` já valida tenant+papel.
  useEffect(() => {
    if (!entidade) return;
    let cancelado = false;
    iniciarTransicao(async () => {
      try {
        const r = await carregarSemanaAction({
          eixo,
          entidadeId: entidade.id,
          semanaInicioISO: segundaDaSemana(semanaISO),
        });
        if (!cancelado) {
          setDados(r);
          setErro(null);
        }
      } catch {
        if (!cancelado)
          setErro("Não foi possível carregar a semana. Tente novamente.");
      }
    });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eixo, entidade?.id, semanaISO]);

  const dadosVisiveis = entidade ? dados : SEM_DADOS;

  function buscarPacientes(termo: string) {
    iniciarTransicao(async () => {
      const r = await listarPacientesAction(termo);
      setPacientes(r);
    });
  }

  // Etapa D (F4): leitura fina no clique — evita inchar SemanaCarregada com
  // "próxima sessão" pré-carregada por regra.
  async function abrirRegra(regraId: string, rotulo: string) {
    const proximaSessaoISO = await proximaSessaoAction(regraId);
    setRegraSelecionada({ id: regraId, rotulo, proximaSessaoISO });
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Agenda Semanal"
        description="Alocação de grade de horários, reposição de sessões e conciliação de agendas da equipe."
      />

      <div className="flex flex-wrap items-end justify-between gap-6 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4 shadow-[var(--ds-shadow)]">
        <div className="flex flex-wrap items-end gap-6">
          {prefill ? (
            <p className="font-body self-center text-sm text-[var(--text-primary)]">
              Repondo sessão de <strong>{prefill.patientNome}</strong> (
              {prefill.disciplina.toUpperCase()}) — escolha o novo horário.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <span className="font-display text-xs font-bold tracking-wider text-[var(--text-secondary)] uppercase">
                Visualização
              </span>
              <Tabs
                value={eixo}
                onValueChange={(v) => {
                  const novoEixo = v as typeof eixo;
                  setEixo(novoEixo);
                  setEntidade(
                    novoEixo === "terapeuta" ? (terapeutas[0] ?? null) : null,
                  );
                }}
              >
                <TabsList>
                  <TabsTrigger value="terapeuta">Por terapeuta</TabsTrigger>
                  <TabsTrigger value="paciente">Por paciente</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          )}
          <div className="w-72">
            <ComboboxEntidade
              label={eixo === "terapeuta" ? "Terapeuta" : "Paciente"}
              opcoes={opcoesEntidade}
              valor={entidade?.id ?? null}
              aoSelecionar={(id) =>
                setEntidade(opcoesEntidade.find((o) => o.id === id) ?? null)
              }
              aoBuscar={eixo === "paciente" ? buscarPacientes : undefined}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="font-display text-xs font-bold tracking-wider text-[var(--text-secondary)] uppercase">
            Navegação Semanal
          </span>
          <div className="flex items-center gap-2">
            <Button
              variante="secundaria"
              tamanho="sm"
              onClick={() => setSemanaISO(recuarSemana(semanaISO))}
            >
              ← Semana anterior
            </Button>
            <Button
              variante="secundaria"
              tamanho="sm"
              onClick={() => setSemanaISO(avancarSemana(semanaISO))}
            >
              Próxima semana →
            </Button>
          </div>
        </div>
      </div>

      {passada && (
        <p
          role="status"
          className="font-body text-sm text-[var(--text-primary)]"
        >
          Semana passada — alocação desabilitada (C7).
        </p>
      )}
      {erro && (
        <Alert severidade="erro" titulo="Erro ao carregar">
          {erro}
        </Alert>
      )}

      <CalendarioSemana
        dias={dias}
        passoMin={60}
        abertura="07:00"
        fechamento="20:00"
        janelas={dadosVisiveis.janelas}
        bloqueios={dadosVisiveis.bloqueios}
        blocos={dadosVisiveis.blocos}
        fuso={fuso}
        aoAlocar={(diaSemana, inicioMin) => {
          if (passada || carregando) return;
          const dataISO = dias[diaSemana === 0 ? 6 : diaSemana - 1]!;
          setSlot({ diaSemana, inicioMin, dataISO });
        }}
        aoAbrirRegra={abrirRegra}
      />

      {slot && entidade && (
        <PopoverAlocar
          aberto
          aoFechar={() => setSlot(null)}
          diaSemana={slot.diaSemana}
          inicioMin={slot.inicioMin}
          dataISO={slot.dataISO}
          semanaVisivelISO={semanaISO}
          hojeISO={hojeISO}
          eixo={eixo}
          entidadeFixa={entidade}
          pacientes={eixo === "terapeuta" ? pacientes : []}
          terapeutas={terapeutas}
          disciplinas={disciplinas}
          duracaoPadrao={duracaoPadrao}
          aoBuscarEntidadeVar={
            eixo === "terapeuta" ? buscarPacientes : undefined
          }
          reposicao={
            prefill
              ? {
                  repostaDe: prefill.repostaDe,
                  pacienteFixo: {
                    id: prefill.patientId,
                    nome: prefill.patientNome,
                  },
                  disciplinaFixa: prefill.disciplina,
                }
              : undefined
          }
        />
      )}

      {regraSelecionada && (
        <PopoverRegra
          regraId={regraSelecionada.id}
          rotulo={regraSelecionada.rotulo}
          proximaSessaoISO={regraSelecionada.proximaSessaoISO}
          hojeISO={hojeISO}
          onClose={() => setRegraSelecionada(null)}
        />
      )}
    </section>
  );
}
