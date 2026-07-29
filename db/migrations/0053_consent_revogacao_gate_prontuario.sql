-- #133 / #134 / #135 — Revogação e representação do consentimento
-- (parte 2 de 2): colunas, constraints, trigger, funções de vigência, gate de
-- prontuário nas policies de escrita e guards dentro das funções definer.
--
-- MODELO. `consent` é append-only (0002 + REVOKE UPDATE, DELETE ON consent
-- FROM app_role). Revogar não é apagar nem alterar a linha concedida: é
-- INSERIR uma linha `revogacao_consentimento` apontando para a linha revogada
-- via `consent_revogado_id`. Reconsentir é INSERIR outra concessão. O histórico
-- fica inteiro — que é exatamente o que o parecer exige para fiscalização de
-- conselho e transferência de prontuário.
--
-- CONSEQUÊNCIA JURÍDICA (LGPD Art. 8º, §5º + §13 do termo): revogado o regime
-- de representação (menor ou curatelado) e não havendo NENHUMA concessão de
-- regime vigente, o prontuário entra em SOMENTE-LEITURA. Escrita clínica nova
-- para. Leitura NUNCA para — em nenhuma tabela, sob nenhuma hipótese. Toda
-- policy de SELECT deste banco fica intocada por esta migração.
--
-- TODA comparação de `tipo` usa `"tipo"::text` — ver a nota de 0052 sobre o
-- migrator de transação única. O custo é o mesmo documentado em 0051: a
-- constraint fica CEGA a `ALTER TYPE ... RENAME VALUE`.

-- ---------------------------------------------------------------------------
-- 1. Colunas, chave e FK composta
-- ---------------------------------------------------------------------------

-- `consent_revogado_id`: ponteiro da linha de revogação para a concessão que
-- ela derruba. NULL em toda linha de concessão.
ALTER TABLE "consent" ADD COLUMN "consent_revogado_id" uuid;
--> statement-breakpoint
-- `instrumento_representacao`: identificação do instrumento que legitima quem
-- assinou (termo de curatela, escritura de emancipação). Texto livre por
-- decisão de produto — o documento em si não é anexado ao banco.
ALTER TABLE "consent" ADD COLUMN "instrumento_representacao" text;
--> statement-breakpoint
-- UNIQUE redundante com a PK em `id`, existente APENAS para ser o alvo da FK
-- composta abaixo (Postgres exige índice único sobre exatamente as colunas
-- referenciadas). Não remover achando que é duplicação.
ALTER TABLE "consent" ADD CONSTRAINT "consent_id_patient_uniq" UNIQUE ("id", "patient_id");
--> statement-breakpoint
-- FK COMPOSTA, e não `REFERENCES consent(id)`: incluir `patient_id` nos dois
-- lados torna IMPOSSÍVEL uma revogação apontar para o consent de OUTRO
-- paciente. Com FK simples isso passaria, e um paciente poderia ter o
-- consentimento derrubado por uma linha de outro prontuário.
--
-- `MATCH SIMPLE` (o padrão — NÃO escrever `MATCH FULL`): com MATCH SIMPLE,
-- quando qualquer coluna da chave é NULL a restrição é satisfeita sem lookup.
-- É o que permite as linhas de concessão, que têm `consent_revogado_id` NULL e
-- `patient_id` NOT NULL. `MATCH FULL` exigiria "todas NULL ou nenhuma NULL" e
-- rejeitaria TODA concessão. Comportamento verificado no Postgres real.
--
-- `ON DELETE NO ACTION`, e não `RESTRICT`: `app_purgar_paciente`
-- (0049_alerta_risco_clinico.sql) apaga todo o `consent` do paciente num único
-- DELETE. NO ACTION é checado no fim do comando, então o par
-- (revogação, revogada) some junto sem violar. RESTRICT checa por linha e
-- quebraria o expurgo — que é obrigação legal de eliminação (LGPD Art. 18, VI).
ALTER TABLE "consent" ADD CONSTRAINT "consent_revogado_mesmo_paciente"
  FOREIGN KEY ("consent_revogado_id", "patient_id")
  REFERENCES "consent" ("id", "patient_id") ON DELETE NO ACTION;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. CHECK de coerência entre tipo e colunas
-- ---------------------------------------------------------------------------

-- O CHECK de 0051 cobria só `responsavel_signatario` e só os quatro tipos de
-- então. Ele é substituído por um que cobre as três colunas ao mesmo tempo.
ALTER TABLE "consent" DROP CONSTRAINT "consent_responsavel_por_tipo";
--> statement-breakpoint
-- FAIL-CLOSED, e isso é intencional: a constraint é um OR de ramos, cada ramo
-- ancorado num literal de tipo. Um valor de enum acrescentado no futuro não
-- casa nenhum ramo, o OR dá FALSE e o INSERT é REJEITADO. Quem adicionar valor
-- a `consent_tipo` TEM que acrescentar o ramo correspondente aqui na MESMA
-- migração — não há aviso do Postgres, só INSERTs rejeitados em produção.
--
-- Cada ramo repete `IS NOT NULL` SOMADO a `btrim(...) <> ''` (nunca um no
-- lugar do outro): em CHECK, expressão que avalia para NULL SATISFAZ a
-- constraint — só FALSE rejeita. Com o valor NULL, `btrim(x) <> ''` vira NULL
-- e o ramo inteiro viraria NULL, deixando a linha inválida passar. Ver a nota
-- longa em 0051.
ALTER TABLE "consent" ADD CONSTRAINT "consent_responsavel_por_tipo" CHECK (
  -- Menor: quem assina é o responsável legal, sem instrumento formal.
  ("tipo"::text = 'tratamento_dados_menor'
    AND "responsavel_signatario" IS NOT NULL
    AND btrim("responsavel_signatario") <> ''
    AND "instrumento_representacao" IS NULL
    AND "consent_revogado_id" IS NULL)
  OR
  -- Titular adulto capaz: assina por si, sem responsável e sem instrumento.
  ("tipo"::text = 'autoconsentimento_titular_adulto'
    AND "responsavel_signatario" IS NULL
    AND "instrumento_representacao" IS NULL
    AND "consent_revogado_id" IS NULL)
  OR
  -- Curatela (#134): há signatário (o curador) E instrumento que o legitima.
  ("tipo"::text = 'representacao_curador'
    AND "responsavel_signatario" IS NOT NULL
    AND btrim("responsavel_signatario") <> ''
    AND "instrumento_representacao" IS NOT NULL
    AND btrim("instrumento_representacao") <> ''
    AND "consent_revogado_id" IS NULL)
  OR
  -- Emancipado (#134/#135): assina por si (sem responsável), mas a capacidade
  -- civil antecipada precisa do instrumento que a comprova.
  ("tipo"::text = 'autoconsentimento_titular_emancipado'
    AND "responsavel_signatario" IS NULL
    AND "instrumento_representacao" IS NOT NULL
    AND btrim("instrumento_representacao") <> ''
    AND "consent_revogado_id" IS NULL)
  OR
  -- Finalidades específicas: sem restrição de signatário (compatibilidade
  -- retroativa, ver 0051), mas nunca com instrumento nem com ponteiro.
  ("tipo"::text IN ('uso_ia_processamento', 'exportacao_relatorios')
    AND "instrumento_representacao" IS NULL
    AND "consent_revogado_id" IS NULL)
  OR
  -- Revogação (#133): o ponteiro é OBRIGATÓRIO — uma revogação sem alvo não
  -- diz o que foi revogado e seria indecidível. Sem instrumento.
  ("tipo"::text = 'revogacao_consentimento'
    AND "consent_revogado_id" IS NOT NULL
    AND "instrumento_representacao" IS NULL)
);
--> statement-breakpoint
-- `versao_termo` é NOT NULL desde 0002 e numa linha de revogação não existe
-- "versão de termo assinado" — não se assina um termo para revogar. A coluna
-- passa a carregar um identificador de evento (`revogacao-...`). Este CHECK é
-- uma BICONDICIONAL: `revogacao-%` se e somente se o tipo for revogação. Assim
-- nem uma concessão se disfarça de revogação no relatório, nem uma revogação
-- é contada como termo assinado vigente.
ALTER TABLE "consent" ADD CONSTRAINT "consent_versao_termo_por_tipo" CHECK (
  ("tipo"::text = 'revogacao_consentimento') = ("versao_termo" LIKE 'revogacao-%')
);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. Trigger: o que o CHECK não alcança
-- ---------------------------------------------------------------------------

-- Um CHECK só enxerga a própria linha. Estas duas regras dependem da linha
-- APONTADA, então precisam de trigger:
--   (a) revogar uma revogação — "des-revogar" por ponteiro. Reversibilidade
--       existe, mas o caminho legítimo é assinar uma concessão NOVA, não
--       ressuscitar a antiga: o titular reconsente a partir do termo vigente.
--   (b) apontar para si mesma — ciclo de um nó, sem significado.
--
-- SECURITY DEFINER de propósito: se a leitura de `consent` passasse por RLS, o
-- alvo invisível ao chamador faria o EXISTS dar falso e a validação passaria
-- em vácuo. Fail-closed exige ler como dona. (Exceção consciente à convenção
-- de guard `app_patient_in_clinic` na primeira linha: o isolamento de tenant
-- aqui é dado pela FK composta `consent_revogado_mesmo_paciente`, que já
-- amarra alvo e revogação ao MESMO paciente, e pela policy `consent_insert`,
-- que exige `app_patient_in_clinic(patient_id)`. Um trigger BEFORE INSERT não
-- é chamável fora desse caminho.)
CREATE OR REPLACE FUNCTION app_consent_valida_revogacao() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tipo::text <> 'revogacao_consentimento' THEN
    RETURN NEW;
  END IF;

  IF NEW.consent_revogado_id = NEW.id THEN
    RAISE EXCEPTION 'Revogação não pode apontar para si mesma (consent %)', NEW.id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM consent c
     WHERE c.id = NEW.consent_revogado_id
       AND c.tipo::text = 'revogacao_consentimento'
  ) THEN
    RAISE EXCEPTION 'Não é possível revogar uma revogação (consent %): para restabelecer o tratamento, registre uma nova concessão de consentimento', NEW.consent_revogado_id;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER consent_valida_revogacao
  BEFORE INSERT ON "consent"
  FOR EACH ROW EXECUTE FUNCTION app_consent_valida_revogacao();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4. Funções de vigência
-- ---------------------------------------------------------------------------

-- TRAVA = a concessão de regime MAIS RECENTE é de tipo REPRESENTADO (menor ou
-- curatela) E está revogada.
--
-- O predicado é qualificado pelo regime CORRENTE, nunca pelo HISTÓRICO. A
-- diferença não é cosmética: uma formulação do tipo "já houve representação E
-- não há concessão vigente" trava indevidamente o caso 4 abaixo — o paciente
-- que foi menor, virou adulto, autoconsentiu e depois revogou continuaria
-- carregando `tratamento_dados_menor` no histórico e voltaria a travar. O §13
-- do termo `adulto-v1` (ratificado) promete o contrário: o adulto que revoga
-- MANTÉM o registro clínico do atendimento em curso; o que a revogação dele
-- cessa são IA (§8), transferência internacional (§9) e exportação (§10) —
-- responsabilidade de `app_finalidade_consentida`, não desta função.
--
-- Os seis comportamentos que este predicado tem de produzir, e que os testes
-- da migração provam:
--   1. menor revogado, nada mais .............................. TRAVADO
--   2. menor revogado + família reassina ...................... DESTRAVADO (reversibilidade)
--   3. menor revogado + paciente faz 18 e autoconsente ........ DESTRAVADO (#135)
--   4. o caso 3 + revogação do autoconsentimento .............. NÃO TRAVADO (§13)
--   5. adulto revoga seu autoconsentimento, sem histórico
--      de representação ....................................... NÃO TRAVADO (§13)
--   6. curatelado revogado .................................... TRAVADO
--
-- Desempate DETERMINÍSTICO `ORDER BY assinado_em DESC, id DESC`, mesmo motivo
-- de `app_finalidade_consentida`: `assinado_em` tem DEFAULT now(), `now()` é
-- fixo dentro de uma transação, e várias concessões inseridas no mesmo BEGIN
-- nascem com timestamp idêntico. Sem o desempate por `id`, "o regime mais
-- recente" seria escolhido por ordem física de heap — e a trava de um
-- prontuário de saúde ficaria não-reprodutível.
--
-- Fora da clínica do chamador a função retorna FALSE ("não travado") em vez de
-- levantar erro: quem está fora do tenant já é barrado pelo termo
-- `app_patient_in_clinic` da própria policy, e devolver TRUE aqui vazaria a
-- existência de um prontuário travado em outra clínica (oráculo cross-tenant).
CREATE OR REPLACE FUNCTION app_prontuario_somente_leitura(p_patient uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT CASE WHEN NOT app_patient_in_clinic(p_patient) THEN false ELSE EXISTS (
    SELECT 1 FROM consent c
    WHERE c.id = (
      SELECT c2.id FROM consent c2
      WHERE c2.patient_id = p_patient
        AND c2.tipo::text IN ('tratamento_dados_menor','representacao_curador',
                              'autoconsentimento_titular_adulto','autoconsentimento_titular_emancipado')
      ORDER BY c2.assinado_em DESC, c2.id DESC LIMIT 1)
      AND c.tipo::text IN ('tratamento_dados_menor','representacao_curador')
      AND EXISTS (SELECT 1 FROM consent r
                  WHERE r.tipo::text = 'revogacao_consentimento' AND r.consent_revogado_id = c.id)
  ) END;
$$;
--> statement-breakpoint
-- Variante de caminho para tabelas que não têm `patient_id` e sim `session_id`
-- (session_note, extraction, audio_capture, session_protocol_scope). Mesma
-- semântica; só resolve o paciente antes. Sessão inexistente resolve para NULL
-- e cai no ramo "fora da clínica" da função base (false) — o tenant dessas
-- tabelas já é garantido pelo `clinic_id` / `app_session_terapeuta_id` do
-- predicado vigente de cada policy.
CREATE OR REPLACE FUNCTION app_prontuario_somente_leitura_por_sessao(p_session uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT app_prontuario_somente_leitura((SELECT s.patient_id FROM session s WHERE s.id = p_session));
$$;
--> statement-breakpoint
-- Variante de caminho para evidence_revision e evidence_query, cujo vínculo
-- com o paciente passa por `evidence_id`.
CREATE OR REPLACE FUNCTION app_prontuario_somente_leitura_por_evidencia(p_evidence uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT app_prontuario_somente_leitura((SELECT e.patient_id FROM evidence e WHERE e.id = p_evidence));
$$;
--> statement-breakpoint
-- FINALIDADE — DUAS FUNÇÕES, DE PROPÓSITO. Leia esta nota antes de mexer.
--
-- A trava de prontuário acima NÃO cobre o adulto capaz (§13: o registro
-- clínico continua). O que a revogação do adulto cessa são as FINALIDADES das
-- §8 (IA), §9 (transferência internacional) e §10 (exportação). Esse corte é
-- feito por `app_finalidade_revogada*`, e é ele que entra nas policies.
--
-- `app_finalidade_consentida` (afirmativa) e `app_finalidade_revogada`
-- (negativa) NÃO são uma o complemento da outra, e a diferença é o motivo de
-- ambas existirem:
--
--   * Hoje NENHUM código do produto insere linhas `uso_ia_processamento` ou
--     `exportacao_relatorios` — são valores de enum sem coleta correspondente
--     (`criarPacienteEConsent` grava só a linha de REGIME). Se as policies
--     exigissem `app_finalidade_consentida = true`, TODO paciente existente
--     perderia extração e exportação da noite para o dia. Regressão
--     inaceitável — o gate seria uma migração destrutiva disfarçada.
--   * Por isso a policy usa a forma NEGATIVA: permitido a menos que exista
--     revogação vigente daquela finalidade. Ausência de linha = silêncio =
--     comportamento de hoje, preservado.
--   * `app_finalidade_consentida` fica no banco como a leitura AFIRMATIVA,
--     para UI ("esta finalidade está consentida?") e para o dia em que a
--     coleta por finalidade existir de fato. Quando existir, a troca do
--     predicado da policy passa a ser possível — e aí sim será uma decisão de
--     produto, não um efeito colateral.
--
-- FINALIDADE CONSENTIDA. Aqui a pergunta é "a finalidade X
-- (uso_ia_processamento, exportacao_relatorios) está vigente para este
-- paciente?". Vale para qualquer regime, inclusive adulto capaz.
--
-- Desempate DETERMINÍSTICO: `assinado_em` tem DEFAULT now(), e `now()` é fixo
-- dentro de uma transação — duas concessões inseridas no mesmo BEGIN empatam
-- no timestamp. Sem o desempate por `id` o "último termo" seria escolhido por
-- ordem física de heap, isto é, imprevisível. `ORDER BY assinado_em DESC,
-- id DESC` torna a resposta reprodutível.
CREATE OR REPLACE FUNCTION app_finalidade_consentida(p_patient uuid, p_finalidade text) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT CASE WHEN NOT app_patient_in_clinic(p_patient) THEN false ELSE EXISTS (
    SELECT 1 FROM consent c
    WHERE c.id = (SELECT c2.id FROM consent c2
                  WHERE c2.patient_id = p_patient AND c2.tipo::text = p_finalidade
                  ORDER BY c2.assinado_em DESC, c2.id DESC LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM consent r WHERE r.tipo::text = 'revogacao_consentimento'
                        AND r.consent_revogado_id = c.id)
  ) END;
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_prontuario_somente_leitura(uuid) TO app_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_prontuario_somente_leitura_por_sessao(uuid) TO app_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_prontuario_somente_leitura_por_evidencia(uuid) TO app_role;
--> statement-breakpoint
-- FINALIDADE REVOGADA — a forma NEGATIVA, e a única que entra nas policies
-- (motivo na nota acima). "Revogada" só se a linha MAIS RECENTE daquela
-- finalidade estiver revogada: reconsentir a finalidade com uma linha nova
-- volta a liberar, exatamente como a reversibilidade do regime. Paciente sem
-- nenhuma linha da finalidade → false → nada muda para o acervo atual.
CREATE OR REPLACE FUNCTION app_finalidade_revogada(p_patient uuid, p_finalidade text) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT CASE WHEN NOT app_patient_in_clinic(p_patient) THEN false ELSE EXISTS (
    SELECT 1 FROM consent c
    WHERE c.patient_id = p_patient
      AND c.tipo::text = p_finalidade
      AND EXISTS (SELECT 1 FROM consent r
                  WHERE r.tipo::text = 'revogacao_consentimento' AND r.consent_revogado_id = c.id)
      AND c.id = (SELECT c2.id FROM consent c2
                  WHERE c2.patient_id = p_patient AND c2.tipo::text = p_finalidade
                  ORDER BY c2.assinado_em DESC, c2.id DESC LIMIT 1)
  ) END;
$$;
--> statement-breakpoint
-- Variante de caminho para `extraction`, que não tem `patient_id` e sim
-- `session_id`. Mesma semântica; sessão inexistente resolve para NULL e cai no
-- ramo "fora da clínica" da função base (false).
CREATE OR REPLACE FUNCTION app_finalidade_revogada_por_sessao(p_session uuid, p_finalidade text) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT app_finalidade_revogada((SELECT s.patient_id FROM session s WHERE s.id = p_session), p_finalidade);
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_finalidade_consentida(uuid, text) TO app_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_finalidade_revogada(uuid, text) TO app_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_finalidade_revogada_por_sessao(uuid, text) TO app_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_consent_valida_revogacao() TO app_role;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 5. Gate nas policies de ESCRITA
-- ---------------------------------------------------------------------------
--
-- POR QUE `DROP POLICY` + `CREATE POLICY` E NUNCA `ALTER POLICY`:
-- `ALTER POLICY ... WITH CHECK (expr)` SUBSTITUI a expressão inteira, não
-- concatena. Usá-lo aqui apagaria silenciosamente os guards de papel, de
-- tenant e de equipe de cada predicado — um buraco de autorização que nenhum
-- teste de "a trava funciona" pegaria. Cada policy abaixo reproduz o predicado
-- VIGENTE verbatim (extraído de `pg_policies` do banco real) e apenas ACRESCENTA
-- o termo do gate.
--
-- DELETE entra no gate junto com INSERT/UPDATE: `consolidarSessao` faz
-- `tx.delete(extraction)`, e apagar histórico de um prontuário travado é pior
-- que escrever nele.
--
-- NENHUMA POLICY DE SELECT É TOCADA. Leitura preservada é requisito do parecer
-- (fiscalização de conselho, transferência de prontuário) e da própria LGPD
-- (Art. 18, II — acesso aos dados).
--
-- TABELAS DELIBERADAMENTE FORA DO GATE, e por quê:
--   audit_log ................. trilha imutável. Parar de auditar justamente o
--                               prontuário travado é o oposto do objetivo.
--   consent ................... precisa aceitar a PRÓPRIA revogação e o
--                               reconsentimento que destrava. Gatear consent
--                               tornaria a trava irreversível.
--   care_team_membership ...... administrativo; é o que permite gerir/remover
--                               acesso da equipe DURANTE o bloqueio.
--   agendamento_recorrente,
--   bloqueio .................. agenda. §7 do termo apoia a agenda em execução
--                               de contrato e tutela da saúde, não em
--                               consentimento — revogar consentimento não
--                               impede desmarcar sessões.
--   alerta,
--   alerta_risco_clinico ...... segurança do paciente. Além disso, na prática
--                               já não nascem com o prontuário travado, porque
--                               dependem de extração — que está bloqueada.
--   milestone,
--   goal_milestone_mapping .... catálogo de protocolo da clínica, sem vínculo
--                               a paciente; não há prontuário a travar.
--   session_snapshot .......... não possui policy de ESCRITA (só
--                               `session_snapshot_select`); toda gravação passa
--                               por `app_aplicar_snapshot`, que roda como dona
--                               e não vê RLS. O gate dessa tabela está no guard
--                               acrescentado à função, na seção 6.

-- session -------------------------------------------------------------------
DROP POLICY "session_insert" ON "session";
--> statement-breakpoint
CREATE POLICY "session_insert" ON "session" FOR INSERT TO app_role
  WITH CHECK ((clinic_id = (current_setting('app.clinic_id'::text))::uuid) AND (current_setting('app.user_role'::text) = ANY (ARRAY['admin_recepcao'::text, 'coordenador'::text])) AND app_patient_in_clinic(patient_id) AND app_user_in_clinic(terapeuta_id) AND ((atendido_por_id IS NULL) OR app_user_in_clinic(atendido_por_id)) AND (NOT app_prontuario_somente_leitura(patient_id)));
--> statement-breakpoint
DROP POLICY "session_update" ON "session";
--> statement-breakpoint
CREATE POLICY "session_update" ON "session" FOR UPDATE TO app_role
  USING ((clinic_id = (current_setting('app.clinic_id'::text))::uuid) AND ((current_setting('app.user_role'::text) = ANY (ARRAY['coordenador'::text, 'admin_recepcao'::text])) OR (terapeuta_id = (current_setting('app.user_id'::text))::uuid)) AND (NOT app_prontuario_somente_leitura(patient_id)))
  WITH CHECK ((clinic_id = (current_setting('app.clinic_id'::text))::uuid) AND ((current_setting('app.user_role'::text) = ANY (ARRAY['coordenador'::text, 'admin_recepcao'::text])) OR (terapeuta_id = (current_setting('app.user_id'::text))::uuid)) AND app_patient_in_clinic(patient_id) AND app_user_in_clinic(terapeuta_id) AND ((atendido_por_id IS NULL) OR app_user_in_clinic(atendido_por_id)) AND (NOT app_prontuario_somente_leitura(patient_id)));
--> statement-breakpoint
DROP POLICY "session_delete" ON "session";
--> statement-breakpoint
CREATE POLICY "session_delete" ON "session" FOR DELETE TO app_role
  USING ((clinic_id = (current_setting('app.clinic_id'::text))::uuid) AND (current_setting('app.user_role'::text) = 'coordenador'::text) AND (NOT app_prontuario_somente_leitura(patient_id)));
--> statement-breakpoint

-- goal ----------------------------------------------------------------------
DROP POLICY "goal_insert" ON "goal";
--> statement-breakpoint
CREATE POLICY "goal_insert" ON "goal" FOR INSERT TO app_role
  WITH CHECK ((clinic_id = (current_setting('app.clinic_id'::text))::uuid) AND (current_setting('app.user_role'::text) = ANY (ARRAY['coordenador'::text, 'terapeuta'::text])) AND app_patient_in_clinic(patient_id) AND (criado_por = (current_setting('app.user_id'::text))::uuid) AND ((current_setting('app.user_role'::text) = 'coordenador'::text) OR app_is_on_team(patient_id)) AND (NOT app_prontuario_somente_leitura(patient_id)));
--> statement-breakpoint
DROP POLICY "goal_update" ON "goal";
--> statement-breakpoint
CREATE POLICY "goal_update" ON "goal" FOR UPDATE TO app_role
  USING ((clinic_id = (current_setting('app.clinic_id'::text))::uuid) AND ((current_setting('app.user_role'::text) = 'coordenador'::text) OR app_is_on_team(patient_id)) AND (NOT app_prontuario_somente_leitura(patient_id)))
  WITH CHECK ((clinic_id = (current_setting('app.clinic_id'::text))::uuid) AND app_patient_in_clinic(patient_id) AND ((current_setting('app.user_role'::text) = 'coordenador'::text) OR app_is_on_team(patient_id)) AND (NOT app_prontuario_somente_leitura(patient_id)));
--> statement-breakpoint

-- evidence ------------------------------------------------------------------
DROP POLICY "evidence_insert" ON "evidence";
--> statement-breakpoint
CREATE POLICY "evidence_insert" ON "evidence" FOR INSERT TO app_role
  WITH CHECK (app_patient_in_clinic(patient_id) AND (aprovado_por = (current_setting('app.user_id'::text))::uuid) AND ((current_setting('app.user_role'::text) = 'coordenador'::text) OR app_is_on_team(patient_id)) AND (NOT app_prontuario_somente_leitura(patient_id)));
--> statement-breakpoint

-- milestone_candidacy -------------------------------------------------------
-- Policy FOR ALL. O gate entra no USING (necessário para cobrir DELETE, que
-- não tem WITH CHECK) e no WITH CHECK. Isso NÃO restringe SELECT: policies
-- permissivas são OR'd, e `milestone_candidacy_select` — intocada — já cobre
-- integralmente quem `milestone_candidacy_write` cobriria na leitura
-- (coordenador + paciente na clínica).
DROP POLICY "milestone_candidacy_write" ON "milestone_candidacy";
--> statement-breakpoint
CREATE POLICY "milestone_candidacy_write" ON "milestone_candidacy" FOR ALL TO app_role
  USING ((current_setting('app.user_role'::text) = 'coordenador'::text) AND app_patient_in_clinic(patient_id) AND app_milestone_in_clinic(milestone_id) AND (NOT app_prontuario_somente_leitura(patient_id)))
  WITH CHECK ((current_setting('app.user_role'::text) = 'coordenador'::text) AND app_patient_in_clinic(patient_id) AND app_milestone_in_clinic(milestone_id) AND (NOT app_prontuario_somente_leitura(patient_id)));
--> statement-breakpoint

-- report --------------------------------------------------------------------
-- `report_scope` era a ÚNICA policy de `report` e era FOR ALL — acrescentar o
-- gate ao USING dela bloquearia SELECT também, o que é proibido. Por isso ela
-- é DECOMPOSTA em quatro policies por comando, com os predicados vigentes
-- copiados verbatim: `report_select` recebe o USING original SEM gate
-- (leitura idêntica à de antes desta migração), e insert/update/delete
-- recebem o mesmo predicado MAIS o gate. Nenhuma permissão é criada nem
-- removida além do gate.
DROP POLICY "report_scope" ON "report";
--> statement-breakpoint
CREATE POLICY "report_select" ON "report" FOR SELECT TO app_role
  USING ((deletado_em IS NULL) AND app_patient_in_clinic(patient_id) AND ((current_setting('app.user_role'::text) = 'coordenador'::text) OR app_is_on_team(patient_id)));
--> statement-breakpoint
-- `report_insert` e `report_update` levam TAMBÉM o gate da finalidade §10
-- (exportacao_relatorios): gerar/alterar relatório à família é o ato de
-- exportação que a §10 descreve.
CREATE POLICY "report_insert" ON "report" FOR INSERT TO app_role
  WITH CHECK (app_patient_in_clinic(patient_id) AND ((current_setting('app.user_role'::text) = 'coordenador'::text) OR app_is_on_team(patient_id)) AND (NOT app_prontuario_somente_leitura(patient_id)) AND (NOT app_finalidade_revogada(patient_id, 'exportacao_relatorios')));
--> statement-breakpoint
CREATE POLICY "report_update" ON "report" FOR UPDATE TO app_role
  USING ((deletado_em IS NULL) AND app_patient_in_clinic(patient_id) AND ((current_setting('app.user_role'::text) = 'coordenador'::text) OR app_is_on_team(patient_id)) AND (NOT app_prontuario_somente_leitura(patient_id)) AND (NOT app_finalidade_revogada(patient_id, 'exportacao_relatorios')))
  WITH CHECK (app_patient_in_clinic(patient_id) AND ((current_setting('app.user_role'::text) = 'coordenador'::text) OR app_is_on_team(patient_id)) AND (NOT app_prontuario_somente_leitura(patient_id)) AND (NOT app_finalidade_revogada(patient_id, 'exportacao_relatorios')));
--> statement-breakpoint
-- `report_delete` NÃO leva o gate de finalidade: apagar rascunho de relatório
-- não é exportar. Bloquear o DELETE por revogação de exportação obrigaria a
-- clínica a manter no banco justamente o artefato que a titular pediu para
-- parar de produzir. Só o gate de somente-leitura se aplica aqui.
CREATE POLICY "report_delete" ON "report" FOR DELETE TO app_role
  USING ((deletado_em IS NULL) AND app_patient_in_clinic(patient_id) AND ((current_setting('app.user_role'::text) = 'coordenador'::text) OR app_is_on_team(patient_id)) AND (NOT app_prontuario_somente_leitura(patient_id)));
--> statement-breakpoint

-- patient_clinical_profile --------------------------------------------------
DROP POLICY "pcp_insert" ON "patient_clinical_profile";
--> statement-breakpoint
CREATE POLICY "pcp_insert" ON "patient_clinical_profile" FOR INSERT TO app_role
  WITH CHECK ((current_setting('app.user_role'::text) <> 'admin_recepcao'::text) AND app_patient_in_clinic(patient_id) AND ((current_setting('app.user_role'::text) = 'coordenador'::text) OR app_is_on_team(patient_id)) AND (NOT app_prontuario_somente_leitura(patient_id)));
--> statement-breakpoint
DROP POLICY "pcp_update" ON "patient_clinical_profile";
--> statement-breakpoint
CREATE POLICY "pcp_update" ON "patient_clinical_profile" FOR UPDATE TO app_role
  USING ((current_setting('app.user_role'::text) <> 'admin_recepcao'::text) AND app_patient_in_clinic(patient_id) AND ((current_setting('app.user_role'::text) = 'coordenador'::text) OR app_is_on_team(patient_id)) AND (NOT app_prontuario_somente_leitura(patient_id)))
  WITH CHECK ((current_setting('app.user_role'::text) <> 'admin_recepcao'::text) AND app_patient_in_clinic(patient_id) AND ((current_setting('app.user_role'::text) = 'coordenador'::text) OR app_is_on_team(patient_id)) AND (NOT app_prontuario_somente_leitura(patient_id)));
--> statement-breakpoint
DROP POLICY "pcp_delete" ON "patient_clinical_profile";
--> statement-breakpoint
CREATE POLICY "pcp_delete" ON "patient_clinical_profile" FOR DELETE TO app_role
  USING ((current_setting('app.user_role'::text) = 'coordenador'::text) AND app_patient_in_clinic(patient_id) AND (NOT app_prontuario_somente_leitura(patient_id)));
--> statement-breakpoint

-- patient_alvo_disciplina ---------------------------------------------------
DROP POLICY "patient_alvo_disciplina_insert" ON "patient_alvo_disciplina";
--> statement-breakpoint
CREATE POLICY "patient_alvo_disciplina_insert" ON "patient_alvo_disciplina" FOR INSERT TO app_role
  WITH CHECK ((clinic_id = (current_setting('app.clinic_id'::text))::uuid) AND (current_setting('app.user_role'::text) = ANY (ARRAY['admin_recepcao'::text, 'coordenador'::text])) AND app_patient_in_clinic(patient_id) AND (NOT app_prontuario_somente_leitura(patient_id)));
--> statement-breakpoint
-- `patient_alvo_disciplina_update` e `_delete` têm USING que NÃO menciona
-- `patient_id` (só clinic_id + papel). O gate precisa de um paciente, então
-- entra referenciando a coluna da linha — o que restringe corretamente linha a
-- linha, sem alterar nenhum dos termos vigentes.
DROP POLICY "patient_alvo_disciplina_update" ON "patient_alvo_disciplina";
--> statement-breakpoint
CREATE POLICY "patient_alvo_disciplina_update" ON "patient_alvo_disciplina" FOR UPDATE TO app_role
  USING ((clinic_id = (current_setting('app.clinic_id'::text))::uuid) AND (current_setting('app.user_role'::text) = ANY (ARRAY['admin_recepcao'::text, 'coordenador'::text])) AND (NOT app_prontuario_somente_leitura(patient_id)))
  WITH CHECK ((clinic_id = (current_setting('app.clinic_id'::text))::uuid) AND (current_setting('app.user_role'::text) = ANY (ARRAY['admin_recepcao'::text, 'coordenador'::text])) AND app_patient_in_clinic(patient_id) AND (NOT app_prontuario_somente_leitura(patient_id)));
--> statement-breakpoint
DROP POLICY "patient_alvo_disciplina_delete" ON "patient_alvo_disciplina";
--> statement-breakpoint
CREATE POLICY "patient_alvo_disciplina_delete" ON "patient_alvo_disciplina" FOR DELETE TO app_role
  USING ((clinic_id = (current_setting('app.clinic_id'::text))::uuid) AND (current_setting('app.user_role'::text) = 'coordenador'::text) AND (NOT app_prontuario_somente_leitura(patient_id)));
--> statement-breakpoint

-- patient_protocol ----------------------------------------------------------
-- Policy FOR ALL, mesmo raciocínio de `milestone_candidacy_write`: o gate no
-- USING não restringe leitura porque `pp_read` — intocada — já cobre
-- integralmente o coordenador que `pp_write` cobriria.
DROP POLICY "pp_write" ON "patient_protocol";
--> statement-breakpoint
CREATE POLICY "pp_write" ON "patient_protocol" FOR ALL TO app_role
  USING ((current_setting('app.user_role'::text) = 'coordenador'::text) AND app_patient_in_clinic(patient_id) AND (NOT app_prontuario_somente_leitura(patient_id)))
  WITH CHECK ((current_setting('app.user_role'::text) = 'coordenador'::text) AND app_patient_in_clinic(patient_id) AND app_protocol_in_clinic(protocol_id) AND (NOT app_prontuario_somente_leitura(patient_id)));
--> statement-breakpoint

-- reinforcer_profile --------------------------------------------------------
DROP POLICY "reinforcer_profile_insert" ON "reinforcer_profile";
--> statement-breakpoint
CREATE POLICY "reinforcer_profile_insert" ON "reinforcer_profile" FOR INSERT TO app_role
  WITH CHECK (app_patient_in_clinic(patient_id) AND ((current_setting('app.user_role'::text) = 'coordenador'::text) OR app_is_on_team(patient_id)) AND (NOT app_prontuario_somente_leitura(patient_id)));
--> statement-breakpoint

-- session_note --------------------------------------------------------------
DROP POLICY "session_note_insert" ON "session_note";
--> statement-breakpoint
CREATE POLICY "session_note_insert" ON "session_note" FOR INSERT TO app_role
  WITH CHECK ((clinic_id = (current_setting('app.clinic_id'::text))::uuid) AND (autor_id = (current_setting('app.user_id'::text))::uuid) AND (app_session_terapeuta_id(session_id) = (current_setting('app.user_id'::text))::uuid) AND (NOT app_prontuario_somente_leitura_por_sessao(session_id)));
--> statement-breakpoint
DROP POLICY "session_note_update" ON "session_note";
--> statement-breakpoint
CREATE POLICY "session_note_update" ON "session_note" FOR UPDATE TO app_role
  USING ((clinic_id = (current_setting('app.clinic_id'::text))::uuid) AND (app_session_terapeuta_id(session_id) = (current_setting('app.user_id'::text))::uuid) AND (NOT app_prontuario_somente_leitura_por_sessao(session_id)))
  WITH CHECK ((clinic_id = (current_setting('app.clinic_id'::text))::uuid) AND (app_session_terapeuta_id(session_id) = (current_setting('app.user_id'::text))::uuid) AND (NOT app_prontuario_somente_leitura_por_sessao(session_id)));
--> statement-breakpoint

-- extraction ----------------------------------------------------------------
-- DOIS gates independentes: a trava de prontuário (regime representado
-- revogado) E a revogação da finalidade §8 (uso_ia_processamento). O segundo é
-- o que dá efeito à revogação do ADULTO, que por desenho não trava o
-- prontuário. `extraction` é o produto do agente de extração — é literalmente
-- o "tratamento por IA" que a §8 descreve.
DROP POLICY "extraction_insert" ON "extraction";
--> statement-breakpoint
CREATE POLICY "extraction_insert" ON "extraction" FOR INSERT TO app_role
  WITH CHECK ((clinic_id = (current_setting('app.clinic_id'::text))::uuid) AND (app_session_terapeuta_id(session_id) = (current_setting('app.user_id'::text))::uuid) AND (NOT app_prontuario_somente_leitura_por_sessao(session_id)) AND (NOT app_finalidade_revogada_por_sessao(session_id, 'uso_ia_processamento')));
--> statement-breakpoint
DROP POLICY "extraction_update" ON "extraction";
--> statement-breakpoint
CREATE POLICY "extraction_update" ON "extraction" FOR UPDATE TO app_role
  USING ((clinic_id = (current_setting('app.clinic_id'::text))::uuid) AND (app_session_terapeuta_id(session_id) = (current_setting('app.user_id'::text))::uuid) AND (NOT app_prontuario_somente_leitura_por_sessao(session_id)) AND (NOT app_finalidade_revogada_por_sessao(session_id, 'uso_ia_processamento')))
  WITH CHECK ((clinic_id = (current_setting('app.clinic_id'::text))::uuid) AND (app_session_terapeuta_id(session_id) = (current_setting('app.user_id'::text))::uuid) AND (NOT app_prontuario_somente_leitura_por_sessao(session_id)) AND (NOT app_finalidade_revogada_por_sessao(session_id, 'uso_ia_processamento')));
--> statement-breakpoint
DROP POLICY "extraction_delete" ON "extraction";
--> statement-breakpoint
CREATE POLICY "extraction_delete" ON "extraction" FOR DELETE TO app_role
  USING ((clinic_id = (current_setting('app.clinic_id'::text))::uuid) AND (app_session_terapeuta_id(session_id) = (current_setting('app.user_id'::text))::uuid) AND (NOT app_prontuario_somente_leitura_por_sessao(session_id)) AND (NOT app_finalidade_revogada_por_sessao(session_id, 'uso_ia_processamento')));
--> statement-breakpoint

-- audio_capture -------------------------------------------------------------
DROP POLICY "audio_insert" ON "audio_capture";
--> statement-breakpoint
CREATE POLICY "audio_insert" ON "audio_capture" FOR INSERT TO app_role
  WITH CHECK ((clinic_id = (current_setting('app.clinic_id'::text))::uuid) AND (app_session_terapeuta_id(session_id) = (current_setting('app.user_id'::text))::uuid) AND (NOT app_prontuario_somente_leitura_por_sessao(session_id)));
--> statement-breakpoint
DROP POLICY "audio_update" ON "audio_capture";
--> statement-breakpoint
CREATE POLICY "audio_update" ON "audio_capture" FOR UPDATE TO app_role
  USING ((clinic_id = (current_setting('app.clinic_id'::text))::uuid) AND (app_session_terapeuta_id(session_id) = (current_setting('app.user_id'::text))::uuid) AND (NOT app_prontuario_somente_leitura_por_sessao(session_id)))
  WITH CHECK ((clinic_id = (current_setting('app.clinic_id'::text))::uuid) AND (app_session_terapeuta_id(session_id) = (current_setting('app.user_id'::text))::uuid) AND (NOT app_prontuario_somente_leitura_por_sessao(session_id)));
--> statement-breakpoint

-- session_protocol_scope ----------------------------------------------------
DROP POLICY "sps_insert" ON "session_protocol_scope";
--> statement-breakpoint
CREATE POLICY "sps_insert" ON "session_protocol_scope" FOR INSERT TO app_role
  WITH CHECK ((app_session_terapeuta_id(session_id) = (current_setting('app.user_id'::text))::uuid) AND app_protocol_in_clinic(protocol_id) AND ((ajustado_por IS NULL) OR (ajustado_por = (current_setting('app.user_id'::text))::uuid)) AND (NOT app_prontuario_somente_leitura_por_sessao(session_id)));
--> statement-breakpoint
DROP POLICY "sps_update" ON "session_protocol_scope";
--> statement-breakpoint
CREATE POLICY "sps_update" ON "session_protocol_scope" FOR UPDATE TO app_role
  USING ((app_session_terapeuta_id(session_id) = (current_setting('app.user_id'::text))::uuid) AND (NOT app_prontuario_somente_leitura_por_sessao(session_id)))
  WITH CHECK ((app_session_terapeuta_id(session_id) = (current_setting('app.user_id'::text))::uuid) AND app_protocol_in_clinic(protocol_id) AND ((ajustado_por IS NULL) OR (ajustado_por = (current_setting('app.user_id'::text))::uuid)) AND (NOT app_prontuario_somente_leitura_por_sessao(session_id)));
--> statement-breakpoint
DROP POLICY "sps_delete" ON "session_protocol_scope";
--> statement-breakpoint
CREATE POLICY "sps_delete" ON "session_protocol_scope" FOR DELETE TO app_role
  USING ((app_session_terapeuta_id(session_id) = (current_setting('app.user_id'::text))::uuid) AND (NOT app_prontuario_somente_leitura_por_sessao(session_id)));
--> statement-breakpoint

-- evidence_revision ---------------------------------------------------------
-- Predicado vigente reproduzido verbatim, INCLUSIVE o `eq.evidence_id =
-- eq.evidence_id` do último EXISTS. É quase certamente um bug de digitação da
-- migração original (auto-comparação, sempre verdadeira para não-NULL), mas
-- corrigi-lo AQUI mudaria a autorização de terapeuta em uma migração cuja
-- revisão é sobre revogação de consentimento. Fica como está; correção é
-- assunto de issue própria.
DROP POLICY "evidence_revision_insert" ON "evidence_revision";
--> statement-breakpoint
CREATE POLICY "evidence_revision_insert" ON "evidence_revision" FOR INSERT TO app_role
  WITH CHECK ((autor_id = (current_setting('app.user_id'::text))::uuid) AND (EXISTS ( SELECT 1
   FROM evidence e
  WHERE ((e.id = evidence_revision.evidence_id) AND app_patient_in_clinic(e.patient_id)))) AND ((current_setting('app.user_role'::text) = 'coordenador'::text) OR ((EXISTS ( SELECT 1
   FROM evidence e
  WHERE ((e.id = evidence_revision.evidence_id) AND app_is_on_team(e.patient_id)))) AND (EXISTS ( SELECT 1
   FROM evidence_query eq
  WHERE ((eq.evidence_id = eq.evidence_id) AND (eq.respondido_em IS NULL)))))) AND (NOT app_prontuario_somente_leitura_por_evidencia(evidence_revision.evidence_id)));
--> statement-breakpoint

-- evidence_query ------------------------------------------------------------
DROP POLICY "evidence_query_insert" ON "evidence_query";
--> statement-breakpoint
CREATE POLICY "evidence_query_insert" ON "evidence_query" FOR INSERT TO app_role
  WITH CHECK ((current_setting('app.user_role'::text) = 'coordenador'::text) AND (coordenador_id = (current_setting('app.user_id'::text))::uuid) AND (EXISTS ( SELECT 1
   FROM evidence e
  WHERE ((e.id = evidence_query.evidence_id) AND app_patient_in_clinic(e.patient_id)))) AND (NOT app_prontuario_somente_leitura_por_evidencia(evidence_query.evidence_id)));
--> statement-breakpoint
DROP POLICY "evidence_query_update" ON "evidence_query";
--> statement-breakpoint
CREATE POLICY "evidence_query_update" ON "evidence_query" FOR UPDATE TO app_role
  USING ((respondido_em IS NULL) AND (EXISTS ( SELECT 1
   FROM evidence e
  WHERE ((e.id = evidence_query.evidence_id) AND app_patient_in_clinic(e.patient_id) AND ((current_setting('app.user_role'::text) = 'coordenador'::text) OR app_is_on_team(e.patient_id))))) AND (NOT app_prontuario_somente_leitura_por_evidencia(evidence_query.evidence_id)))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM evidence e
  WHERE ((e.id = evidence_query.evidence_id) AND app_patient_in_clinic(e.patient_id) AND ((current_setting('app.user_role'::text) = 'coordenador'::text) OR app_is_on_team(e.patient_id))))) AND (NOT app_prontuario_somente_leitura_por_evidencia(evidence_query.evidence_id)));
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 6. Guards dentro das funções SECURITY DEFINER
-- ---------------------------------------------------------------------------
--
-- Estas três funções rodam como a dona do schema e NÃO passam por RLS: para
-- elas, todo o gate da seção 5 é código morto. Sem o guard abaixo, um
-- prontuário travado continuaria recebendo snapshot, candidatura e alerta de
-- risco pelas costas da policy.
--
-- Os corpos foram lidos do banco com `\sf` e estão reproduzidos VERBATIM; a
-- única alteração é o bloco novo, inserido logo após o guard de equipe já
-- existente (a ordem importa: tenant → equipe → consentimento, do mais geral
-- para o mais específico, para não vazar existência de paciente).

CREATE OR REPLACE FUNCTION public.app_aplicar_snapshot(p_patient uuid, p_numero integer, p_repertorio jsonb, p_segmentacao jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_patient::text, 0));

  IF NOT app_patient_in_clinic(p_patient) THEN
    RAISE EXCEPTION 'app_aplicar_snapshot: paciente % fora da clínica do chamador (isolamento multi-tenant)', p_patient;
  END IF;

  -- Paridade com session_snapshot_select (0016): coordenador escreve toda a
  -- clínica; terapeuta só paciente da própria equipe vigente.
  IF NOT (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(p_patient)) THEN
    RAISE EXCEPTION 'app_aplicar_snapshot: paciente % fora da equipe do chamador (autorização cross-team)', p_patient;
  END IF;

  IF app_prontuario_somente_leitura(p_patient) THEN
    RAISE EXCEPTION 'Prontuário em somente-leitura: consentimento revogado (LGPD Art. 8º, §5º)';
  END IF;

  INSERT INTO session_snapshot (patient_id, session_numero, repertorio_state, segmentacao, gerado_em)
  VALUES (p_patient, p_numero, p_repertorio, p_segmentacao, now())
  ON CONFLICT (patient_id, session_numero)
  DO UPDATE SET
    repertorio_state = EXCLUDED.repertorio_state,
    segmentacao = EXCLUDED.segmentacao,
    gerado_em = now();
END; $function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.app_aplicar_candidatura(p_patient uuid, p_milestone uuid, p_goal uuid, p_is_candidate boolean, p_candidacy_since timestamp with time zone, p_evidence_count integer, p_distinct_sessions integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_patient::text, 0));

  IF NOT app_patient_in_clinic(p_patient) THEN
    RAISE EXCEPTION 'app_aplicar_candidatura: paciente % fora da clínica do chamador (isolamento multi-tenant)', p_patient;
  END IF;

  -- Paridade com milestone_candidacy_select (0006): mesma fronteira de equipe.
  IF NOT (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(p_patient)) THEN
    RAISE EXCEPTION 'app_aplicar_candidatura: paciente % fora da equipe do chamador (autorização cross-team)', p_patient;
  END IF;

  IF app_prontuario_somente_leitura(p_patient) THEN
    RAISE EXCEPTION 'Prontuário em somente-leitura: consentimento revogado (LGPD Art. 8º, §5º)';
  END IF;

  IF p_goal IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM goal WHERE id = p_goal AND patient_id = p_patient
  ) THEN
    RAISE EXCEPTION 'app_aplicar_candidatura: meta % nao pertence ao paciente % (isolamento violado)', p_goal, p_patient;
  END IF;

  IF p_milestone IS NOT NULL THEN
    INSERT INTO milestone_candidacy (
      patient_id, milestone_id, is_candidate, candidacy_since, evidence_count, distinct_sessions
    )
    VALUES (p_patient, p_milestone, p_is_candidate, p_candidacy_since, p_evidence_count, p_distinct_sessions)
    ON CONFLICT (patient_id, milestone_id)
    DO UPDATE SET
      is_candidate = EXCLUDED.is_candidate,
      candidacy_since = EXCLUDED.candidacy_since,
      evidence_count = EXCLUDED.evidence_count,
      distinct_sessions = EXCLUDED.distinct_sessions;
  END IF;

  IF p_goal IS NOT NULL THEN
    INSERT INTO goal_candidacy (goal_id, is_candidate_dominada, candidacy_since)
    VALUES (p_goal, p_is_candidate, p_candidacy_since)
    ON CONFLICT (goal_id)
    DO UPDATE SET
      is_candidate_dominada = EXCLUDED.is_candidate_dominada,
      candidacy_since = EXCLUDED.candidacy_since;
  END IF;
END; $function$;
--> statement-breakpoint
-- Em `app_criar_alerta_risco` o guard entra logo APÓS a checagem opaca de
-- sessão/tenant e ANTES da idempotência: um alerta já existente continua sendo
-- retornado sem erro se e somente se o paciente não estiver travado — e como o
-- prontuário travado não deveria ter alerta novo nenhum, a exceção vem antes
-- de qualquer escrita.
CREATE OR REPLACE FUNCTION public.app_criar_alerta_risco(p_patient uuid, p_session uuid, p_categoria alerta_risco_categoria, p_severidade alerta_risco_severidade, p_certeza alerta_risco_certeza, p_trecho text, p_detalhe text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clinic  uuid := current_setting('app.clinic_id')::uuid;
  v_minutos integer;
  v_id      uuid;
BEGIN
  IF p_trecho IS NULL OR btrim(p_trecho) = '' THEN
    -- §6: o trecho literal do diário é sempre visível ao lado do alerta. Um
    -- alerta sem trecho seria um veredito da IA sem evidência — proibido.
    RAISE EXCEPTION 'app_criar_alerta_risco: trecho_fonte literal é obrigatório';
  END IF;

  -- Erro OPACO unificado (evita oráculo cross-tenant), padrão de 0045.
  IF NOT EXISTS (
    SELECT 1 FROM session s
     WHERE s.id = p_session
       AND s.patient_id = p_patient
       AND s.clinic_id = v_clinic
  ) THEN
    RAISE EXCEPTION 'app_criar_alerta_risco: sessão inexistente ou sem permissão';
  END IF;

  IF app_prontuario_somente_leitura(p_patient) THEN
    RAISE EXCEPTION 'Prontuário em somente-leitura: consentimento revogado (LGPD Art. 8º, §5º)';
  END IF;

  -- Idempotência de RE-EXTRAÇÃO (não é dedupe clínico). A §3.2 rejeita dedupe
  -- por chave natural de propósito: cada menção em cada sessão é um evento novo.
  -- Mas consolidar a MESMA sessão duas vezes reprocessa o MESMO texto — isso
  -- não é um segundo evento, é o mesmo. Chave = (sessão, trecho literal,
  -- categoria, severidade); dois relatos distintos na mesma sessão têm trechos
  -- distintos e continuam gerando duas linhas.
  SELECT a.id INTO v_id
    FROM alerta_risco_clinico a
   WHERE a.session_id = p_session
     AND a.trecho_fonte = p_trecho
     AND a.categoria = p_categoria
     AND a.severidade = p_severidade
     AND a.deletado_em IS NULL
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;  -- não reabre, não reinicia prazo, não renotifica
  END IF;

  v_minutos := app_prazo_risco_minutos(p_severidade, p_certeza);

  INSERT INTO alerta_risco_clinico (
    clinic_id, patient_id, session_id,
    categoria, severidade, certeza, trecho_fonte, detalhe,
    prazo_minutos, prazo_reconhecimento, atualizado_por
  ) VALUES (
    v_clinic, p_patient, p_session,
    p_categoria, p_severidade, p_certeza, p_trecho, p_detalhe,
    v_minutos, now() + make_interval(mins => v_minutos),
    nullif(current_setting('app.user_id', true), '')::uuid
  ) RETURNING id INTO v_id;

  INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
  VALUES (v_clinic, nullif(current_setting('app.user_id', true), '')::uuid,
          'alerta_risco_criado', 'alerta_risco_clinico', v_id, p_patient,
          jsonb_build_object('severidade', p_severidade, 'certeza', p_certeza,
                             'prazo_minutos', v_minutos));

  RETURN v_id;
END;
$function$;
