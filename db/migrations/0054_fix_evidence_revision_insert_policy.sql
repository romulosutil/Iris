-- #141 — Correção da policy evidence_revision_insert (predicado eq.evidence_id = evidence_id)
--
-- A migração 0014 introduziu e a 0053 replicou um erro de digitação na policy
-- `evidence_revision_insert`: o último EXISTS comparava `eq.evidence_id = eq.evidence_id`
-- (tautologia sempre verdadeira), em vez de comparar a coluna da tabela `evidence_query` (`eq.evidence_id`)
-- com a coluna `evidence_id` da linha de `evidence_revision` sendo inserida.
--
-- Esta migração faz DROP POLICY + CREATE POLICY com o predicado corrigido
-- (`eq.evidence_id = evidence_revision.evidence_id`), preservando intacto o gate de
-- prontuário em somente-leitura (`NOT app_prontuario_somente_leitura_por_evidencia`).

DROP POLICY "evidence_revision_insert" ON "evidence_revision";
--> statement-breakpoint
CREATE POLICY "evidence_revision_insert" ON "evidence_revision" FOR INSERT TO app_role
  WITH CHECK (
    (autor_id = (current_setting('app.user_id'::text))::uuid)
    AND (EXISTS (
      SELECT 1 FROM evidence e
      WHERE ((e.id = evidence_revision.evidence_id) AND app_patient_in_clinic(e.patient_id))
    ))
    AND (
      (current_setting('app.user_role'::text) = 'coordenador'::text)
      OR (
        (EXISTS (
          SELECT 1 FROM evidence e
          WHERE ((e.id = evidence_revision.evidence_id) AND app_is_on_team(e.patient_id))
        ))
        AND (EXISTS (
          SELECT 1 FROM evidence_query eq
          WHERE ((eq.evidence_id = evidence_revision.evidence_id) AND (eq.respondido_em IS NULL))
        ))
      )
    )
    AND (NOT app_prontuario_somente_leitura_por_evidencia(evidence_revision.evidence_id))
  );
