import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AnamneseForm } from "./anamnese-form";

const meta: Meta<typeof AnamneseForm> = {
  title: "05. PATTERNS/Clinical & Schedules/AnamneseForm",
  component: AnamneseForm,
  parameters: {
    layout: "padded",
  },
};
export default meta;

type Story = StoryObj<typeof AnamneseForm>;

const milestonesMock = [
  { id: "m1", rotulo: "Mando 1 — Pede itens desejados com 1 palavra" },
  { id: "m2", rotulo: "Tato 1 — Nomeia 5 objetos familiares" },
  { id: "m3", rotulo: "Ecoico 1 — Repete sons vocálicos simples" },
];

const taxonomiaMock = [
  "Independente",
  "Dica Verbal",
  "Dica Gestual",
  "Modelação",
  "Dica Física",
];

/** 1. Estado Vazio: terapeuta ou coordenador iniciando o preenchimento */
export const Vazio: Story = {
  args: {
    patientId: "00000000-0000-0000-0000-000000000001",
    patientNome: "Lucas Silva",
    isCoordenador: true,
    anamnese: null,
    milestones: milestonesMock,
    taxonomiaAjuda: taxonomiaMock,
  },
};

/** 2. Estado Preenchido: rascunho em andamento com múltiplos eixos */
export const Preenchido: Story = {
  args: {
    patientId: "00000000-0000-0000-0000-000000000001",
    patientNome: "Lucas Silva",
    isCoordenador: true,
    anamnese: {
      id: "ana-01",
      estado: "rascunho",
      criadoEm: "2026-03-01T10:00:00Z",
      alvos: [
        {
          id: "alvo-1",
          eixo: "comunicacao_expressiva",
          descricao: "Pedir água apontando ou falando",
          disciplina: "ABA",
          milestone_id: "m1",
          nivel_ajuda_inicial: 1, // Dica Verbal
          procedencia: "relatado_responsavel",
          criterio_n: 3,
          criterio_m: 4,
          ciclo_revisao_semanas: 8,
        },
        {
          id: "alvo-2",
          eixo: "social_brincar",
          descricao: "Brincar de carrinho em paralelo",
          disciplina: "TO",
          milestone_id: null,
          nivel_ajuda_inicial: null, // Não avaliado
          procedencia: "observado_avaliador",
          criterio_n: 3,
          criterio_m: 4,
          ciclo_revisao_semanas: 8,
        },
      ],
    },
    milestones: milestonesMock,
    taxonomiaAjuda: taxonomiaMock,
  },
};

/** 3. Estado no Teto: 24 alvos cadastrados (bloqueio do 25º) */
export const NoTeto: Story = {
  args: {
    patientId: "00000000-0000-0000-0000-000000000001",
    patientNome: "Lucas Silva",
    isCoordenador: true,
    anamnese: {
      id: "ana-02",
      estado: "rascunho",
      criadoEm: "2026-03-01T10:00:00Z",
      alvos: Array.from({ length: 24 }, (_, i) => ({
        id: `alvo-${i + 1}`,
        eixo: "comunicacao_expressiva",
        descricao: `Alvo do teto #${i + 1}`,
        disciplina: "ABA",
        milestone_id: null,
        nivel_ajuda_inicial: 2,
        procedencia: "registro_anterior" as const,
        criterio_n: 3,
        criterio_m: 4,
        ciclo_revisao_semanas: 8,
      })),
    },
    milestones: milestonesMock,
    taxonomiaAjuda: taxonomiaMock,
  },
};

/** 4. Estado Validada: somente leitura com chips e link para timeline */
export const Validada: Story = {
  args: {
    patientId: "00000000-0000-0000-0000-000000000001",
    patientNome: "Lucas Silva",
    isCoordenador: false,
    anamnese: {
      id: "ana-03",
      estado: "validada",
      validadaEm: "2026-03-05T14:30:00Z",
      validadaPorNome: "Dra. Ana Coordenadora",
      criadoEm: "2026-03-01T10:00:00Z",
      alvos: [
        {
          id: "alvo-val-1",
          eixo: "comunicacao_expressiva",
          descricao: "Expressar desejo de pausa com apoio gestual",
          disciplina: "ABA",
          milestone_id: "m1",
          nivel_ajuda_inicial: 2,
          procedencia: "relatado_responsavel",
          criterio_n: 3,
          criterio_m: 4,
          ciclo_revisao_semanas: 8,
        },
        {
          id: "alvo-val-2",
          eixo: "autonomia_motor",
          descricao: "Lavar e secar as mãos autonomamente",
          disciplina: "TO",
          milestone_id: null,
          nivel_ajuda_inicial: 0,
          procedencia: "observado_avaliador",
          criterio_n: 3,
          criterio_m: 4,
          ciclo_revisao_semanas: 8,
        },
      ],
    },
    milestones: milestonesMock,
    taxonomiaAjuda: taxonomiaMock,
  },
};
