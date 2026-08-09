-- D16 (resíduo) — o helper de tenant desce para dentro das funções e da view.
--
-- A `0085` (#229) trocou o cast cru por `app_clinic_id_exigido()` nas 48
-- policies, e a medição confirma que hoje `pg_policies` está limpo:
--   SELECT count(*) FROM pg_policies
--    WHERE qual LIKE '%app.clinic_id%' OR with_check LIKE '%app.clinic_id%';  -- 0
--
-- Só que isso não bastou. A maioria daquelas policies não compara `clinic_id`
-- diretamente: ela delega o isolamento a uma função `SECURITY DEFINER`
-- (`app_patient_in_clinic`, `app_protocol_in_clinic`, `app_user_in_clinic`,
-- `app_session_clinica_visivel`, ...) — e o cast cru continuava lá dentro.
-- O `42704`/`22P02` seguia saindo de dentro da avaliação da policy, um frame
-- mais fundo, com a mesma mensagem que não nomeia o tenant. Medido em
-- `pg_proc.prosrc`, não lido no diff: 13 funções ainda com
-- `current_setting('app.clinic_id')::uuid`, 12 delas `SECURITY DEFINER`.
--
-- Por que `app_clinic_id_exigido()` e não `app_clinic_id_atual()`: em toda
-- ocorrência abaixo o valor está num predicado de isolamento. `atual()` devolve
-- `NULL`, e `clinic_id = NULL` some a linha **em silêncio** — o modo de falha
-- pior num predicado multi-tenant (CLAUDE.md §Migrações, item 6). O caso mais
-- caro é `app_cpf_hash_usado_em_outro_trial`: com `NULL`, o `c.id <> NULL`
-- filtra tudo, a função devolve `false` e a trava anti-fraude do trial
-- desligaria sem erro em lugar nenhum.
--
-- Todas as 13 são chamadas de dentro de `withTenant()` (`src/db/rls.ts`), que
-- sempre faz `set_config('app.clinic_id', ...)`. Verificado nos dois caminhos
-- que poderiam rodar fora dele — `app_cpf_hash_usado_em_outro_trial` e
-- `app_iniciar_trial` — ambos executam dentro do `tx` de
-- `src/app/(app)/pacientes/novo/logic.ts:264,288`. Levantar é fail-closed.
--
-- Os corpos abaixo foram gerados de `pg_get_functiondef()` sobre o banco com
-- todas as migrações aplicadas, com substituição textual apenas do
-- `current_setting('app.clinic_id')::uuid`. Nenhuma outra linha foi tocada —
-- isso evita reescrever à mão um corpo que outra migração já tinha feito
-- `CREATE OR REPLACE` (armadilha do D-CREATE-OR-REPLACE, #216).
--
-- Fora de escopo, de propósito: `current_setting('app.user_role')` e
-- `current_setting('app.user_id')` crus (11 funções). São gates de PAPEL, não
-- de tenant, e trocar "estoura" por "nega" ali muda semântica de autorização
-- dentro de `SECURITY DEFINER` — decisão própria, registrada como D21 no
-- `BACKLOG.md`.
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.app_alerta_risco_visivel(p_alerta uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM alerta_risco_clinico a
    WHERE a.id = p_alerta
      AND a.deletado_em IS NULL
      AND a.clinic_id = app_clinic_id_exigido()
      AND (
        (a.pseudonimizado_em IS NOT NULL AND current_setting('app.user_role') = 'coordenador')
        OR (a.pseudonimizado_em IS NULL
            AND app_patient_in_clinic(a.patient_id)
            AND (current_setting('app.user_role') = 'coordenador'
                 OR app_is_on_team(a.patient_id)
                 OR app_session_terapeuta_id(a.session_id) = current_setting('app.user_id')::uuid))
      )
  );
$function$
;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_cpf_hash_usado_em_outro_trial(p_cpf_hash text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
      FROM patient p
      JOIN clinic c ON c.id = p.clinic_id
     WHERE p.cpf_hash = p_cpf_hash
       AND c.id <> app_clinic_id_exigido()
       AND c.trial_comeco_em IS NOT NULL
  );
END; $function$
;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_criar_alerta_risco(p_patient uuid, p_session uuid, p_categoria alerta_risco_categoria, p_severidade alerta_risco_severidade, p_certeza alerta_risco_certeza, p_trecho text, p_detalhe text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clinic  uuid := app_clinic_id_exigido();
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
$function$
;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_iniciar_trial()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE clinic
     SET trial_comeco_em = now()
   WHERE id = app_clinic_id_exigido()
     AND trial_comeco_em IS NULL
     AND isento_trial = false;
END; $function$
;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_paciente_expurgavel(p_patient uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.alta_em IS NOT NULL
    AND p.nascimento IS NOT NULL
    AND now() >= GREATEST(
      (p.nascimento + INTERVAL '18 years'),
      (p.alta_em + GREATEST(INTERVAL '10 years',
                            make_interval(months => COALESCE(c.politica_retencao_meses, 0))))
    )
  FROM patient p JOIN clinic c ON c.id = p.clinic_id
  WHERE p.id = p_patient
    AND p.clinic_id = app_clinic_id_exigido();  -- isolamento cross-tenant
$function$
;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_patient_in_clinic(p_patient uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM patient p
    WHERE p.id = p_patient
      AND p.clinic_id = app_clinic_id_exigido()
  );
$function$
;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_protocol_in_clinic(p_protocol uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM protocol p
    WHERE p.id = p_protocol
      AND p.clinic_id = app_clinic_id_exigido()
  );
$function$
;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_proximo_numero_sequencial(p_patient uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(MAX(numero_sequencial_paciente), 0) + 1
  FROM session
  WHERE patient_id = p_patient
    AND clinic_id = app_clinic_id_exigido();
$function$
;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_risco_estagio2_ativo()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT count(*)::integer FROM alerta_risco_clinico a
   WHERE a.clinic_id = app_clinic_id_exigido()
     AND a.status = 'escalado_estagio_2'
     AND a.deletado_em IS NULL;
$function$
;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_salvar_config_emergencia(p_responsavel_tecnico uuid, p_protocolo_interno text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clinic uuid := app_clinic_id_exigido();
BEGIN
  IF current_setting('app.user_role') <> 'coordenador' THEN
    RAISE EXCEPTION 'app_salvar_config_emergencia: exige papel coordenador (papel do chamador: %)', current_setting('app.user_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_role
     WHERE clinic_id = v_clinic
       AND user_id = p_responsavel_tecnico
  ) THEN
    RAISE EXCEPTION 'app_salvar_config_emergencia: responsável técnico % não tem papel nesta clínica (isolamento multi-tenant)', p_responsavel_tecnico;
  END IF;

  UPDATE clinic
     SET responsavel_tecnico_id = p_responsavel_tecnico,
         protocolo_emergencia_interno = p_protocolo_interno,
         protocolo_emergencia_declarado_em =
           COALESCE(protocolo_emergencia_declarado_em, now()),
         protocolo_emergencia_declarado_por =
           COALESCE(protocolo_emergencia_declarado_por,
                    current_setting('app.user_id')::uuid)
   WHERE id = v_clinic;
END; $function$
;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_session_clinica_visivel(p_session uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM session s
    WHERE s.id = p_session
      AND s.clinic_id = app_clinic_id_exigido()
      AND (
        current_setting('app.user_role') = 'coordenador'
        OR s.terapeuta_id = current_setting('app.user_id')::uuid
        OR app_is_on_team(s.patient_id)
      )
  );
$function$
;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_session_terapeuta_id(p_session uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.terapeuta_id FROM session s
  WHERE s.id = p_session
    AND s.clinic_id = app_clinic_id_exigido();
$function$
;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_user_in_clinic(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM user_role r
    WHERE r.user_id = p_user
      AND r.clinic_id = app_clinic_id_exigido()
  );
$function$
;
--> statement-breakpoint

-- Caso à parte: `missing_ok` sozinho não fecha o buraco.
--
-- Esta função já usava a forma 2-arg (`current_setting('app.clinic_id', true)`),
-- o que a fazia parecer resolvida na primeira varredura. Mas o `::uuid` continua
-- depois do `COALESCE` implícito: GUC ausente vira `NULL` (ok), GUC PRESENTE e
-- fora do formato — string vazia, lixo, uuid truncado — ainda estoura `22P02`.
-- `app_clinic_id_atual()` é exatamente a forma leniente com guard de formato, e
-- a troca é semanticamente idêntica no caminho feliz.
--
-- Aqui é `atual()` e NÃO `exigido()`: esta função decide se o cadastro de
-- paciente é bloqueado por assinatura, e o desenho vigente (0071) já degrada
-- para "não bloqueia" quando o tenant não está resolvido — ela roda também em
-- caminhos da role dona (seed, migração) onde o GUC não existe. Levantar aqui
-- transformaria um gate permissivo num erro em caminho administrativo, que é
-- mudança de comportamento, não hardening.
CREATE OR REPLACE FUNCTION public.app_assinatura_bloqueia_cadastro()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT CASE
    WHEN (SELECT isento_trial FROM clinic
           WHERE id = app_clinic_id_atual()) THEN false
    ELSE COALESCE(
      (SELECT s.status IN ('setup_pending', 'canceled')
         FROM subscription s
        WHERE s.clinic_id = app_clinic_id_atual()),
      false)
  END;
$function$;
--> statement-breakpoint
-- Deliberadamente NÃO tocada: `app_barreira_somente_leitura` (0073/0082).
-- Ela testa `current_setting('app.clinic_id', true) IS NOT NULL` — sem cast,
-- logo sem 42704 e sem 22P02, nada a consertar. E trocar por
-- `app_clinic_id_atual() IS NOT NULL` seria REGRESSÃO: um GUC presente e
-- malformado passaria de "não-nulo → segue e avalia a barreira" para
-- "NULL → barreira pulada", liberando escrita em conta somente-leitura sem
-- erro nenhum. Falha silenciosa no lugar de uma que hoje é barulhenta.
-- A view mascarada da recepção (`0046`) é o único objeto não-policy onde o
-- `WHERE` **é** a fronteira de autorização: ela roda com direitos do dono
-- (sem `security_invoker`, de propósito — ver o comentário da `0046`), logo o
-- RLS de `audit_log` não se aplica e o filtro de clínica aqui é tudo que separa
-- os tenants. Era também o ponto cego total do guard de CI, que só varria
-- `pg_policies` — texto de view nunca aparece em `pg_policies.qual`.
--
-- `app.user_role` passa a 2-arg (`missing_ok`) em vez de ganhar helper: sem
-- cast, `missing_ok` já elimina o `42704` e não há `22P02` possível. GUC ausente
-- vira `NULL`, o `IN` vira `NULL` → linha negada (fail-closed). O termo de
-- clínica levanta antes disso de qualquer forma.
--
-- `CREATE OR REPLACE VIEW` preserva o `GRANT SELECT ... TO app_role` da `0046`;
-- a lista de colunas é idêntica (requisito do próprio `OR REPLACE`).
CREATE OR REPLACE VIEW audit_log_mascarado WITH (security_barrier = true) AS
  SELECT id, clinic_id, ator_id, acao, entidade, entidade_id, criado_em
  FROM audit_log
  WHERE clinic_id = app_clinic_id_exigido()
    AND current_setting('app.user_role', true) IN ('coordenador', 'admin_recepcao');
