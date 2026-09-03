/**
 * Backfill idempotente da tabela `evidence` (Fase 4 · 4A · decisão D2).
 *
 * Fonte: `extraction` com `estado IN ('aprovada', 'editada')` (exclui
 * `descartada`, `sugerida`, `pendente_reprocessamento` — não são decisão
 * humana confirmada). Para cada extração do subtipo `evidencia`, explode
 * `alvos[]` do conteúdo efetivo (`payload_editado ?? payload`) → 1 linha de
 * `evidence` por alvo, com `classificacao_original` = cópia congelada do alvo
 * aprovado (mesclado com os campos clínicos de `evidencia` — descrição,
 * resultado, nível de ajuda etc. — que vivem no objeto `evidencia`, não no
 * alvo isoladamente; ver nota de desvio no relatório da sessão).
 *
 * ⚠️ DESVIO CONHECIDO (revisão do tech lead, decisão do Rômulo): o contrato
 * atual do agente (`docs/agente/output-schema.json` / `agent-output-schema.ts`)
 * NÃO grava `milestone_id` no alvo — só `goal_id`, `protocol_id` e `dominio_id`,
 * e os dois últimos são STRINGS livres do agente (ex.: "vbmapp"), não UUIDs de
 * `protocol`/`goal`. Preservamos os refs CRUS como o agente os emitiu
 * (`protocol_slug` = protocol_id bruto, `dominio_id`, `goal_ref` = goal_id
 * bruto) para a futura camada de resolução slug→UUID. Os UUIDs resolvidos usam
 * o resolvedor compartilhado `resolverAlvoParaFks`
 * (`src/lib/evidence/resolver.ts` — mesmo usado na aprovação on-approve);
 * ids que não resolvem viram `null` (nunca adivinha).
 *
 * A CHAVE DE IDEMPOTÊNCIA é `(extraction_id, alvo_ordinal)` — a POSIÇÃO do alvo
 * em `alvos[]` (base 0), NÃO os FKs resolvidos. Sem isso, com slugs não
 * resolvidos, todos os alvos da mesma extração colapsariam em `(id, null, null)`
 * e `NULLS NOT DISTINCT` derrubaria todos menos um.
 *
 * Pré-condições / skips (spec 4A.3):
 *   - `session.numero_sequencial_paciente IS NULL` → pula (evidence.session_numero
 *     é NOT NULL; número só existe após consolidação da sessão).
 *   - `estado = 'editada'` com `payload_editado IS NULL` → rejeita com erro
 *     (inconsistência de dado).
 *
 * Idempotência: `ON CONFLICT ON CONSTRAINT uq_evidence_alvo DO NOTHING` — re-rodar
 * não duplica. Rollback: como é só INSERT, reverter = `DELETE FROM evidence
 * WHERE extraction_id = ANY($1)` para o lote de `extraction_id`s tocados (o
 * script imprime a lista ao final — guardar para o runbook se for reverter).
 *
 * ⚠️ Roda primeiro em local/seed e na clínica demo. Execução em prod é passo
 * manual "confirmar antes" (ver CLAUDE.md) — nunca automatizar contra dado real
 * sem aval explícito.
 *
 * ─── MEDIÇÃO ANTES/DEPOIS (#553, item 3 — EXECUTADA em produção 03/09/2026,
 * psql como owner, só SELECT). Resultado: **3 linhas**, todas da clínica
 * DesignerS e todas com `jsonb_array_length(alvos) = 0`, sessão numerada e
 * revisor presente. São os SKIPS LEGÍTIMOS já previstos abaixo (alvo vazio),
 * não resíduo da deriva de forma — o backfill não teria o que recuperar e por
 * isso NÃO foi executado em produção. Reexecutar a query antes de qualquer
 * backfill futuro: o número acima é de 03/09/2026, não é permanente.
 *
 * Conta as extrações que decisão humana já aprovou e que
 * mesmo assim não têm nenhuma linha em `evidence` — o buraco que a deriva de
 * forma do payload abriu em silêncio. Roda como owner (bypassa RLS), por isso
 * agrega por clínica:
 *
 *   SELECT e.clinic_id,
 *          c.nome                                  AS clinica,
 *          count(*)                                AS aprovadas_sem_evidence,
 *          min(e.criado_em)                        AS primeira,
 *          max(e.criado_em)                        AS ultima
 *     FROM extraction e
 *     JOIN clinic c ON c.id = e.clinic_id
 *    WHERE e.estado = 'aprovada'
 *      AND e.subtipo = 'evidencia'
 *      AND NOT EXISTS (
 *            SELECT 1 FROM evidence ev WHERE ev.extraction_id = e.id
 *          )
 *    GROUP BY e.clinic_id, c.nome
 *    ORDER BY aprovadas_sem_evidence DESC;
 *
 * Rodar a MESMA query depois do backfill: a diferença é o efeito medido, e é
 * ela que vai para o `BACKLOG.md`. O que sobrar são os skips legítimos
 * (sessão sem número, sem revisor, `alvos` vazio) — não resíduo da deriva.
 *
 * Uso:  pnpm backfill:evidence
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { assertScriptRemotoPermitido } from "./lib/guardrail-conexao.mjs";
import { conteudoDoSubtipo } from "@/lib/extraction/conteudo-subtipo";
import {
  type Alvo,
  postgresResolverQueries,
  resolverAlvoParaFks,
} from "@/lib/evidence/resolver";

type ExtractionRow = {
  id: string;
  session_id: string;
  clinic_id: string;
  estado: "aprovada" | "editada";
  subtipo: string;
  payload: unknown;
  payload_editado: unknown;
  revisado_por: string | null;
};

type SessionRow = {
  id: string;
  patient_id: string;
  numero_sequencial_paciente: number | null;
};

type Evidencia = {
  alvos?: Alvo[];
  [key: string]: unknown;
};

export type BackfillResumo = {
  elegiveis: number;
  inseridas: number;
  puladas: number;
  extractionIdsTocados: string[];
};

/**
 * Núcleo do backfill, isolado da leitura de env / abertura de conexão para
 * poder ser exercitado em teste com um `sql` dublê (ver
 * `scripts/backfill-evidence.test.ts`). O guard de ambiente (#534) fica em
 * `main()`, junto do único ponto que de fato abre conexão.
 */
export async function executarBackfill(
  sql: postgres.Sql,
): Promise<BackfillResumo> {
  const extracoes = await sql<ExtractionRow[]>`
    SELECT id, session_id, clinic_id, estado, subtipo, payload, payload_editado, revisado_por
    FROM extraction
    WHERE estado IN ('aprovada', 'editada')
    ORDER BY criado_em ASC
  `;

  let inseridas = 0;
  let puladas = 0;
  const extractionIdsTocados: string[] = [];

  for (const ext of extracoes) {
    if (ext.estado === "editada" && ext.payload_editado == null) {
      throw new Error(
        `Inconsistência: extraction ${ext.id} está 'editada' mas payload_editado é NULL.`,
      );
    }

    if (ext.subtipo !== "evidencia") {
      // Só evidencia carrega alvos[] mapeáveis (R8) — demais subtipos (registro_abc,
      // cadeia, ausencia_comportamento, preferencia_reforcador) não geram evidence.
      continue;
    }

    // FONTE ÚNICA com o leitor on-approve (`inserirEvidenciasOnApprove`):
    // o payload real de produção é FLAT (`{alvos}`) desde a D57, os seeds e o
    // dado anterior são ANINHADOS (`{evidencia:{alvos}}`). Ler à mão só uma
    // das formas — como este script fazia — é a deriva da #553: o backfill
    // não encontrava nenhuma das aprovações reais.
    const evidencia = conteudoDoSubtipo(
      ext.payload_editado ?? ext.payload,
      "evidencia",
    ) as Evidencia | null;
    const alvos = Array.isArray(evidencia?.alvos) ? evidencia!.alvos! : [];
    if (alvos.length === 0) {
      puladas++;
      continue;
    }

    const [sessao] = await sql<SessionRow[]>`
      SELECT id, patient_id, numero_sequencial_paciente
      FROM session WHERE id = ${ext.session_id}
    `;
    if (!sessao) {
      puladas++;
      continue;
    }
    if (sessao.numero_sequencial_paciente == null) {
      // Sessão ainda não consolidada (sem número) — pula, spec 4A.3.
      puladas++;
      continue;
    }
    if (!ext.revisado_por) {
      // aprovado_por é NOT NULL — sem revisor gravado não há como preencher
      // com segurança; pula em vez de inventar autoria.
      puladas++;
      continue;
    }

    const resolverQueries = postgresResolverQueries(sql);

    for (let ordinal = 0; ordinal < alvos.length; ordinal++) {
      const alvo = alvos[ordinal]!;
      const {
        protocolId,
        goalId,
        milestoneId,
        protocolSlug,
        dominioId,
        goalRef,
      } = await resolverAlvoParaFks(
        resolverQueries,
        { clinicId: ext.clinic_id, patientId: sessao.patient_id },
        alvo,
      );
      // classificacao_original: cópia congelada do alvo aprovado, mesclada com
      // o conteúdo clínico de `evidencia` (sem o array `alvos` completo, que
      // não é escopo desta linha) — ver nota de desvio no topo do arquivo.
      const { alvos: _omit, ...evidenciaSemAlvos } = evidencia ?? {};
      const classificacaoOriginal = { ...evidenciaSemAlvos, alvo };

      const resultado = await sql`
        INSERT INTO evidence (
          extraction_id, patient_id, session_id, session_numero, alvo_ordinal,
          protocol_slug, dominio_id, goal_ref,
          protocol_id, goal_id, milestone_id,
          classificacao_original, aprovado_por
        ) VALUES (
          ${ext.id}, ${sessao.patient_id}, ${sessao.id}, ${sessao.numero_sequencial_paciente}, ${ordinal},
          ${protocolSlug}, ${dominioId}, ${goalRef},
          ${protocolId}, ${goalId}, ${milestoneId},
          ${sql.json(classificacaoOriginal)}, ${ext.revisado_por}
        )
        ON CONFLICT ON CONSTRAINT uq_evidence_alvo DO NOTHING
        RETURNING id
      `;
      if (resultado.length > 0) {
        inseridas++;
        extractionIdsTocados.push(ext.id);
      }
    }
  }

  return {
    elegiveis: extracoes.length,
    inseridas,
    puladas,
    extractionIdsTocados,
  };
}

async function main() {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL não definida");
  // Conexão owner (bypassa RLS) — backfill é operação administrativa
  // cross-clinic, mesmo padrão de acesso usado pelas migrations/seed do owner.
  // Por isso mesmo, fail-closed fora de localhost: banco remoto só com
  // ALLOW_SEED_REMOTE=true explícito (#534).
  assertScriptRemotoPermitido(url, { rotulo: "backfill-evidence" });
  const sql = postgres(url, { max: 1 });

  const { elegiveis, inseridas, puladas, extractionIdsTocados } =
    await executarBackfill(sql);

  console.log(
    [
      `Backfill de evidence concluído.`,
      `  Extrações elegíveis: ${elegiveis}`,
      `  Evidências inseridas: ${inseridas}`,
      `  Extrações puladas (sem alvo/sem número/sem revisor): ${puladas}`,
      extractionIdsTocados.length > 0
        ? `  extraction_ids tocados (guardar p/ rollback): ${[...new Set(extractionIdsTocados)].join(", ")}`
        : "  Nenhuma linha nova inserida (idempotente).",
    ].join("\n"),
  );

  await sql.end();
}

// Só executa quando invocado como script (`pnpm backfill:evidence`); importar
// o módulo em teste não pode disparar o backfill nem abrir conexão.
// Compara o alvo da invocação com o caminho DESTE módulo (e não com um nome de
// arquivo literal): sobrevive a renomear/mover o script sem falhar em silêncio.
function normalizarCaminho(caminho: string) {
  const posix = resolve(caminho).split("\\").join("/");
  // Windows varia a caixa do drive entre `process.argv[1]` e `import.meta.url`.
  return process.platform === "win32" ? posix.toLowerCase() : posix;
}

const alvoDaInvocacao = process.argv[1]
  ? normalizarCaminho(process.argv[1])
  : "";
const esteModulo = normalizarCaminho(fileURLToPath(import.meta.url));
if (alvoDaInvocacao === esteModulo) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
