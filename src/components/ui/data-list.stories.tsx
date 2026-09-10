import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { DataList, DataListGroup, DataListRow } from "./data-list";
import { DataRow } from "./data-row";
import { Button } from "./button";
import { Pill } from "./primitives/pill";
import { StatusBadge } from "./patterns/status-badge";

const meta = {
  title: "04. UI COMPONENTS/Data Display & Feedback/DataList",
  component: DataList,
  parameters: { layout: "padded" },
} satisfies Meta<typeof DataList>;

export default meta;
type Story = StoryObj<typeof meta>;

type Linha = {
  id: string;
  hora: string;
  paciente: string;
  estado: "sugerida" | "aprovada" | "editada";
};

const grupos: { terapeuta: string; sessoes: Linha[] }[] = [
  {
    terapeuta: "Rômulo Sutil Corrêa",
    sessoes: [
      { id: "1", hora: "07:00", paciente: "Melinda", estado: "sugerida" },
      {
        id: "2",
        hora: "08:00",
        paciente: "Benjamin Rodrigues Sutil",
        estado: "sugerida",
      },
      {
        id: "3",
        hora: "09:00",
        paciente: "Ana Clara Ferreira",
        estado: "aprovada",
      },
      {
        id: "4",
        hora: "10:00",
        paciente: "Theo Nascimento",
        estado: "editada",
      },
      {
        id: "5",
        hora: "11:00",
        paciente: "Maria Eduarda Lopes",
        estado: "sugerida",
      },
      { id: "6", hora: "14:00", paciente: "Gabriel Lima", estado: "sugerida" },
    ],
  },
  {
    terapeuta: "Dra. Mariana Costa",
    sessoes: [
      { id: "7", hora: "07:30", paciente: "Lucas Santos", estado: "sugerida" },
      {
        id: "8",
        hora: "08:30",
        paciente: "Beatriz Oliveira",
        estado: "aprovada",
      },
      {
        id: "9",
        hora: "13:00",
        paciente: "Isabela Martins",
        estado: "sugerida",
      },
      {
        id: "10",
        hora: "15:00",
        paciente: "Pedro Henrique Alves",
        estado: "editada",
      },
    ],
  },
];

const total = grupos.reduce((n, g) => n + g.sessoes.length, 0);

function Cabecalho() {
  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="rounded-[var(--radius-xs)] border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2 py-0.5 font-mono text-xs font-bold text-[var(--status-warning-fg)]">
          [PENDÊNCIAS]
        </span>
        <Pill variant="outline" size="sm" className="tabular-nums">
          {total}
        </Pill>
        <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
          Pendentes de consolidação
        </h2>
      </div>
      <Button variante="neutra" tamanho="sm" aria-expanded>
        Recolher
      </Button>
    </>
  );
}

export const FilaAgrupada: Story = {
  render: () => (
    <div className="max-w-4xl">
      <DataList cabecalho={<Cabecalho />}>
        {grupos.map((g) => (
          <DataListGroup
            key={g.terapeuta}
            titulo={g.terapeuta}
            contagem={g.sessoes.length}
          >
            {g.sessoes.map((s) => (
              <DataListRow
                key={s.id}
                inicio={s.hora}
                titulo={s.paciente}
                estado={<StatusBadge estado={s.estado} />}
                acoes={
                  <Button variante="neutra" tamanho="sm">
                    Gerenciar
                  </Button>
                }
              />
            ))}
          </DataListGroup>
        ))}
      </DataList>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Uma superfície, N linhas de 56px em colunas fixas (hora | nome | estado | ação). Cabeçalho do grupo pegajoso ao rolar. Dez itens ocupam ~600px; no padrão anterior (um card por item) ocupavam ~950px.",
      },
    },
  },
};

export const ListaSimples: Story = {
  render: () => (
    <div className="max-w-3xl">
      <DataList como="ul" aria-label="Terapeutas">
        {grupos
          .flatMap((g) => g.sessoes)
          .slice(0, 5)
          .map((s) => (
            <DataListRow
              key={s.id}
              titulo={s.paciente}
              detalhe="Psicologia · presencial"
              estado={<StatusBadge estado={s.estado} />}
              acoes={
                <Button variante="terciaria" tamanho="sm">
                  Ver prontuário →
                </Button>
              }
            />
          ))}
      </DataList>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Sem grupos nem coluna de início: `como="ul"` e as linhas direto. Serve para listas de pacientes, equipe, feriados.',
      },
    },
  },
};

export const RolagemLonga: Story = {
  render: () => (
    <div className="h-[420px] max-w-4xl overflow-auto">
      <DataList cabecalho={<Cabecalho />}>
        {grupos.map((g) => (
          <DataListGroup
            key={g.terapeuta}
            titulo={g.terapeuta}
            contagem={g.sessoes.length * 3}
          >
            {[0, 1, 2].flatMap((rep) =>
              g.sessoes.map((s) => (
                <DataListRow
                  key={`${rep}-${s.id}`}
                  inicio={s.hora}
                  titulo={s.paciente}
                  estado={<StatusBadge estado={s.estado} />}
                  acoes={
                    <Button variante="neutra" tamanho="sm">
                      Gerenciar
                    </Button>
                  }
                />
              )),
            )}
          </DataListGroup>
        ))}
      </DataList>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Container com altura limitada para ver o cabeçalho de grupo pegajoso: ao rolar 30 linhas, o nome do terapeuta continua visível.",
      },
    },
  },
};

export const AntesEDepois: Story = {
  render: () => {
    const amostra = grupos[0]!.sessoes.slice(0, 4);
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <section
          aria-label="Antes: um card por item"
          className="flex flex-col gap-2"
        >
          <h3 className="font-mono text-xs font-bold text-[var(--text-secondary)] uppercase">
            Antes — card por item
          </h3>
          <ul className="flex flex-col gap-1.5">
            {amostra.map((s) => (
              <DataRow
                key={s.id}
                como="li"
                title={
                  <span className="flex items-center gap-2">
                    <span className="font-display text-lg font-bold">
                      {s.hora}
                    </span>
                    <StatusBadge estado={s.estado} />
                  </span>
                }
                subtitle={s.paciente}
                trailing={
                  <Button variante="neutra" tamanho="sm">
                    Gerenciar
                  </Button>
                }
              />
            ))}
          </ul>
        </section>
        <section
          aria-label="Depois: lista densa"
          className="flex flex-col gap-2"
        >
          <h3 className="font-mono text-xs font-bold text-[var(--text-secondary)] uppercase">
            Depois — DataList
          </h3>
          <DataList como="ul">
            {amostra.map((s) => (
              <DataListRow
                key={s.id}
                inicio={s.hora}
                titulo={s.paciente}
                estado={<StatusBadge estado={s.estado} />}
                acoes={
                  <Button variante="neutra" tamanho="sm">
                    Gerenciar
                  </Button>
                }
              />
            ))}
          </DataList>
        </section>
      </div>
    );
  },
};
