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
};

export type GrupoDisciplina = {
  disciplina: string;
  ativos: ProtocoloVinculado[];
  disponiveis: ProtocoloCatalogo[];
};

export type AgrupamentoProtocolos = {
  /** Um grupo por disciplina prescrita vigente, na ordem em que foi recebida. */
  grupos: GrupoDisciplina[];
  /** Vínculos ativos cuja disciplina não está prescrita hoje. */
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
  const prescritas = new Set(disciplinasPrescritas.map(chave));

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

  const grupos: GrupoDisciplina[] = disciplinasPrescritas.map((disciplina) => {
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

  const foraDaPrescricao: ProtocoloVinculado[] = catalogo
    .filter(
      (p) =>
        ativosPorProtocolo.has(p.id) && !prescritas.has(chave(p.disciplina)),
    )
    .map((p) => ({ protocolo: p, vinculoId: ativosPorProtocolo.get(p.id)! }));

  return { grupos, foraDaPrescricao };
}
