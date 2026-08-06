/**
 * Agrupamento de protocolos por disciplina prescrita (#203, fatia 3).
 *
 * Protocolo estruturado (VB-MAPP, Denver, PROC…) é **sub-encaixe opcional da
 * prescrição**, não um pilar paralelo: quem faz Psicologia generalista ou
 * Terapia Convencional prescreve horas do mesmo jeito e não vincula protocolo
 * nenhum. Daí as três consequências que esta função existe para garantir:
 *
 *   Sem disciplina prescrita não há o que encaixar. O catálogo inteiro da
 *   clínica deixa de ser oferecido — oferecer VB-MAPP a um paciente sem ABA
 *   prescrita convida a montar acompanhamento estruturado numa disciplina que
 *   ninguém prescreveu e que a equipe não pode atender.
 *
 *   Vínculo fora da prescrição NÃO some. Encerrar a prescrição de uma
 *   disciplina deixa órfão o protocolo já vinculado; escondê-lo produziria uma
 *   linha viva no banco que ninguém enxerga nem consegue desvincular pela UI —
 *   o mesmo tratamento que o plano §3.1 deu ao membro de equipe fora da
 *   prescrição.
 *
 *   Módulo puro, sem `server-only`. A tela é client component e precisa do
 *   mesmo agrupamento que o teste exercita — se a regra morasse no componente,
 *   só um teste de DOM a alcançaria.
 */

export type ProtocoloCatalogo = {
  id: string;
  nome: string;
  disciplina: string;
};

export type VinculoProtocolo = {
  id: string;
  protocolId: string;
  desativadoEm: string | null;
};

export type ProtocoloVinculado = {
  protocolo: ProtocoloCatalogo;
  vinculoId: string;
  /**
   * Vínculo vigente cujo `protocolId` não existe no catálogo recebido — o nome
   * e a disciplina são um marcador, não dado real. Ver `foraDaPrescricao`.
   */
  foraDoCatalogo?: boolean;
};

export type GrupoDisciplina = {
  disciplina: string;
  ativos: ProtocoloVinculado[];
  disponiveis: ProtocoloCatalogo[];
};

export type AgrupamentoProtocolos = {
  /** Um grupo por disciplina prescrita vigente, na ordem em que foi recebida. */
  grupos: GrupoDisciplina[];
  /**
   * Vínculos ativos que não couberam em nenhum grupo: disciplina não prescrita
   * hoje, **ou** protocolo ausente do catálogo recebido.
   *
   * Derivado dos VÍNCULOS, não do catálogo, de propósito. Varrer o catálogo
   * deixaria de fora justamente o vínculo cujo protocolo não está lá — e o
   * catálogo é deduplicado por `nome` (`obterOuInicializarProtocolosDaClinica`),
   * então duas linhas `protocol` de mesmo nome fazem um id sumir. Esse vínculo
   * ficaria vivo no banco sem aparecer em lugar nenhum nem ter como ser
   * desencaixado pela UI, que é exatamente o estado que este bloco existe para
   * impedir.
   */
  foraDaPrescricao: ProtocoloVinculado[];
};

/**
 * Chave de comparação de disciplina.
 *
 * `protocol.disciplina` e `patient_alvo_disciplina.disciplina` são texto livre
 * em tabelas diferentes, alimentadas por caminhos diferentes (catálogo semente
 * e formulário de prescrição). Comparar byte a byte faria `"Fonoaudiologia "`
 * e `"fonoaudiologia"` virarem disciplinas distintas, e o protocolo cairia em
 * "fora da prescrição" sem nada na tela explicando por quê.
 */
function chave(disciplina: string): string {
  return disciplina.trim().toLowerCase();
}

export function agruparProtocolosPorPrescricao(
  disciplinasPrescritas: string[],
  catalogo: ProtocoloCatalogo[],
  vinculos: VinculoProtocolo[],
): AgrupamentoProtocolos {
  // Deduplicação por chave normalizada, não pelo texto cru: o índice único
  // `patient_alvo_unico_vigente` (0077) é sobre a coluna crua, então "ABA" e
  // " aba " podem ser duas prescrições vigentes do mesmo paciente. Sem isto,
  // sairiam dois grupos idênticos — chave React repetida, e dois cartões
  // comandando o MESMO vínculo.
  const prescritas = new Set<string>();
  const disciplinasUnicas: string[] = [];
  for (const d of disciplinasPrescritas) {
    if (prescritas.has(chave(d))) continue;
    prescritas.add(chave(d));
    disciplinasUnicas.push(d);
  }

  // Só vínculo vigente entra na conta — desativado é histórico, e é histórico
  // de propósito (desativar nunca deleta). Um `desativadoEm` esquecido aqui
  // ressuscitaria protocolo encerrado como se estivesse ativo.
  const ativosPorProtocolo = new Map<string, string>();
  for (const v of vinculos) {
    if (v.desativadoEm) continue;
    // Legado pode ter dois vínculos ativos do mesmo protocolo (não havia guard
    // antes desta fatia): o primeiro manda, para não duplicar o cartão.
    if (!ativosPorProtocolo.has(v.protocolId)) {
      ativosPorProtocolo.set(v.protocolId, v.id);
    }
  }

  const grupos: GrupoDisciplina[] = disciplinasUnicas.map((disciplina) => {
    const daDisciplina = catalogo.filter(
      (p) => chave(p.disciplina) === chave(disciplina),
    );
    return {
      disciplina,
      ativos: daDisciplina
        .filter((p) => ativosPorProtocolo.has(p.id))
        .map((p) => ({
          protocolo: p,
          vinculoId: ativosPorProtocolo.get(p.id)!,
        })),
      disponiveis: daDisciplina.filter((p) => !ativosPorProtocolo.has(p.id)),
    };
  });

  const porId = new Map(catalogo.map((p) => [p.id, p]));
  const foraDaPrescricao: ProtocoloVinculado[] = [];
  for (const [protocolId, vinculoId] of ativosPorProtocolo) {
    const protocolo = porId.get(protocolId);
    if (!protocolo) {
      // Protocolo sumiu do catálogo (id descartado pela deduplicação por nome,
      // linha removida da tabela). O vínculo continua vigente no banco: ele
      // aparece aqui degradado para que exista a saída de desencaixar.
      foraDaPrescricao.push({
        protocolo: {
          id: protocolId,
          nome: "Protocolo fora do catálogo",
          disciplina: "",
        },
        vinculoId,
        foraDoCatalogo: true,
      });
      continue;
    }
    if (!prescritas.has(chave(protocolo.disciplina))) {
      foraDaPrescricao.push({ protocolo, vinculoId });
    }
  }

  return { grupos, foraDaPrescricao };
}
