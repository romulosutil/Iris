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
 * Uso:  pnpm backfill:evidence
 */
import postgres from "postgres";
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

async function main() {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL não definida");
  // Conexão owner (bypassa RLS) — backfill é operação administrativa
  // cross-clinic, mesmo padrão de acesso usado pelas migrations/seed do owner.
  const sql = postgres(url, { max: 1 });

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

    const conteudo = (ext.payload_editado ?? ext.payload) as {
      evidencia?: Evidencia | null;
    };
    const evidencia = conteudo?.evidencia;
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

  console.log(
    [
      `Backfill de evidence concluído.`,
      `  Extrações elegíveis: ${extracoes.length}`,
      `  Evidências inseridas: ${inseridas}`,
      `  Extrações puladas (sem alvo/sem número/sem revisor): ${puladas}`,
      extractionIdsTocados.length > 0
        ? `  extraction_ids tocados (guardar p/ rollback): ${[...new Set(extractionIdsTocados)].join(", ")}`
        : "  Nenhuma linha nova inserida (idempotente).",
    ].join("\n"),
  );

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
