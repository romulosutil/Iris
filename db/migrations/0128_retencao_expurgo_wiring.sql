-- #352 — Expurgo de prontuário expirado: fecha o wiring diferido da Fatia 6.3.
--
-- Nada aqui é modelado pelo Drizzle (funções, role, grants), logo esta migração
-- é escrita à mão e NÃO toca `meta/NNNN_snapshot.json`. A entrada no
-- `_journal.json` também é manual, com `when` = `when` da 0127 + 1000: `when`
-- menor ou igual ao máximo já aplicado faz o Drizzle PULAR o arquivo em
-- silêncio.
--
-- O que esta migração muda de comportamento (cada item tem teste em
-- `db/tests/retencao-*.int.test.ts`):
--
--   1. `app_purgar_paciente` passa a EXIGIR que o prazo de guarda tenha
--      vencido. Até hoje a regra de retenção era consultiva: a função nunca
--      chamou `app_paciente_expurgavel`, e um coordenador apagava fisicamente
--      o prontuário de um paciente em atendimento, dentro do prazo legal.
--   2. Nasce `app_purgar_paciente_excepcional`, SEM o gate, exigindo
--      `base_legal` escrita. Ela existe por dois motivos independentes: ordem
--      judicial (Art. 18) e — o motivo que trava a restauração de backup — o
--      replay de tombstones pós-restore, que re-expurga titulares que são,
--      POR DEFINIÇÃO, inelegíveis. Com o gate no caminho do replay,
--      `restore.sh` (`ON_ERROR_STOP=1`, fail-closed) abortaria a restauração
--      inteira. Ver `.specs/features/352-expurgo-prontuario-expirado/context.md` §3.
--   3. A fórmula de retenção deixa de estar escrita dentro do predicado e
--      passa a ter fonte única (`app_retencao_vence_em`), consumida pelos três
--      chamadores. Dois predicados que "deveriam" ser iguais divergem.
--   4. A comparação passa a ser em DATA CIVIL no fuso da clínica. Aqui existe
--      data prometida a alguém: a clínica lê o vencimento na tela e recebe
--      aviso de 90 dias. É o caso do `src/lib/trial.ts`, não o do
--      auto-arquivamento (UTC, "aqui não existe data prometida a ninguém").
--
-- ⚠️ `CREATE OR REPLACE` torna o diff enganoso: ler este `.sql` NÃO prova o
--    corpo vigente no banco. A verificação é `pg_proc.prosrc`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Fonte única do predicado de retenção
-- ─────────────────────────────────────────────────────────────────────────────
-- Fórmula EXTRAÍDA de `app_paciente_expurgavel` (0087:176-194), não reescrita:
-- ela já passou por revisão de PR. O termo dos 18 anos não é redundante — ele
-- domina quando a alta ocorre na primeira infância, e nesse caso é a única
-- coisa que impede o expurgo do prontuário de um paciente ainda menor.
--
-- Devolve NULL quando `alta` ou `nascimento` é NULL: sem alta o relógio de
-- retenção nem partiu, então não existe data de vencimento — e "nunca vence" é
-- a leitura conservadora correta numa operação irreversível.
--
-- IMMUTABLE porque é função pura dos argumentos. É isso que garante que os três
-- chamadores (predicado por UUID, fila da UI, varredura do job) computem o
-- MESMO número, e que ela possa entrar num índice no futuro.
--
-- Sem `SET search_path` de propósito: `SET` bloqueia o inlining da função SQL, e
-- ela não referencia objeto nenhum que possa ser sequestrado por search_path —
-- só operadores de builtin. Todos os chamadores são SECURITY DEFINER com
-- `SET search_path = public`, que vale durante a chamada aninhada.
CREATE OR REPLACE FUNCTION public.app_retencao_vence_em(
  p_alta            date,
  p_nascimento      date,
  p_politica_meses  integer
) RETURNS date
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_alta IS NULL OR p_nascimento IS NULL THEN NULL
    ELSE GREATEST(
      (p_nascimento + INTERVAL '18 years'),
      (p_alta + GREATEST(INTERVAL '10 years',
                         make_interval(months => COALESCE(p_politica_meses, 0))))
    )::date
  END;
$$;
--> statement-breakpoint

COMMENT ON FUNCTION public.app_retencao_vence_em(date, date, integer) IS
  '#352 — data civil em que a guarda do prontuário expira. Fonte única do predicado de retenção: NÃO reescrever a fórmula em nenhum chamador.';
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Predicado por UUID — passa a delegar, e a comparar no fuso da clínica
-- ─────────────────────────────────────────────────────────────────────────────
-- Semântica preservada linha a linha em relação à 0087:
--   `alta_em` ou `nascimento` NULL  → `false` (não erro), porque
--                                      `false AND NULL` = `false` em SQL;
--   linha ausente (inexistente OU de outra clínica) → NULL, e quem lê o valor
--                                      trata NULL como "não elegível".
--
-- O guard de tenant (`app_clinic_id_exigido()`) é preservado EXATAMENTE:
-- sendo SECURITY DEFINER, ele é a única fronteira. `app_clinic_id_atual()`
-- aqui devolveria NULL e sumiria com a linha em silêncio.
CREATE OR REPLACE FUNCTION public.app_paciente_expurgavel(p_patient uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.alta_em IS NOT NULL
    AND p.nascimento IS NOT NULL
    AND (now() AT TIME ZONE c.timezone)::date
          >= app_retencao_vence_em(p.alta_em, p.nascimento, c.politica_retencao_meses)
  FROM patient p JOIN clinic c ON c.id = p.clinic_id
  WHERE p.id = p_patient
    AND p.clinic_id = app_clinic_id_exigido();  -- isolamento cross-tenant
$$;
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Corpo de erasure compartilhado
-- ─────────────────────────────────────────────────────────────────────────────
-- Os 5 passos foram MOVIDOS do corpo vigente de `app_purgar_paciente`
-- (0094:150-207), não reescritos. A lista de DELETE é copiada literalmente, na
-- mesma ordem: as FKs são `restrict`/`no action`, então uma ordem errada
-- estoura ruidosamente — mas uma lista INCOMPLETA só deixa órfão, e passa
-- verde. Existir uma segunda lista que diverge da primeira é exatamente o
-- defeito que esta extração elimina.
--
-- Recebe o paciente JÁ AUTORIZADO e o `detalhe` pronto: toda a decisão de
-- autorização mora nas duas vias públicas abaixo.
--
-- SEM GRANT PARA NINGUÉM (`REVOKE ALL FROM PUBLIC` e nada mais): as duas vias
-- públicas são DEFINER do mesmo owner, então chamam sem precisar de privilégio.
CREATE OR REPLACE FUNCTION public.app_purgar_paciente_interno(p_patient uuid, p_detalhe jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clinic uuid;
BEGIN
  SELECT clinic_id INTO v_clinic FROM patient WHERE id = p_patient;

  -- 1) trilha PRIMEIRO — linha-fato já pseudônima.
  INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
  VALUES (v_clinic, app_user_id_exigido(), 'paciente_purgado', 'patient', p_patient, NULL,
          p_detalhe);

  -- 2) pseudonimiza a trilha histórica do sujeito.
  --    A sobrescrita INTEGRAL de `detalhe` é decisão travada na revisão do
  --    PR #68: erasure é whitelist, não blacklist. PII numa chave imprevista
  --    sobreviveria a uma remoção seletiva. Over-remoção não gera vazamento;
  --    under-remoção sim. Não "consertar" para preservar chaves.
  UPDATE audit_log
     SET patient_id = NULL,
         detalhe = jsonb_build_object('pseudonimizado', true,
                                      'motivo_expurgo', p_detalhe->>'motivo')
   WHERE patient_id = p_patient;

  -- 2b) pseudonimiza os alertas de risco (H2) — ANTES dos DELETEs, porque é
  --     isto que solta as FKs para `patient` e `session` e destrava o erasure.
  UPDATE alerta_risco_clinico
     SET patient_id = NULL,
         session_id = NULL,
         trecho_fonte = '[expurgado]',
         detalhe = '[expurgado]',
         conduta_registrada = CASE WHEN conduta_registrada IS NULL THEN NULL ELSE '[expurgado]' END,
         motivo_descarte = CASE WHEN motivo_descarte IS NULL THEN NULL ELSE '[expurgado]' END,
         pseudonimizado_em = now(),
         atualizado_em = now()
   WHERE patient_id = p_patient;

  -- 3) erasure físico, leaf-first.
  DELETE FROM evidence_query      WHERE evidence_id IN (SELECT id FROM evidence WHERE patient_id = p_patient);
  DELETE FROM evidence_revision   WHERE evidence_id IN (SELECT id FROM evidence WHERE patient_id = p_patient);
  DELETE FROM evidence            WHERE patient_id = p_patient;
  DELETE FROM reinforcer_profile  WHERE patient_id = p_patient;
  DELETE FROM session_snapshot    WHERE patient_id = p_patient;
  DELETE FROM report_pdf          WHERE report_id IN (SELECT id FROM report WHERE patient_id = p_patient);
  DELETE FROM report              WHERE patient_id = p_patient;
  DELETE FROM session_note        WHERE session_id IN (SELECT id FROM session WHERE patient_id = p_patient);
  DELETE FROM session_protocol_scope WHERE session_id IN (SELECT id FROM session WHERE patient_id = p_patient);
  DELETE FROM audio_capture       WHERE session_id IN (SELECT id FROM session WHERE patient_id = p_patient);
  DELETE FROM extraction          WHERE session_id IN (SELECT id FROM session WHERE patient_id = p_patient);
  DELETE FROM goal_milestone_mapping WHERE goal_id IN (SELECT id FROM goal WHERE patient_id = p_patient);
  DELETE FROM goal_candidacy      WHERE goal_id IN (SELECT id FROM goal WHERE patient_id = p_patient);
  DELETE FROM alerta              WHERE patient_id = p_patient;
  DELETE FROM goal                WHERE patient_id = p_patient;
  DELETE FROM session             WHERE patient_id = p_patient;
  DELETE FROM agendamento_recorrente WHERE patient_id = p_patient;
  DELETE FROM patient_alvo_disciplina WHERE patient_id = p_patient;
  DELETE FROM bloqueio            WHERE patient_id = p_patient;
  DELETE FROM consent             WHERE patient_id = p_patient;
  DELETE FROM patient_protocol    WHERE patient_id = p_patient;
  DELETE FROM care_team_membership WHERE patient_id = p_patient;
  DELETE FROM milestone_candidacy WHERE patient_id = p_patient;
  DELETE FROM patient_clinical_profile WHERE patient_id = p_patient;

  -- 4) raiz
  DELETE FROM patient WHERE id = p_patient;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_purgar_paciente_interno(uuid, jsonb) FROM PUBLIC;
--> statement-breakpoint

COMMENT ON FUNCTION public.app_purgar_paciente_interno(uuid, jsonb) IS
  '#352 — corpo de erasure compartilhado. NÃO recebe grant: só as duas vias públicas (DEFINER do mesmo owner) a chamam. Recebe o paciente já autorizado.';
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Via normal — ganha o gate de elegibilidade como TERCEIRO guard
-- ─────────────────────────────────────────────────────────────────────────────
-- A ordem dos guards é requisito, não estilo: papel → tenant → elegibilidade.
-- Subir a elegibilidade acima do guard de tenant transformaria a função num
-- oráculo de existência entre clínicas (mensagem diferente para "existe em
-- outra clínica" e "não existe"). A mensagem opaca
-- 'paciente inexistente ou sem permissão' é travada na revisão do PR #68.
--
-- `COALESCE(..., false)` é defesa em profundidade: em lógica de três valores
-- `alta_em IS NULL` já produz `false`, e o NULL só aparece para linha ausente —
-- que o guard 2 já barrou. Ainda assim fica, porque `IF NOT NULL` NÃO dispara,
-- e interpretar NULL como "elegível por falta de dado" é o modo de falha que
-- apaga prontuário.
CREATE OR REPLACE FUNCTION public.app_purgar_paciente(p_patient uuid, p_motivo text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clinic uuid;
BEGIN
  IF app_user_role_exigido() <> 'coordenador' THEN
    RAISE EXCEPTION 'app_purgar_paciente: só coordenador purga (papel atual %)', app_user_role_exigido();
  END IF;
  SELECT clinic_id INTO v_clinic FROM patient WHERE id = p_patient;
  IF v_clinic IS NULL OR NOT app_patient_in_clinic(p_patient) THEN
    RAISE EXCEPTION 'app_purgar_paciente: paciente inexistente ou sem permissão';
  END IF;
  IF NOT COALESCE(app_paciente_expurgavel(p_patient), false) THEN
    RAISE EXCEPTION 'app_purgar_paciente: prazo de guarda ainda não venceu';
  END IF;

  PERFORM app_purgar_paciente_interno(
    p_patient,
    jsonb_build_object('motivo', p_motivo, 'pseudonimizado', true)
  );
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_purgar_paciente(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_purgar_paciente(uuid, text) TO app_role;
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Via excepcional — sem gate, exigindo base legal escrita
-- ─────────────────────────────────────────────────────────────────────────────
-- Função IRMÃ NOMEADA, nunca um parâmetro `p_forcar boolean DEFAULT false`:
-- parâmetro opcional vira o caminho padrão por preguiça de UI, e nome explícito
-- força decisão consciente em cada chamador — além de fazer o `grep` encontrar
-- todos eles.
--
-- ⚠️ `acao` continua `'paciente_purgado'`, e vem do interno justamente para que
--    não haja como divergir por descuido. NÃO é rótulo, é INTERFACE:
--    `infra/backup/backup.sh:470` extrai o ledger de tombstones filtrando por
--    essa string literal. Se esta via gravasse `paciente_purgado_excepcional`,
--    o `backup.sh` não a capturaria no ciclo seguinte e o expurgo excepcional
--    seria DESFEITO no primeiro restore — o titular expurgado por ordem
--    judicial voltaria a existir.
CREATE OR REPLACE FUNCTION public.app_purgar_paciente_excepcional(
  p_patient uuid, p_motivo text, p_base_legal text
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clinic uuid;
BEGIN
  IF app_user_role_exigido() <> 'coordenador' THEN
    RAISE EXCEPTION 'app_purgar_paciente_excepcional: só coordenador purga (papel atual %)', app_user_role_exigido();
  END IF;
  SELECT clinic_id INTO v_clinic FROM patient WHERE id = p_patient;
  IF v_clinic IS NULL OR NOT app_patient_in_clinic(p_patient) THEN
    RAISE EXCEPTION 'app_purgar_paciente_excepcional: paciente inexistente ou sem permissão';
  END IF;
  -- Base legal em branco derrota o propósito da via: o campo existe para que a
  -- decisão jurídica fique registrada por caso, não presumida em código.
  IF COALESCE(btrim(p_base_legal), '') = '' THEN
    RAISE EXCEPTION 'app_purgar_paciente_excepcional: base legal é obrigatória';
  END IF;

  PERFORM app_purgar_paciente_interno(
    p_patient,
    jsonb_build_object('motivo', p_motivo, 'base_legal', p_base_legal,
                       'excepcional', true, 'pseudonimizado', true)
  );
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_purgar_paciente_excepcional(uuid, text, text) FROM PUBLIC;
--> statement-breakpoint
-- Grant simétrico ao da via normal. A UI do V1 não chama esta função e o
-- `reaplicar-tombstones.sql` roda como owner — mas manter o grant evita que
-- alguém DESCUBRA que precisa dele no meio de um incidente de restauração.
GRANT EXECUTE ON FUNCTION public.app_purgar_paciente_excepcional(uuid, text, text) TO app_role;
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Fila de elegíveis, tenant-scoped e paginada
-- ─────────────────────────────────────────────────────────────────────────────
-- Ordem das operações é requisito: filtrar → contar sobre o conjunto filtrado
-- → limitar. `count(*) OVER ()` depois do LIMIT devolve o total da PÁGINA;
-- filtrar depois do LIMIT trava a fila.
--
-- Sendo SECURITY DEFINER, o guard interno é a ÚNICA fronteira, e ele espelha o
-- predicado da policy de leitura de `patient` (clínica + papel), não só a
-- igualdade de clínica. Aqui o papel é estreitado para `coordenador`, que é
-- quem a tela exige.
--
-- Rejeitada a alternativa de view `security_barrier`: a barreira impede o
-- LIMIT de descer até o índice (já custou 688ms contra 10ms noutra fila deste
-- repo) e view não aceita parâmetro de paginação sem virar função de qualquer
-- forma.
CREATE OR REPLACE FUNCTION public.app_pacientes_expurgaveis(
  p_limite integer, p_offset integer
) RETURNS TABLE (
  paciente_id uuid,
  nome        text,
  alta_em     date,
  vence_em    date,
  avisado_em  timestamptz,
  total       bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH elegiveis AS (
    SELECT p.id,
           p.nome,
           p.alta_em,
           app_retencao_vence_em(p.alta_em, p.nascimento, c.politica_retencao_meses) AS vence_em
      FROM patient p
      JOIN clinic c ON c.id = p.clinic_id
     WHERE p.clinic_id = app_clinic_id_exigido()
       AND app_user_role_exigido() = 'coordenador'
       AND p.alta_em IS NOT NULL
       AND p.nascimento IS NOT NULL
       AND (now() AT TIME ZONE c.timezone)::date
             >= app_retencao_vence_em(p.alta_em, p.nascimento, c.politica_retencao_meses)
  ), contado AS (
    SELECT e.*, count(*) OVER () AS total FROM elegiveis e
  )
  SELECT ct.id,
         ct.nome,
         ct.alta_em,
         ct.vence_em,
         (SELECT max(al.criado_em) FROM audit_log al
           WHERE al.entidade = 'patient'
             AND al.entidade_id = ct.id
             AND al.acao = 'expurgo_aviso_previo') AS avisado_em,
         ct.total
    FROM contado ct
   ORDER BY ct.vence_em ASC, ct.id ASC
   LIMIT p_limite OFFSET p_offset;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_pacientes_expurgaveis(integer, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_pacientes_expurgaveis(integer, integer) TO app_role;
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Varredura de aviso prévio (cross-tenant, escrita pelo job)
-- ─────────────────────────────────────────────────────────────────────────────
-- O aviso é IN-APP: uma linha em `audit_log` que a fila da clínica lê. Nunca
-- e-mail nem SMS. Mesma regra do job de arquivamento, e aqui o argumento é mais
-- forte: arquivamento é ato administrativo sobre cobrança, expurgo é evento
-- clínico. Se um dia o aviso tiver de sair por e-mail, ele vira um SEGUNDO
-- trilho lendo a fila já materializada — não este job.
--
-- UMA instrução, de propósito: o `INSERT` É o dedup. Separar em "seleciona,
-- depois insere" abriria janela entre o efeito e o registro do efeito.
--
-- Quatro propriedades que são requisito:
--   • janela FECHADA em cima (`vence_em > hoje`) — passado o vencimento quem
--     age é a fila; sem esse limite o job reavisa a cada varredura;
--   • dedup ancorado na alta (`criado_em > alta_em`) — alta corrigida reabre o
--     aviso, e a mesma alta nunca avisa duas vezes;
--   • LIMIT DEPOIS dos predicados — linha inelegível não consome cota do lote
--     nem trava a fila;
--   • `ator_id = NULL` — não houve ator humano.
CREATE OR REPLACE FUNCTION public.app_retencao_avisar(
  p_referencia timestamptz,
  p_aviso_dias integer,
  p_lote       integer
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_avisados integer;
BEGIN
  WITH alvo AS (
    SELECT p.id,
           p.clinic_id,
           app_retencao_vence_em(p.alta_em, p.nascimento, c.politica_retencao_meses) AS vence_em,
           (p_referencia AT TIME ZONE c.timezone)::date AS hoje
      FROM patient p
      JOIN clinic c ON c.id = p.clinic_id
     WHERE p.alta_em IS NOT NULL
       AND p.nascimento IS NOT NULL
       AND app_retencao_vence_em(p.alta_em, p.nascimento, c.politica_retencao_meses)
             >  (p_referencia AT TIME ZONE c.timezone)::date
       AND app_retencao_vence_em(p.alta_em, p.nascimento, c.politica_retencao_meses)
             <= (p_referencia AT TIME ZONE c.timezone)::date + p_aviso_dias
       AND NOT EXISTS (
         SELECT 1 FROM audit_log al
          WHERE al.entidade = 'patient'
            AND al.entidade_id = p.id
            AND al.acao = 'expurgo_aviso_previo'
            AND al.criado_em > p.alta_em
       )
     ORDER BY 3 ASC
     LIMIT p_lote
     -- Duas execuções sobrepostas do job não avisam o mesmo paciente duas
     -- vezes. `SKIP LOCKED` porque uma linha travada por edição em curso é
     -- caso do tick seguinte, não motivo para o lote inteiro esperar.
     FOR UPDATE OF p SKIP LOCKED
  ), ins AS (
    INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id,
                           patient_id, detalhe, criado_em)
    SELECT a.clinic_id,
           NULL,
           'expurgo_aviso_previo', 'patient', a.id, a.id,
           jsonb_build_object('origem', 'job',
                              'vence_em', a.vence_em,
                              'dias_restantes', a.vence_em - a.hoje),
           p_referencia
      FROM alvo a
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_avisados FROM ins;

  RETURN v_avisados;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_retencao_avisar(timestamptz, integer, integer) FROM PUBLIC;
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Role dedicada do job
-- ─────────────────────────────────────────────────────────────────────────────
-- NOLOGIN: a role de login é criada fora das migrações, IN ROLE iris_retencao
-- (mesmo padrão de iris_arquivamento na 0080 e iris_escalonamento na 0049).
--
-- O job recebe EXECUTE em UMA função e SELECT em NENHUMA tabela. Uma credencial
-- de job vazada não lê nome de paciente, diário nem trilha. E ela NÃO recebe
-- EXECUTE em `app_purgar_paciente`: o job nunca purga — a política proíbe
-- eliminação automática silenciosa, e a função exigiria `app.user_role` e
-- `app.user_id`, que o job só satisfaria FORJANDO GUC, gravando um ator falso
-- em `audit_log` numa operação irreversível. Isso é afirmado por teste negativo
-- (`42501`), nunca presumido.
--
-- Role é objeto de CLUSTER, não de banco: o `CREATE ROLE` vai dentro de um
-- guard de existência para a migração ser reexecutável (e porque `pg_dump` não
-- carrega roles).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iris_retencao') THEN
    CREATE ROLE iris_retencao NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO iris_retencao;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_retencao_avisar(timestamptz, integer, integer) TO iris_retencao;
