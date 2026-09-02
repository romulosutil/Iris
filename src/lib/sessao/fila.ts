import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import {
  deriveEstadoSessao,
  type GestoPrimario,
  type MotivoAtencao,
} from "./estado";

// Fila única de sessões travadas (#512 · T02 · R-09, R-12, R-13, R-19).
//
// Este módulo é a ÚNICA fonte do predicado: `contarTravadas` e `listarTravadas`
// chamam a mesma `coletarTravadas`, com o mesmo SQL e a mesma derivação em JS.
// Não existe aqui um `SELECT count(*)` paralelo com WHERE reescrito à mão —
// é exatamente o defeito da #511 (dois SQL parecidos que divergiram), e o
// int-test `db/tests/sessao-fila.int.test.ts` afirma a igualdade dos dois.
//
// A decisão de "travada" NÃO é reimplementada em SQL: quem decide é
// `deriveEstadoSessao` (T01, `./estado.ts`), a máquina de estados canônica.
// O SQL só reúne as linhas de leitura que alimentam `EntradaSessao`.

type EstadoExtracao =
  | "sugerida"
  | "pendente_reprocessamento"
  | "aprovada"
  | "editada"
  | "descartada"
  | "erro_validacao";

type SessionEstadoDb =
  "agendada" | "realizada" | "falta_paciente" | "falta_terapeuta" | "cancelada";

type Row = {
  session_id: string;
  patient_id: string;
  patient_nome: string | null;
  terapeuta_id: string;
  atendido_por_id: string | null;
  terapeuta_nome: string | null;
  agendada_para: string | Date;
  estado: SessionEstadoDb;
  tem_nota_consolidada: boolean;
  extracao_estados: EstadoExtracao[] | null;
  itens_fila: number;
};

export type SessaoTravada = {
  sessionId: string;
  patientId: string;
  /**
   * `null` quando a RLS de `patient` esconde a linha — o profissional
   * responsável que NÃO está na equipe de cuidado (cobertura, substituto do
   * #539). A sessão continua na fila: o escopo é `session`, não `patient`; a
   * UI mostra "Paciente (acesso restrito)", como a agenda e as pendências.
   */
  patientNome: string | null;
  terapeutaId: string;
  terapeutaNome: string | null;
  agendadaPara: Date;
  /** Motivo tipado de `precisa_atencao` (R-03). Nunca booleano. */
  motivo: MotivoAtencao;
  /** Gesto primário do estado — vem da mesma função, nenhuma tela redefine. */
  gesto: GestoPrimario;
  itensNaFilaValidacao: number;
  /**
   * Sou o profissional responsável: `terapeuta_id` OU `atendido_por_id`
   * (substituto designado na agenda — #539, D-AUD-7). Mesma régua da RLS
   * (`app_session_profissional_responsavel`, 0142) e do `ehDono` das telas.
   * Base do escopo dito por extenso (R-14).
   */
  minha: boolean;
};

export type OpcoesFila = {
  /**
   * Hora de referência da janela de 24h (`sem_nota_apos_24h`). Existe por
   * causa do R-04: `deriveEstadoSessao` não instancia a hora atual, e o
   * int-test precisa de uma âncora fixa. Em produção fica o default.
   */
  agora?: Date;
  limite?: number;
  offset?: number;
};

/**
 * Predicado da fila de validação — TEXTO ESPELHADO de
 * `src/app/(app)/validacao/queries.ts:17-19` (spec A5). Alias `xf` para não
 * colidir com a `extraction` da sessão na query externa.
 *
 * O casamento com a sessão é por `(patient_id, session_numero)`, e não por
 * `evidence.session_id`, de propósito: é o único par com índice
 * (`idx_evidence_patient_session`), e `security_barrier` só deixa descer qual
 * leakproof — comparação de uuid/int desce, `LIMIT` não (memória
 * `security-barrier-view-bloqueia-limit`). Sessão com
 * `numero_sequencial_paciente` NULL não casa com nada, o que é o resultado
 * correto: sem número não existe `evidence` daquela sessão.
 */
function filaValidacaoDaSessao(selecao: SQL): SQL {
  return sql`(
    SELECT ${selecao}
    FROM evidence_current ec
    JOIN extraction xf ON xf.id = ec.extraction_id
    WHERE ec.patient_id = s.patient_id
      AND ec.session_numero = s.numero_sequencial_paciente
      AND ec.invalidada = false
      AND (xf.confianca = 'baixa' OR xf.inconsistente_com_historico = true)
      AND NOT EXISTS (SELECT 1 FROM evidence_revision r WHERE r.evidence_id = ec.id)
      AND NOT EXISTS (
        SELECT 1 FROM evidence_query q
        WHERE q.evidence_id = ec.id AND q.respondido_em IS NULL
      )
  )`;
}

/**
 * Escopo da fila por papel (R-09).
 *
 * Coordenador, **hoje** (1 coordenador por clínica): `sessões da clínica cujo
 * terapeuta ≠ eu` ∪ `minhas sessões travadas`. As duas pernas estão escritas
 * literalmente — e sim, hoje a união cobre a clínica inteira, porque o `RLS`
 * de `withTenant` já escopa ao tenant. Elas NÃO são colapsadas em `TRUE` de
 * propósito: é aqui que a D76 (#520, múltiplos coordenadores por clínica) vai
 * estreitar a perna A para `pacientes onde EU sou coordenador_referencia
 * vigente em care_team_membership`. Deixar a costura à vista é mais barato que
 * redescobrir o lugar depois.
 *
 * 🚫 R-08: nada aqui lê contagem de membros da clínica. Não existe — e não pode
 * nascer — helper de "é clínica solo?" nem contagem de coordenadores para
 * decidir escopo. O escopo sai de `session.terapeuta_id` /
 * `session.atendido_por_id`, uma sessão de cada vez. (Os nomes proibidos não
 * são escritos aqui de propósito: o gate da Definição de Pronto é um `grep`
 * literal que tem que devolver zero.)
 *
 * Terapeuta: só as próprias sessões — "7 sessões suas" (R-14). "Própria" é a
 * régua única do #539 (D-AUD-7): titular (`terapeuta_id`) OU substituto
 * designado na agenda (`atendido_por_id`) — a mesma que a RLS aplica na
 * escrita (`app_session_profissional_responsavel`, 0142). Sem a segunda perna
 * o substituto documentava (RLS deixa) mas nunca via a sessão travada.
 * `admin_recepcao`: não tem fila (R-23); é tratado antes, sem tocar o banco.
 */
function escopoDaFila(ctx: TenantContext): SQL {
  if (ctx.role === "coordenador") {
    return sql`(
      s.terapeuta_id <> ${ctx.userId}::uuid
      OR s.terapeuta_id = ${ctx.userId}::uuid
    )`;
  }
  return sql`(
    s.terapeuta_id = ${ctx.userId}::uuid
    OR s.atendido_por_id = ${ctx.userId}::uuid
  )`;
}

/**
 * Conjunto de CANDIDATAS a travada. **Invariante: tem que ser SUPERSET de
 * `motivoAtencao`** (`./estado.ts`) — pode trazer linha a mais (o JS descarta),
 * nunca a menos.
 *
 * Por que existe: `precisa_atencao` é decidido em JS (fonte única = T01), então
 * sem este corte a query montaria a `EntradaSessao` de toda sessão histórica da
 * clínica. Aqui o conjunto cai para os candidatos antes de qualquer trabalho
 * por linha.
 *
 * Por que `UNION` e não um `OR` de três `EXISTS` — medido, não presumido, com
 * `EXPLAIN (ANALYZE, BUFFERS)` sobre 5.000 sessões (01/09/2026, plano no PR).
 * **A escolha é de forma de plano, não de tempo:** as duas versões empatam
 * dentro do ruído (OR 8.700/6.621 ms · UNION 6.171/6.758 ms em duas medições),
 * e o `OR` até toca menos buffers (100.411 vs 129.961). O que decide é a forma:
 *   - com `OR`, o planner colapsa os `EXISTS` correlacionados em *hashed
 *     SubPlans* e varre `extraction` e `session_note` INTEIRAS (Seq Scan);
 *   - com `UNION`, cada perna vira semi/anti-join usando
 *     `idx_extraction_session` e `idx_session_note_session`.
 * A segunda forma degrada melhor quando essas tabelas crescem mais rápido que
 * `session` (há N extrações por sessão), e cada perna fica otimizável sozinha.
 * Se a medição futura contradisser isso, a troca é local — é um `UNION` de três
 * SELECTs, não uma regra espalhada.
 *
 * Quem alterar `motivoAtencao` sem alterar uma perna daqui perde linhas em
 * silêncio — por isso o int-test tem UM caso por motivo (`extracao_travada`,
 * `sem_nota_apos_24h`, `na_fila_validacao`): apagar uma perna derruba um teste
 * nomeado, não um total agregado.
 *
 * Terminais (`cancelada`, `falta_*`) saem no SQL porque `deriveEstadoSessao`
 * os resolve ANTES do ramo de exceção — sessão cancelada nunca é travada.
 */
function candidatas(ctx: TenantContext, agora: Date): SQL {
  // `Date` não é codificado pelo template `sql` do Drizzle (memória
  // `drizzle-sql-nao-codifica-date`): vai como texto ISO + cast explícito.
  const agoraIso = agora.toISOString();
  return sql`
    -- motivo extracao_travada
    SELECT s.id FROM session s
    WHERE ${escopoDaFila(ctx)}
      AND s.estado IN ('agendada', 'realizada')
      AND EXISTS (
        SELECT 1 FROM extraction xt
        WHERE xt.session_id = s.id
          AND xt.estado IN ('pendente_reprocessamento', 'erro_validacao')
      )
    UNION
    -- motivo sem_nota_apos_24h. O "<" (e não "<=") espelha o ">" estrito da
    -- janela em estado.ts; de todo modo o JS redecide.
    SELECT s.id FROM session s
    WHERE ${escopoDaFila(ctx)}
      AND s.estado = 'realizada'
      AND s.agendada_para < ${agoraIso}::timestamptz - interval '24 hours'
      AND NOT EXISTS (
        SELECT 1 FROM session_note sn
        WHERE sn.session_id = s.id AND sn.tipo = 'nota_consolidada'
      )
    UNION
    -- motivo na_fila_validacao
    SELECT s.id FROM session s
    WHERE ${escopoDaFila(ctx)}
      AND s.estado IN ('agendada', 'realizada')
      AND EXISTS ${filaValidacaoDaSessao(sql`1`)}
  `;
}

/**
 * Conjunto completo das sessões travadas do escopo, já ordenado.
 *
 * Ordenação (R-19): "tempo travado", que não é coluna — o estado é derivado.
 * A aproximação usada é `agendada_para ASC` (mais antiga primeiro): quanto mais
 * antiga a sessão, mais tempo ela está parada no funil. É a única proxy
 * disponível sem coluna nova (G2 proíbe migração) e é monotônica com o tempo
 * real de travamento em todos os três motivos.
 *
 * Não há `LIMIT` no SQL, e isso é deliberado: o filtro final é a máquina de
 * estados em JS. Cortar no banco exigiria reimplementar `deriveEstadoSessao`
 * em `CASE`, criando uma segunda fonte de verdade — exatamente o que R-12
 * proíbe. Quem limita o custo é o CTE `candidatas`: o conjunto trazido já é só
 * o de candidatas a travada. A paginação (`limite`/`offset`) é fatiamento deste
 * conjunto, e `total` continua sendo o tamanho do conjunto inteiro.
 *
 * R-19 · o que o plano medido mostrou (5.000 sessões, 01/09/2026):
 *   - `security_barrier` NÃO é o gargalo aqui, e o `LIMIT` bloqueado pela view
 *     não se aplica: nunca paginamos ATRAVÉS de `evidence_current`. A perna de
 *     `na_fila_validacao` roda em 0,015 ms — o par `(patient_id,
 *     session_numero)` desce pela view (comparação leakproof) e usa
 *     `idx_evidence_patient_session`.
 *   - O custo real é a RLS de `extraction`/`session_note`: funções
 *     `SECURITY DEFINER` avaliadas por linha (~0,5-0,7 ms cada), ~6,7 s no
 *     total para 5.000 sessões. É custo do SCHEMA, não desta query: o mesmo
 *     `AppLayout` já chama `listarPendencias`, cuja varredura de `extraction`
 *     sozinha custou 3,365 s na MESMA massa. Ou seja, a fila não introduz uma
 *     classe de custo nova — mas o número é alto o bastante para o T03 (dono da
 *     paginação da tela) tratar como assunto próprio, com cache ou janela.
 */
async function coletarTravadas(
  ctx: TenantContext,
  agora: Date,
): Promise<SessaoTravada[]> {
  // R-23: recepção não recebe `Sessões`. Um badge que ela nunca zera é
  // ansiedade permanente — e não há motivo de ir ao banco para responder 0.
  if (ctx.role === "admin_recepcao") return [];

  const rows = await withTenant(ctx, async (tx) => {
    return (await tx.execute(sql`
      WITH candidatas AS (${candidatas(ctx, agora)})
      SELECT
        s.id AS session_id,
        s.patient_id,
        p.nome AS patient_nome,
        s.terapeuta_id,
        s.atendido_por_id,
        u.name AS terapeuta_nome,
        s.agendada_para,
        s.estado::text AS estado,
        EXISTS (
          SELECT 1 FROM session_note sn
          WHERE sn.session_id = s.id AND sn.tipo = 'nota_consolidada'
        ) AS tem_nota_consolidada,
        COALESCE(
          (SELECT array_agg(xt.estado::text)
             FROM extraction xt WHERE xt.session_id = s.id),
          ARRAY[]::text[]
        ) AS extracao_estados,
        COALESCE(${filaValidacaoDaSessao(sql`count(*)::int`)}, 0) AS itens_fila
      FROM candidatas c
      JOIN session s ON s.id = c.id
      -- LEFT: a RLS de patient (equipe de cuidado) não decide o que é fila --
      -- a sessão do substituto/cobertura fora da equipe entra sem o nome (#539).
      LEFT JOIN patient p ON p.id = s.patient_id
      LEFT JOIN app_user u ON u.id = s.terapeuta_id
      ORDER BY s.agendada_para ASC
    `)) as unknown as Row[];
  });

  const travadas: SessaoTravada[] = [];
  for (const r of rows) {
    const agendadaPara =
      r.agendada_para instanceof Date
        ? r.agendada_para
        : new Date(r.agendada_para);

    const resultado = deriveEstadoSessao(
      {
        estado: r.estado,
        agendadaPara,
        temNotaConsolidada: r.tem_nota_consolidada,
        extracoes: (r.extracao_estados ?? []).map((estado) => ({ estado })),
        itensNaFilaValidacao: r.itens_fila,
      },
      agora,
    );

    // Único filtro que decide o que é fila. Se algum dia `precisa_atencao`
    // ganhar um motivo novo, é `preFiltroCandidatas` que precisa acompanhar —
    // nunca uma cópia da regra aqui.
    if (resultado.estado !== "precisa_atencao") continue;

    travadas.push({
      sessionId: r.session_id,
      patientId: r.patient_id,
      patientNome: r.patient_nome,
      terapeutaId: r.terapeuta_id,
      terapeutaNome: r.terapeuta_nome,
      agendadaPara,
      motivo: resultado.motivo,
      gesto: resultado.gesto,
      itensNaFilaValidacao: r.itens_fila,
      minha: r.terapeuta_id === ctx.userId || r.atendido_por_id === ctx.userId,
    });
  }

  return travadas;
}

/**
 * Contagem do badge (R-12/R-13). Reusa `coletarTravadas` — mesmo SQL, mesma
 * derivação, mesmo escopo da lista. Se alguém trocar isto por um
 * `SELECT count(*)` próprio, o teste de igualdade contagem×lista fica vermelho.
 */
export async function contarTravadas(
  ctx: TenantContext,
  opcoes: OpcoesFila = {},
): Promise<{ total: number }> {
  const travadas = await coletarTravadas(ctx, opcoes.agora ?? new Date());
  return { total: travadas.length };
}

/**
 * Lista da fila de `/sessoes`. `total` é o conjunto inteiro (o que o badge
 * conta); `itens` é a página pedida.
 */
export async function listarTravadas(
  ctx: TenantContext,
  opcoes: OpcoesFila = {},
): Promise<{ itens: SessaoTravada[]; total: number }> {
  const travadas = await coletarTravadas(ctx, opcoes.agora ?? new Date());
  const offset = opcoes.offset ?? 0;
  const itens =
    opcoes.limite === undefined
      ? travadas.slice(offset)
      : travadas.slice(offset, offset + opcoes.limite);
  return { itens, total: travadas.length };
}
