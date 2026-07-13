-- Fase 4 (4A) — RLS da Evidence layer. Espelha o estilo de 0001/0006/0012:
-- helpers SECURITY DEFINER + GRANT explícito por tabela + policies.
--
-- `evidence` é append-only por design (grão de alvo, 1 linha = 1 alvo
-- aprovado): imutabilidade aplicada em nível de PRIVILÉGIO, não só de
-- convenção — trava UPDATE/DELETE mesmo para o app_role.
REVOKE UPDATE, DELETE ON evidence FROM app_role;
--> statement-breakpoint
GRANT SELECT, INSERT ON evidence TO app_role;
--> statement-breakpoint
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE evidence FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Leitura clínica: coordenador vê toda a clínica; terapeuta só paciente da
-- própria equipe vigente (app_is_on_team, já usado por goal/milestone_candidacy).
CREATE POLICY evidence_select ON evidence FOR SELECT TO app_role USING (
  app_patient_in_clinic(patient_id)
  AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(patient_id))
);
--> statement-breakpoint
-- INSERT no momento da aprovação da extração: terapeuta dono da sessão OU
-- coordenador (mesmo escopo de escrita de extraction_insert, 0006).
CREATE POLICY evidence_insert ON evidence FOR INSERT TO app_role WITH CHECK (
  app_patient_in_clinic(patient_id)
  AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(patient_id))
);
--> statement-breakpoint

-- ==================== evidence_revision ====================
-- Log append-only de reclassificação/invalidação (governança V1): assim como
-- `evidence`, imutável em nível de PRIVILÉGIO — trava UPDATE/DELETE mesmo para
-- app_role (torna explícito o que hoje só dependia de "nunca concedido").
REVOKE UPDATE, DELETE ON evidence_revision FROM app_role;
--> statement-breakpoint
GRANT SELECT, INSERT ON evidence_revision TO app_role;
--> statement-breakpoint
ALTER TABLE evidence_revision ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE evidence_revision FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Leitura: mesma visibilidade clínica via join lógico a evidence.patient_id.
CREATE POLICY evidence_revision_select ON evidence_revision FOR SELECT TO app_role USING (
  EXISTS (
    SELECT 1 FROM evidence e
    WHERE e.id = evidence_id
      AND app_patient_in_clinic(e.patient_id)
      AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(e.patient_id))
  )
);
--> statement-breakpoint
-- Escrita restrita ao coordenador (V1/V2), EXCETO a resposta de uma
-- EvidenceQuery aberta: aí o terapeuta-da-equipe também pode gravar a
-- evidence_revision resultante (a resposta gera reclassificação/confirmação de
-- autoria do terapeuta que respondeu — §4A.4 da spec). A aplicação garante o
-- vínculo (evidence_query.resultante_evidence_revision_id); aqui só validamos
-- que existe uma pergunta ABERTA (respondido_em IS NULL) apontando pra essa
-- evidência e que o autor está na equipe do paciente.
CREATE POLICY evidence_revision_insert ON evidence_revision FOR INSERT TO app_role WITH CHECK (
  EXISTS (
    SELECT 1 FROM evidence e
    WHERE e.id = evidence_id AND app_patient_in_clinic(e.patient_id)
  )
  AND (
    current_setting('app.user_role') = 'coordenador'
    OR (
      EXISTS (
        SELECT 1 FROM evidence e
        WHERE e.id = evidence_id AND app_is_on_team(e.patient_id)
      )
      AND EXISTS (
        SELECT 1 FROM evidence_query eq
        WHERE eq.evidence_id = evidence_id AND eq.respondido_em IS NULL
      )
    )
  )
);
--> statement-breakpoint

-- ==================== evidence_query ====================
-- "Devolver com dúvida" (governança V2): abertura é ato do coordenador;
-- leitura segue a mesma visibilidade clínica via join lógico a evidence.
GRANT SELECT, INSERT ON evidence_query TO app_role;
--> statement-breakpoint
GRANT UPDATE (resposta_texto, resultante_evidence_revision_id, respondido_em) ON evidence_query TO app_role;
--> statement-breakpoint
ALTER TABLE evidence_query ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE evidence_query FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY evidence_query_select ON evidence_query FOR SELECT TO app_role USING (
  EXISTS (
    SELECT 1 FROM evidence e
    WHERE e.id = evidence_id
      AND app_patient_in_clinic(e.patient_id)
      AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(e.patient_id))
  )
);
--> statement-breakpoint
-- INSERT (abrir a dúvida): só coordenador.
CREATE POLICY evidence_query_insert ON evidence_query FOR INSERT TO app_role WITH CHECK (
  current_setting('app.user_role') = 'coordenador'
  AND coordenador_id = current_setting('app.user_id')::uuid
  AND EXISTS (
    SELECT 1 FROM evidence e WHERE e.id = evidence_id AND app_patient_in_clinic(e.patient_id)
  )
);
--> statement-breakpoint
-- UPDATE (responder): terapeuta-da-equipe do paciente OU coordenador; só
-- enquanto ainda não respondida (evita reescrever resposta já dada).
CREATE POLICY evidence_query_update ON evidence_query FOR UPDATE TO app_role
  USING (
    respondido_em IS NULL
    AND EXISTS (
      SELECT 1 FROM evidence e
      WHERE e.id = evidence_id
        AND app_patient_in_clinic(e.patient_id)
        AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(e.patient_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM evidence e
      WHERE e.id = evidence_id
        AND app_patient_in_clinic(e.patient_id)
        AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(e.patient_id))
    )
  );
--> statement-breakpoint

-- ==================== evidence_current (view) ====================
-- "Classificação atual" = última reclassificação, ou a original se nunca
-- reclassificada. security_invoker=true é OBRIGATÓRIO: sem ele a view roda com
-- os direitos do dono e IGNORA o RLS de `evidence`, vazando entre clínicas.
-- security_barrier impede vazamento por predicado (reconciliação 13/07/2026).
CREATE VIEW evidence_current WITH (security_invoker = true, security_barrier = true) AS
SELECT e.*,
  COALESCE(
    (SELECT er.classificacao_nova FROM evidence_revision er
     WHERE er.evidence_id = e.id AND er.acao = 'reclassificar'
     ORDER BY er.criado_em DESC LIMIT 1),
    e.classificacao_original
  ) AS classificacao_atual,
  EXISTS (
    SELECT 1 FROM evidence_revision er
    WHERE er.evidence_id = e.id AND er.acao = 'invalidar'
  ) AS invalidada
FROM evidence e;
--> statement-breakpoint
GRANT SELECT ON evidence_current TO app_role;
