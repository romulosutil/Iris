import {
  capacidadesDaModalidade,
  type DegrauId,
  type ModalidadeClinica,
} from "@/app/(app)/pacientes/[id]/modalidade";

/**
 * Prontidão do prontuário — o objeto paciente sabendo o próprio estado e
 * nomeando o gesto seguinte. Escala para o paciente o padrão que a #512
 * estabeleceu para a sessão.
 *
 * Função PURA de propósito: recebe fatos já lidos, nunca decide o que ler. É
 * esse limite que a torna testável na matriz completa modalidade × fatos ×
 * papel sem tocar banco. Quem lê os fatos é `prontidao-queries.ts`.
 *
 * Nada aqui é persistido: prontidão derivada nunca mente sobre um degrau
 * desfeito — a última meta descontinuada devolve o paciente ao estado
 * bloqueado no mesmo instante. Uma coluna `prontidao_status` continuaria verde
 * para sempre.
 */

export interface FatosProntidao {
  temFichaClinica: boolean;
  temAnamnese: boolean;
  /** `patient_protocol` com `desativado_em IS NULL`. */
  temProtocoloAtivo: boolean;
  /** `goal.estado = 'ativa'`. Rascunho NÃO conta: `materializar.ts` resolve
   * evidência contra metas, e uma meta em rascunho não é alvo de nada. */
  temMetaAtiva: boolean;
  temInstrumentoAplicado: boolean;
  temSessaoConsolidada: boolean;
}

export type EstadoDegrau = "concluido" | "pendente" | "bloqueante";

export type PapelResolvedor = "coordenador" | "terapeuta" | "admin_recepcao";

export interface Degrau {
  id: DegrauId;
  rotulo: string;
  descricao: string;
  estado: EstadoDegrau;
  /** `null` quando o papel atual não pode agir — o cartão não renderiza botão
   * morto para um passo que a `requireRole` do destino recusaria. */
  rota: string | null;
  papelQueResolve: PapelResolvedor;
}

export interface Prontidao {
  degraus: Degrau[];
  /** Primeiro degrau não concluído, na ordem da escada. `null` = prontuário
   * pronto; o cartão some (nada a fazer não ocupa pixel). */
  proximo: Degrau | null;
  podeDocumentar: boolean;
  /** Rótulo legível de quem resolve o `proximo`, quando não é o papel atual. */
  quemResolve: string | null;
}

const ROTULO_PAPEL: Record<PapelResolvedor, string> = {
  coordenador: "Coordenação",
  terapeuta: "Terapeuta",
  admin_recepcao: "Recepção",
};

interface DefinicaoDegrau {
  rotulo: string;
  descricao: string;
  papelQueResolve: PapelResolvedor;
  /** `null` = o degrau não tem destino próprio (já concluído por construção). */
  rota: (patientId: string) => string | null;
  concluido: (f: FatosProntidao) => boolean;
}

const DEFINICOES: Record<DegrauId, DefinicaoDegrau> = {
  admissao: {
    rotulo: "Admissão",
    descricao: "Cadastro, consentimento e modalidade clínica.",
    papelQueResolve: "admin_recepcao",
    rota: () => null,
    // O paciente existe — senão esta função nem teria sido chamada.
    concluido: () => true,
  },
  modalidade: {
    rotulo: "Definir a modalidade clínica",
    descricao:
      "Sem modalidade não há instrumento: o prontuário não sabe o que registrar.",
    papelQueResolve: "coordenador",
    rota: (id) => `/pacientes/${id}/cadastro-clinico`,
    // Alcançado só quando a modalidade é nula; nesse caso nunca está pronto.
    concluido: () => false,
  },
  ficha_clinica: {
    rotulo: "Preencher a ficha clínica",
    descricao: "Diagnóstico, medicações, alergias e contatos de emergência.",
    papelQueResolve: "coordenador",
    rota: (id) => `/pacientes/${id}/cadastro-clinico`,
    concluido: (f) => f.temFichaClinica,
  },
  anamnese: {
    rotulo: "Registrar a anamnese",
    descricao: "Marco zero do repertório. Recomendado, não obrigatório.",
    papelQueResolve: "coordenador",
    rota: (id) => `/pacientes/${id}/anamnese`,
    concluido: (f) => f.temAnamnese,
  },
  protocolo: {
    rotulo: "Prescrever um protocolo",
    descricao:
      "Sem protocolo vigente não há marcos para a sessão pontuar — o gráfico nasce vazio.",
    papelQueResolve: "coordenador",
    rota: (id) => `/pacientes/${id}/cadastro-clinico`,
    concluido: (f) => f.temProtocoloAtivo,
  },
  meta: {
    rotulo: "Ativar ao menos uma meta",
    descricao:
      "Evidência sem meta resolvida é descartada na materialização: a sessão seria documentada e nada apareceria na evolução.",
    papelQueResolve: "coordenador",
    rota: (id) => `/pacientes/${id}/metas`,
    concluido: (f) => f.temMetaAtiva,
  },
  instrumento: {
    rotulo: "Aplicar o instrumento inicial",
    descricao:
      "PHQ-9 ou GAD-7 como marco zero. Sem ele o gráfico de evolução nasce com um ponto só.",
    papelQueResolve: "terapeuta",
    rota: (id) => `/pacientes/${id}/tcc`,
    concluido: (f) => f.temInstrumentoAplicado,
  },
  primeira_sessao: {
    rotulo: "Documentar a primeira sessão",
    descricao: "A partir daqui a evolução passa a existir.",
    papelQueResolve: "terapeuta",
    rota: () => "/sessoes",
    concluido: (f) => f.temSessaoConsolidada,
  },
};

export interface MontarProntidaoInput {
  modalidade: ModalidadeClinica | null | undefined;
  fatos: FatosProntidao;
  role: string;
  patientId: string;
}

/** Papéis cuja RLS enxerga o prontuário clínico (`goal_select`,
 * `0006_fase2_rls.sql:207`: `coordenador` OR `app_is_on_team`). */
const PAPEIS_COM_LEITURA_CLINICA = new Set(["coordenador", "terapeuta"]);

export function montarProntidao({
  modalidade,
  fatos,
  role,
  patientId,
}: MontarProntidaoInput): Prontidao {
  // A recepção não recebe escada. Sob a RLS dela todo `EXISTS` clínico devolve
  // `false` para linhas que EXISTEM: a escada afirmaria "falta meta" sobre um
  // prontuário completo, e afirmaria isso ao papel que a política proíbe de
  // ler dado clínico. Fingir bloqueado é tão errado quanto fingir pronto — só
  // erra para o lado seguro.
  if (!PAPEIS_COM_LEITURA_CLINICA.has(role)) {
    return {
      degraus: [],
      proximo: null,
      podeDocumentar: false,
      quemResolve: ROTULO_PAPEL.coordenador,
    };
  }

  const capacidades = capacidadesDaModalidade(modalidade);
  const bloqueantes = new Set(capacidades.degrausBloqueantes);

  const degraus: Degrau[] = capacidades.degrausProntidao.map((id) => {
    const def = DEFINICOES[id];
    const concluido = def.concluido(fatos);
    return {
      id,
      rotulo: def.rotulo,
      descricao: def.descricao,
      estado: concluido
        ? "concluido"
        : bloqueantes.has(id)
          ? "bloqueante"
          : "pendente",
      // Rota só para quem pode agir. Botão que leva a um `notFound()` de
      // `requireRole` é pior que a ausência do botão: gasta o clique e não
      // explica nada.
      rota: role === def.papelQueResolve ? def.rota(patientId) : null,
      papelQueResolve: def.papelQueResolve,
    };
  });

  const proximo = degraus.find((d) => d.estado !== "concluido") ?? null;
  const podeDocumentar = !degraus.some((d) => d.estado === "bloqueante");
  const quemResolve =
    proximo && proximo.rota === null
      ? ROTULO_PAPEL[proximo.papelQueResolve]
      : null;

  return { degraus, proximo, podeDocumentar, quemResolve };
}
