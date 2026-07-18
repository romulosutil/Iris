"use client";

import { useEffect, useState, useTransition } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { diasDaSemana, segundaDaSemana, semanaEhPassada } from "@/lib/agenda/semana";
import { CalendarioSemana } from "./calendario-semana";
import { PopoverAlocar } from "./popover-alocar";
import { ComboboxEntidade, type Opcao } from "./combobox-entidade";
import { carregarSemanaAction, listarPacientesAction } from "./actions";
import type { BlocoAgenda } from "@/lib/agenda/projecao";
import type { FaixaDia } from "@/lib/agenda/janela";

interface DadosSemana {
  blocos: BlocoAgenda[];
  janelas: FaixaDia[];
  bloqueios: { dataInicio: string; dataFim: string }[];
}

const SEM_DADOS: DadosSemana = { blocos: [], janelas: [], bloqueios: [] };

interface Props {
  terapeutas: Opcao[];
  semanaInicialISO: string;
  hojeISO: string;
  disciplinas: string[];
  duracaoPadrao: Record<string, number>;
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
}: Props) {
  const [eixo, setEixo] = useState<"terapeuta" | "paciente">("terapeuta");
  const [semanaISO, setSemanaISO] = useState(semanaInicialISO);
  const [entidade, setEntidade] = useState<Opcao | null>(terapeutas[0] ?? null);
  const [pacientes, setPacientes] = useState<Opcao[]>([]);
  const [slot, setSlot] = useState<{
    diaSemana: number;
    inicioMin: number;
    dataISO: string;
  } | null>(null);
  const [dados, setDados] = useState<DadosSemana>(SEM_DADOS);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, iniciarTransicao] = useTransition();

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
        if (!cancelado) setErro("Não foi possível carregar a semana. Tente novamente.");
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

  return (
    <section className="space-y-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <Tabs
          value={eixo}
          onValueChange={(v) => {
            const novoEixo = v as typeof eixo;
            setEixo(novoEixo);
            setEntidade(novoEixo === "terapeuta" ? (terapeutas[0] ?? null) : null);
          }}
        >
          <TabsList>
            <TabsTrigger value="terapeuta">Por terapeuta</TabsTrigger>
            <TabsTrigger value="paciente">Por paciente</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="min-w-64">
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
        <div className="ml-auto flex gap-2">
          <Button variante="secundaria" onClick={() => setSemanaISO(recuarSemana(semanaISO))}>
            ← Semana
          </Button>
          <Button variante="secundaria" onClick={() => setSemanaISO(avancarSemana(semanaISO))}>
            Semana →
          </Button>
        </div>
      </header>

      {passada && (
        <p role="status" className="text-ink font-body text-sm">
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
        passoMin={30}
        abertura="08:00"
        fechamento="18:00"
        janelas={dadosVisiveis.janelas}
        bloqueios={dadosVisiveis.bloqueios}
        blocos={dadosVisiveis.blocos}
        aoAlocar={(diaSemana, inicioMin) => {
          if (passada || carregando) return;
          const dataISO = dias[diaSemana === 0 ? 6 : diaSemana - 1]!;
          setSlot({ diaSemana, inicioMin, dataISO });
        }}
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
          aoBuscarEntidadeVar={eixo === "terapeuta" ? buscarPacientes : undefined}
        />
      )}
    </section>
  );
}
