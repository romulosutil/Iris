/**
 * Projeção de `historico_relevante` (contrato do agente) — módulo PURO,
 * sem DB, testável exaustivamente. O loader que consulta o Postgres é
 * `context-loader.ts`.
 *
 * #464. `historico_relevante` é a base do R14 (INCONSISTÊNCIA COM HISTÓRICO,
 * `prompt.ts:200`) — o anti-rubber-stamping. Até esta issue o loader mandava
 * `[]` fixo em TODOS os modos, com um comentário dizendo que a fonte era
 * "futura, Fase 4". A Fase 4 JÁ ENTROU: `evidence` + view `evidence_current`
 * (0014), `session_snapshot.repertorio_state` (0015/0017, mais marco-zero da
 * anamnese na 0115). O que faltava era a fiação.
 *
 * A forma do item DIVERGE POR MODO — é o que a #464 registra e o que o tipo
 * antigo (`{dominio_id, protocol_id, resumo}`, ambos obrigatórios) não
 * conseguia expressar:
 *
 *  - `protocol_driven` → `{dominio_id, protocol_id, resumo}`, projetado de
 *    `session_snapshot.repertorio_state` (spec da Fase 4 §8.3: a fonte é o
 *    repertório/baseline as-of, **nunca** `segmentacao` — sinais diferentes).
 *  - `tcc` → `{protocol_id, resumo}` (sem domínio), projetado de
 *    `instrumento_aplicacao` (PHQ-9/GAD-7).
 *  - `terapia_convencional` → `{tema, resumo}`. SEM FONTE HOJE: `temas[]` sai
 *    do agente (`agent-output-schema.ts`) e é DESCARTADO — nada o persiste
 *    (a própria tela `/pacientes/[id]/temas` documenta a lacuna e lê a nota
 *    consolidada como paliativo). O modo continua com `[]` até a persistência
 *    de `temas[]` entrar (#645); a variante do tipo existe aqui para que ligar
 *    a fonte depois não seja outra mudança de contrato.
 *
 * Nada aqui é IA: as frases são montadas por regra determinística sobre dado
 * já materializado (mesmo espírito do G4 da Fase 4 — trajetória é código,
 * não modelo).
 */
import { FUSO_CLINICA } from "@/lib/agenda/fuso";
import type { RepertorioState } from "@/lib/evidence/snapshot-schema";
import {
  derivarFaixaDeCorte,
  type TipoInstrumento,
} from "@/lib/tcc/faixa-de-corte";

export type HistoricoEntrada =
  | {
      tipo: "protocolo";
      protocolFamilia: string;
      dominioId: string;
      resumo: string;
    }
  | { tipo: "instrumento"; protocolFamilia: string; resumo: string }
  | { tipo: "tema"; tema: string; resumo: string };

/** Variante da união, por discriminador — retorno estreito de cada projeção. */
export type HistoricoDe<T extends HistoricoEntrada["tipo"]> = Extract<
  HistoricoEntrada,
  { tipo: T }
>;

/**
 * Rótulo do nível de ajuda a partir do ordinal gravado no repertório.
 *
 * O ordinal é o índice em `protocol.taxonomia_ajuda` — 0 = o primeiro nível
 * (tipicamente "independente"), NÃO "sem nível". A distinção importa: dizer
 * "independente" para um paciente sem registro seria afirmar progresso que
 * ninguém observou. `null` (ausência) e `0` (independente) seguem caminhos
 * diferentes de propósito.
 *
 * Ordinal fora da faixa (ou taxonomia não carregada) reporta o número cru e
 * diz que está fora — nunca inventa rótulo.
 */
function rotularNivel(
  ordinal: number,
  taxonomia: string[] | undefined,
): string {
  const rotulo = taxonomia?.[ordinal];
  return rotulo === undefined
    ? `ordinal ${ordinal}, fora da taxonomia do protocolo`
    : rotulo;
}

/**
 * Projeta `historico_relevante` do modo `protocol_driven` a partir do
 * `repertorio_state` do snapshot mais recente do paciente.
 *
 * Escopado às METAS ATIVAS que já vão no contrato: são as únicas que o agente
 * pode tocar nesta sessão, e é o que mantém o histórico curto o bastante para
 * caber no prompt. Chaves do repertório que não casam com nenhuma meta ativa
 * (inclusive as `milestone:<id>`, que `materializar.ts` grava quando o alvo
 * resolveu marco mas não meta) simplesmente não geram item.
 *
 * `niveis_nao_classificados` NÃO entra no resumo de propósito: é sinal de
 * qualidade de dado para a tela do coordenador, não contexto que ajude o
 * agente a detectar contradição — e cada frase extra custa token em toda
 * chamada de extração.
 */
export function projetarHistoricoDeRepertorio(args: {
  repertorio: RepertorioState;
  metas: Array<{
    id: string;
    mapeamentos: Array<{ familia: string; dominioId: string }>;
  }>;
  taxonomiaPorFamilia: Map<string, string[]>;
}): HistoricoDe<"protocolo">[] {
  const itens: HistoricoDe<"protocolo">[] = [];
  for (const meta of args.metas) {
    const entrada = args.repertorio[meta.id];
    if (!entrada) continue;
    for (const map of meta.mapeamentos) {
      const nivel =
        entrada.nivel_ajuda_recente === null
          ? "sem nível de ajuda registrado"
          : `nível de ajuda mais recente: ${rotularNivel(
              entrada.nivel_ajuda_recente,
              args.taxonomiaPorFamilia.get(map.familia),
            )}`;
      const candidata = entrada.is_candidata
        ? " Meta já é candidata a avaliação formal."
        : "";
      itens.push({
        tipo: "protocolo",
        protocolFamilia: map.familia,
        dominioId: map.dominioId,
        resumo: `${nivel}; ${entrada.contagem} observações acumuladas.${candidata}`,
      });
    }
  }
  return itens;
}

function formatarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    timeZone: FUSO_CLINICA,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Data civil (`yyyy-mm-dd`) no fuso da clínica. `en-CA` já entrega ISO. */
function dataCivil(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: FUSO_CLINICA });
}

/**
 * Distância em dias de CALENDÁRIO no fuso da clínica — não o piso do intervalo
 * decorrido. Duas aplicações no mesmo dia civil distam 0 qualquer que seja a
 * hora; 12/08 14:00 → 07/09 12:00 é "26 dias", que é o que alguém conta no
 * calendário, e não 25 (o intervalo tem 25 d 22 h). A hora do registro nunca
 * pode mexer na contagem.
 *
 * Serve para o agente pesar periodicidade — PHQ-9/GAD-7 são `tipo_coleta:
 * "escala_padronizada_intervalar"`, e "há 4 semanas" é o que diz se a
 * aplicação de hoje é a programada ou uma fora de janela.
 */
function diasDesde(quando: Date, agora: Date): number {
  const ms =
    Date.parse(`${dataCivil(agora)}T00:00:00Z`) -
    Date.parse(`${dataCivil(quando)}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

/**
 * Projeta `historico_relevante` do modo `tcc`: a ÚLTIMA aplicação de cada
 * instrumento. Só a última — a série inteira é a aba Evolução do paciente, não
 * contexto de extração.
 *
 * A faixa de corte vem de `@/lib/tcc/faixa-de-corte`, a mesma régua da tela
 * (cortes públicos; nenhum texto licenciado de item entra aqui). Escore
 * `null` é reportado como ausente — nunca colapsado em zero, que seria a
 * faixa "mínimo" e uma afirmação clínica falsa.
 */
export function projetarHistoricoDeInstrumentos(args: {
  aplicacoes: Array<{
    tipoInstrumento: TipoInstrumento;
    escoreTotal: number | null;
    criadoEm: Date;
  }>;
  agora?: Date;
}): HistoricoDe<"instrumento">[] {
  const agora = args.agora ?? new Date();
  const ultimaPorTipo = new Map<TipoInstrumento, (typeof args.aplicacoes)[0]>();
  for (const a of args.aplicacoes) {
    const atual = ultimaPorTipo.get(a.tipoInstrumento);
    if (!atual || a.criadoEm.getTime() > atual.criadoEm.getTime()) {
      ultimaPorTipo.set(a.tipoInstrumento, a);
    }
  }
  // Ordem estável (`gad7` antes de `phq9`): a ordem de chegada das linhas do
  // banco não pode fazer o prompt mudar entre duas execuções iguais.
  return [...ultimaPorTipo.values()]
    .sort((a, b) => a.tipoInstrumento.localeCompare(b.tipoInstrumento))
    .map((a) => {
      const dias = diasDesde(a.criadoEm, agora);
      const quando =
        dias === 0 ? "hoje" : dias === 1 ? "há 1 dia" : `há ${dias} dias`;
      const faixa = derivarFaixaDeCorte(a.tipoInstrumento, a.escoreTotal);
      const escore =
        a.escoreTotal === null
          ? "escore não registrado"
          : `escore ${a.escoreTotal}${faixa ? ` (${faixa})` : ""}`;
      return {
        tipo: "instrumento" as const,
        protocolFamilia: a.tipoInstrumento,
        resumo: `última aplicação em ${formatarData(a.criadoEm)} (${quando}); ${escore}.`,
      };
    });
}
