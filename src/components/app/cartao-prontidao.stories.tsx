import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CartaoProntidao } from "./cartao-prontidao";
import { montarProntidao, type FatosProntidao } from "@/lib/patient/prontidao";

/**
 * Story obrigatória pela spec §3.2
 * (`docs/superpowers/specs/2026-09-01-jornada-admissao-paciente-design.md`):
 * é aqui que a colisão de vocabulário do DS ("pendente / candidato /
 * bloqueado") fica visível ANTES de chegar ao prontuário. O verde de
 * "aprovado" e o violeta de "sugerido pela IA" não podem virar estado de
 * degrau; `bloqueante` usa WARNING, nunca ERROR — é ausência de dado, não
 * erro do operador.
 *
 * Os 7 estados abaixo são os da §4 da spec, na ordem da tabela.
 */

const NADA: FatosProntidao = {
  temFichaClinica: false,
  temAnamnese: false,
  temProtocoloAtivo: false,
  temMetaAtiva: false,
  temInstrumentoAplicado: false,
  temSessaoConsolidada: false,
};

const TUDO: FatosProntidao = {
  temFichaClinica: true,
  temAnamnese: true,
  temProtocoloAtivo: true,
  temMetaAtiva: true,
  temInstrumentoAplicado: true,
  temSessaoConsolidada: true,
};

const SO_FALTA_A_SESSAO: FatosProntidao = {
  ...TUDO,
  temSessaoConsolidada: false,
};

/** Açúcar para não repetir `patientId` em sete stories. */
function prontidao(
  fatos: FatosProntidao,
  role: string,
  modalidade: Parameters<
    typeof montarProntidao
  >[0]["modalidade"] = "protocol_driven",
) {
  return montarProntidao({ modalidade, fatos, role, patientId: "p1" });
}

/**
 * Moldura para os dois estados em que o cartão NÃO renderiza. Um canvas vazio
 * é indistinguível de story quebrada; a moldura pontilhada torna o vazio a
 * própria afirmação — "nada a fazer não ocupa pixel" é decisão de produto, não
 * bug.
 */
function Vazio({
  children,
  nota,
}: {
  children: React.ReactNode;
  nota: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="min-h-16 rounded-[var(--radius-md)] border-2 border-dashed border-[var(--border-brutal)] bg-[var(--surface-muted)] p-4 text-sm text-[var(--text-secondary)]">
        {nota}
      </div>
      {children}
    </div>
  );
}

const meta = {
  title: "05. PATTERNS/Clinical & Schedules/CartaoProntidao",
  component: CartaoProntidao,
  parameters: { layout: "padded" },
} satisfies Meta<typeof CartaoProntidao>;

export default meta;
type Story = StoryObj<typeof meta>;

// 1/7 — §4: "Cartão some. Nada a fazer não ocupa pixel."
export const ProntuarioPronto: Story = {
  name: "1. Prontuário pronto — o cartão some",
  args: { prontidao: prontidao(TUDO, "coordenador") },
  parameters: {
    docs: {
      description: {
        story:
          '`proximo === null`: o componente devolve `null`. Um cartão dizendo "nada a fazer" ainda cobraria scroll e atenção de quem já concluiu a escada.',
      },
    },
  },
  render: (args) => (
    <Vazio nota="O cartão não renderiza nada aqui — é o estado correto, não uma story quebrada.">
      <CartaoProntidao {...args} />
    </Vazio>
  ),
};

// 2/7 — §4: "Bloqueado, papel atual resolve → botão primário."
export const BloqueadoPapelResolve: Story = {
  name: "2. Bloqueado — o papel atual resolve",
  args: { prontidao: prontidao(NADA, "coordenador") },
  parameters: {
    docs: {
      description: {
        story:
          "Coordenação vê UM gesto primário (§3.4), nunca dois. Os dois degraus bloqueantes de `protocol_driven` (protocolo e meta) aparecem como WARNING, não ERROR.",
      },
    },
  },
};

// 3/7 — §4: "Bloqueado, papel atual NÃO resolve → sem botão morto."
export const BloqueadoAguardandoCoordenacao: Story = {
  name: "3. Bloqueado — aguardando coordenação",
  args: { prontidao: prontidao(NADA, "terapeuta") },
  parameters: {
    docs: {
      description: {
        story:
          "O terapeuta não pode prescrever protocolo: `rota` vem `null` e o cartão nomeia quem resolve. Botão que levaria ao `notFound()` do `requireRole` do destino é pior que a ausência do botão — gasta o clique e não explica nada.",
      },
    },
  },
};

// 4/7 — §4: "Modalidade não resolvida → primeiro degrau é Definir modalidade."
export const ModalidadeNaoResolvida: Story = {
  name: "4. Modalidade não resolvida",
  args: { prontidao: prontidao(NADA, "coordenador", null) },
  parameters: {
    docs: {
      description: {
        story:
          "Sem modalidade gravada não há como saber qual instrumento o modo usa. A escada encolhe para dois degraus e o único honesto — `Definir a modalidade clínica` — é bloqueante.",
      },
    },
  },
};

// 5/7 — §4: "Conta em somente-leitura → escada visível, gestos desabilitados
// pela razão que layout.tsx já exibe."
export const ContaSomenteLeitura: Story = {
  name: "5. Conta em somente-leitura",
  args: { prontidao: prontidao(NADA, "coordenador") },
  parameters: {
    docs: {
      description: {
        story:
          "PENDÊNCIA CONHECIDA: hoje `CartaoProntidao` recebe apenas `{ prontidao, titulo }` — não existe prop de somente-leitura. A tarja de razão é renderizada pelo `layout.tsx` (simulada acima), mas o gesto primário do cartão continua clicável. Fechar isso exige mudar a API do componente e está fora do escopo desta correção; a story existe para deixar o buraco visível em vez de fingir que o estado já é coberto.",
      },
    },
  },
  render: (args) => (
    <Vazio nota="Tarja de somente-leitura renderizada pelo layout.tsx — NÃO pelo cartão. O cartão abaixo ainda oferece o gesto primário.">
      <CartaoProntidao {...args} />
    </Vazio>
  ),
};

// 6/7 — §4: "Evolução sem snapshot → renderiza a escada, não mais
// 'Agendar Primeira Sessão'."
export const EvolucaoSemSnapshot: Story = {
  name: "6. Evolução sem snapshot",
  args: {
    prontidao: prontidao(SO_FALTA_A_SESSAO, "terapeuta"),
    titulo: "Para a evolução deste paciente existir",
  },
  parameters: {
    docs: {
      description: {
        story:
          "A aba Evolução sem snapshot deixa de mostrar `Agendar Primeira Sessão` e passa a mostrar a escada: tudo já está no lugar, falta documentar a primeira sessão. O degrau é `pendente` (neutro), não bloqueante — ninguém está errado, só falta o registro.",
      },
    },
  },
};

// 7/7 — §4 + §4a: "Fatos não visíveis para o papel → escada vazia, sem degrau
// clínico nomeado."
export const FatosNaoVisiveis: Story = {
  name: "7. Fatos não visíveis para o papel",
  args: { prontidao: prontidao(NADA, "admin_recepcao") },
  parameters: {
    docs: {
      description: {
        story:
          "Sob a RLS da recepção todo `EXISTS` clínico devolve `false` para linhas que EXISTEM. Nomear degrau aqui seria afirmação falsa E vazamento de estado clínico no mesmo selo — por isso `montarProntidao` devolve escada vazia e o cartão some. Fingir bloqueado é tão errado quanto fingir pronto.",
      },
    },
  },
  render: (args) => (
    <Vazio nota="Escada vazia: nenhum degrau clínico é nomeado para quem a política proíbe de ler dado clínico. O passo Documentar mostra 'Aguardando coordenação' fixo.">
      <CartaoProntidao {...args} />
    </Vazio>
  ),
};
