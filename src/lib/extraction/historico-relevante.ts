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

/** Janela de sessões da projeção de temas (#645, G-4). */
export const JANELA_SESSOES_TEMA = 5;
/** A partir de quantas sessões da janela um tema é dito recorrente (#645, G-4). */
export const MIN_SESSOES_RECORRENTE = 3;

/**
 * Projeta `historico_relevante` do modo `terapia_convencional` (#645) — a
 * terceira variante, `{tema, resumo}`, que estava declarada desde a #464 e sem
 * produtor.
 *
 * A régua é a que `docs/agente/protocolo-terapia-convencional.md` já pratica:
 * **presente nas últimas 5 sessões, recorrente quando aparece em 3 delas**.
 *
 * "Últimas 5 sessões" conta só as sessões QUE TÊM TEMA REGISTRADO, não as 5
 * últimas do calendário: um paciente convencional que teve três sessões sem
 * nenhum tema aprovado (revisão não concluída, nota curta) perderia todo o
 * histórico por uma janela vazia, e é justamente o histórico que o R14 usa.
 *
 * "Sinalizado" é presença — o tema aparece na sessão. Não há grau nem peso: o
 * contrato do agente é `temas: string[]` (`agent-output-schema.ts`), sem
 * intensidade, e inventar peso aqui seria afirmar dado que ninguém coletou.
 *
 * A grafia mostrada é a da sessão MAIS RECENTE do grupo (é a que o terapeuta
 * acabou de ler); o agrupamento é por `tema_chave` (`normalizarTema`).
 *
 * Nada aqui é IA: contagem e frase são regra determinística sobre linha já
 * materializada, mesmo espírito do G4 da Fase 4.
 */
export function projetarHistoricoDeTemas(args: {
  temas: Array<{
    /** `session.numero_sequencial_paciente` — define a janela. */
    sessionNumero: number;
    /** Texto cru do agente. */
    tema: string;
    /** `normalizarTema(tema)` — o agrupador. */
    temaChave: string;
    /** Data da sessão, para a frase "última em …". */
    quando: Date;
  }>;
  janelaSessoes?: number;
  minSessoesRecorrente?: number;
}): HistoricoDe<"tema">[] {
  const janela = args.janelaSessoes ?? JANELA_SESSOES_TEMA;
  const minRecorrente = args.minSessoesRecorrente ?? MIN_SESSOES_RECORRENTE;

  // Sessões COM TEMA, mais recente primeiro, cortadas na janela.
  const numerosNaJanela = new Set(
    [...new Set(args.temas.map((t) => t.sessionNumero))]
      .sort((a, b) => b - a)
      .slice(0, janela),
  );
  if (numerosNaJanela.size === 0) return [];

  type Grupo = {
    tema: string;
    sessoes: Set<number>;
    ultimoNumero: number;
    ultimaData: Date;
  };
  const grupos = new Map<string, Grupo>();
  for (const t of args.temas) {
    if (!numerosNaJanela.has(t.sessionNumero)) continue;
    const g = grupos.get(t.temaChave);
    if (!g) {
      grupos.set(t.temaChave, {
        tema: t.tema,
        sessoes: new Set([t.sessionNumero]),
        ultimoNumero: t.sessionNumero,
        ultimaData: t.quando,
      });
      continue;
    }
    g.sessoes.add(t.sessionNumero);
    if (t.sessionNumero > g.ultimoNumero) {
      g.ultimoNumero = t.sessionNumero;
      g.tema = t.tema;
      g.ultimaData = t.quando;
    }
  }

  const totalSessoes = numerosNaJanela.size;
  return (
    [...grupos.entries()]
      .map(([chave, g]) => {
        const n = g.sessoes.size;
        const recorrente = n >= minRecorrente ? " Recorrente." : "";
        return {
          chave,
          n,
          entrada: {
            tipo: "tema" as const,
            tema: g.tema,
            resumo:
              `presente em ${n} ${n === 1 ? "sessão" : "sessões"} das últimas ` +
              `${totalSessoes} com tema registrado; última em ` +
              `${formatarData(g.ultimaData)}.${recorrente}`,
          },
        };
      })
      // Recorrência desc, depois chave asc: ordem estável entre duas execuções
      // iguais — a ordem de chegada das linhas do banco não pode mexer no prompt.
      .sort((a, b) => b.n - a.n || a.chave.localeCompare(b.chave))
      .map((x) => x.entrada)
  );
}
