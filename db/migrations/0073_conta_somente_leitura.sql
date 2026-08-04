-- ============================================================================
-- 0073 — Barreira SQL da conta em somente-leitura (#163 + #159 + #175)
-- ============================================================================
--
-- A política comercial decidida no backlog é: trial irrestrito a partir do 1º
-- paciente, sem exigir cartão, e pós-trial = SOMENTE-LEITURA com exportação
-- livre. Nada de "bloquear o cadastro do primeiro paciente".
--
-- Por que a regra também mora no banco, e não só no TypeScript: o guard de
-- aplicação (`src/lib/billing/guard-escrita.ts`) dá a mensagem boa, mas depende
-- de alguém lembrar de aplicá-lo. Um caminho de escrita novo — action futura,
-- import em lote, script — nasceria furando a regra em silêncio. Aqui ele vira
-- erro barulhento.
--
-- Achado que motivou esta migração: `app_assinatura_bloqueia_cadastro()`
-- (0071) foi criada, revogada de PUBLIC e concedida a `app_role` — e NUNCA foi
-- chamada por código de aplicação, trigger ou CHECK. A única referência viva
-- estava num teste. Ou seja: esta não é a segunda barreira, é a primeira.
--
-- Os triggers nascem DESABILITADOS de propósito. Habilitar vem na 0074, depois
-- de observar em staging: trigger com predicado errado em tabela clínica trava
-- clínica pagante, e isso custa mais caro que uma migração extra.

-- ==================== app_conta_somente_leitura ====================
-- Retorna true quando a clínica do GUC de tenant está em somente-leitura.
--
-- NÃO é SECURITY DEFINER, mesmo raciocínio da 0071: lê `clinic` e `subscription`
-- pelas policies de SELECT de `app_role`, que já são tenant-scoped. CLAUDE.md §5
-- exige DEFINER quando a ESCRITA sai do que a RLS permite — aqui não sai nada.
--
-- Sem linha visível → false (PERMITE). Sem GUC de tenant quem executa é
-- `iris_auth`, o job, o seed ou uma migração; falhar fechado trancaria o próprio
-- webhook que promove a assinatura para `active` — a saída do bloqueio.
--
-- ⚠️ A aritmética de data DIVERGE do TypeScript de propósito. `src/lib/trial.ts`
-- conta datas civis no timezone da clínica; aqui a conta é em `interval`. O
-- `+ 1 day` de folga torna esta rede ESTRITAMENTE MAIS PERMISSIVA que a decisão
-- do TS — nunca produz um bloqueio que o TS não produziria. Duplicar lógica de
-- fuso em duas linguagens é exatamente como duas fontes de verdade nascem; a
-- folga é o que impede que a divergência vire incidente.
--
-- O ramo `COALESCE(trial_comeco_em, criado_em + 14 days)` espelha o teto
-- `DIAS_ATE_INICIO_AUTOMATICO` do TS: quem nunca cadastrou paciente não fica com
-- trial eterno, mas também não é bloqueado antes do teto.
CREATE OR REPLACE FUNCTION app_conta_somente_leitura()
RETURNS boolean LANGUAGE sql STABLE AS $$
  WITH ctx AS (
    SELECT c.isento_trial, c.trial_comeco_em, c.trial_dias, c.criado_em,
           (SELECT s.status::text FROM subscription s WHERE s.clinic_id = c.id) AS status
      FROM clinic c
     WHERE c.id = current_setting('app.clinic_id', true)::uuid
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM ctx) THEN false
    ELSE (
      SELECT NOT (
        isento_trial
        OR trial_dias IS NULL
        OR COALESCE(status, 'free_tier') IN ('active', 'past_due')
        OR (
          COALESCE(status, 'free_tier') <> 'canceled'
          AND now() < COALESCE(trial_comeco_em, criado_em + interval '14 days')
                      + ((trial_dias + 1) * interval '1 day')
        )
      )
      FROM ctx
    )
  END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_conta_somente_leitura() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_conta_somente_leitura() TO app_role;
--> statement-breakpoint

-- ==================== app_barreira_somente_leitura ====================
-- Trigger de linha. Três condições precisam valer ao mesmo tempo para barrar:
--
-- 1. Existe GUC de tenant. Sem ele a escrita não vem do produto.
-- 2. Quem executa é papel de aplicação, e NÃO o dono/superusuário. O teste de
--    `rolsuper`/`rolbypassrls` é indispensável: o Postgres considera o
--    superusuário membro implícito de TODA role, então `pg_has_role` sozinho
--    daria true dentro de qualquer função SECURITY DEFINER do owner — incluindo
--    `app_iniciar_trial()`, que escreve em `clinic` no meio do 1º cadastro.
-- 3. A conta está em somente-leitura.
--
-- `RAISE EXCEPTION` e não `RETURN NULL`: um UPDATE barrado por RLS afeta 0
-- linhas EM SILÊNCIO e o código parece funcionar. Aqui a falha tem que chegar.
CREATE OR REPLACE FUNCTION app_barreira_somente_leitura()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.clinic_id', true) IS NOT NULL
     AND pg_has_role(current_user, 'app_role', 'member')
     AND EXISTS (
       SELECT 1 FROM pg_roles r
        WHERE r.rolname = current_user
          AND NOT r.rolsuper
          AND NOT r.rolbypassrls
     )
     AND app_conta_somente_leitura() THEN
    RAISE EXCEPTION 'conta em somente-leitura: escrita bloqueada em %', TG_TABLE_NAME
      USING ERRCODE = 'P0001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_barreira_somente_leitura() FROM PUBLIC;
--> statement-breakpoint

-- ==================== Instalação dos triggers (DESABILITADOS) ====================
-- Cobertura: escrita clínica e operacional do produto.
--
-- Deliberadamente FORA da barreira, cada um com razão própria:
--   • consent / professional_consent — revogação é direito do titular (LGPD
--     art. 18) e não se suspende por inadimplência da clínica;
--   • alerta_risco_clinico e a config de emergência em `clinic.protocolo_*` —
--     segurança clínica vence cobrança (mesmo espírito do `past_due` liberado);
--   • subscription / billing_* — escrita é de `iris_auth`, e trancar aqui
--     trancaria a própria saída do bloqueio;
--   • audit_log — auditoria não pode falhar por causa de cobrança;
--   • report / report_pdf — exportar é leitura, e a promessa é "exportação
--     livre" justamente no estado de somente-leitura.
--
-- `clinic` ENTRA na lista (config da clínica é escrita do produto).
-- `clinic.trial_comeco_em` continua seguro porque a única escrita é via
-- `app_iniciar_trial()`, SECURITY DEFINER do owner — excluída pela condição 2.
DO $$
DECLARE
  t text;
  alvos text[] := ARRAY[
    'patient', 'patient_alvo_disciplina', 'patient_clinical_profile',
    'patient_protocol',
    'session', 'session_note', 'session_protocol_scope',
    'evidence', 'evidence_revision',
    'goal', 'goal_candidacy', 'goal_milestone_mapping',
    'care_team_membership', 'janela_trabalho', 'bloqueio',
    'agendamento_recorrente',
    'user_role', 'clinic'
  ];
BEGIN
  FOREACH t IN ARRAY alvos LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON %I', t || '_somente_leitura', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION app_barreira_somente_leitura()',
      t || '_somente_leitura', t);
    -- Nasce desabilitado. A 0074 habilita depois da observação em staging.
    EXECUTE format('ALTER TABLE %I DISABLE TRIGGER %I', t, t || '_somente_leitura');
  END LOOP;
END $$;
--> statement-breakpoint

-- ==================== Obsolescência da barreira órfã da 0071 ====================
-- Não é dropada nesta migração: `db/tests/billing-apuracao.int.test.ts` ainda a
-- referencia, e dropar junto transformaria uma migração de política numa
-- migração que quebra a suíte. O COMMENT é o marcador para o drop na sequência.
COMMENT ON FUNCTION app_assinatura_bloqueia_cadastro() IS
  'OBSOLETA (0073). Nunca foi chamada por código de aplicação, trigger ou CHECK — a barreira real é app_conta_somente_leitura() + trigger app_barreira_somente_leitura. Remover quando nenhum teste a referenciar.';
