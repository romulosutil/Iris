-- #122 — Alerta de risco clínico. Spec: docs/agente/regra-alerta-risco.md,
-- destravada por #101 (desenho) + #110 (parecer duty-to-warn).
--
-- REGRA DE OURO (§4.2.1): nada aqui é capaz de endereçar destinatário externo à
-- clínica. Não há coluna de e-mail/telefone de família, contato de emergência,
-- SAMU, polícia ou Conselho Tutelar, e nenhuma função retorna destinatário fora
-- do tenant. Todo o fluxo encerra nos gestores da própria clínica.
--
-- NOMENCLATURA (parecer, pergunta 3): `prazo_minutos` são "prazos de notificação
-- e escalonamento interno do software" — NUNCA "SLA de atendimento de
-- emergência". Não há prazo legal brasileiro p/ resposta clínica a crise.
--> statement-breakpoint

-- ── Pré-requisitos no tenant (Fatia 4) ──────────────────────────────────────
-- Responsável técnico: destinatário do estágio 2. É usuário DA clínica.
ALTER TABLE clinic ADD COLUMN responsavel_tecnico_id uuid REFERENCES app_user(id);
--> statement-breakpoint
-- Protocolo de Emergência Interno DA PRÓPRIA CLÍNICA, exibido no estágio 2.
-- O Iris exibe o protocolo da clínica; nunca propõe conduta própria (R3-TC).
ALTER TABLE clinic ADD COLUMN protocolo_emergencia_interno text;
--> statement-breakpoint
-- Declaração da cláusula X.3 dos termos: quem declarou e quando (prova de
-- aceite, não booleano).
ALTER TABLE clinic ADD COLUMN protocolo_emergencia_declarado_em timestamptz;
--> statement-breakpoint
ALTER TABLE clinic ADD COLUMN protocolo_emergencia_declarado_por uuid REFERENCES app_user(id);
--> statement-breakpoint

-- ── Trilha de ação automática ───────────────────────────────────────────────
-- O escalonamento (§4.2.1, ação 4) exige log IMUTÁVEL, e `audit_log` é o log
-- imutável do projeto. Mas o job não tem ator humano: ninguém escalou, o prazo
-- venceu. Com `ator_id` NOT NULL a única saída seria atribuir a ação a alguém
-- que não a praticou — numa trilha cuja função é ser prova, e num registro que
-- é justamente sobre responsabilização. DDL relaxante e reversível enquanto não
-- houver linha nula; nenhuma linha existente é reescrita.
-- SEMÂNTICA: `ator_id IS NULL` = ação automática do sistema, sem humano.
ALTER TABLE audit_log ALTER COLUMN ator_id DROP NOT NULL;
--> statement-breakpoint
COMMENT ON COLUMN audit_log.ator_id IS
  'Usuário que praticou a ação. NULL = ação automática do sistema (ex.: motor de escalonamento de alerta de risco, #122) — nenhum humano agiu.';
--> statement-breakpoint

-- ── Enums ───────────────────────────────────────────────────────────────────
CREATE TYPE alerta_risco_categoria AS ENUM (
  'ideacao_suicida', 'autolesao', 'violencia_sofrida',
  'violencia_praticada', 'risco_a_terceiro'
);
--> statement-breakpoint
CREATE TYPE alerta_risco_severidade AS ENUM (
  'ideacao_passiva', 'ideacao_ativa_sem_plano', 'ideacao_ativa_com_plano',
  'autolesao_recente', 'tentativa_relatada',
  'violencia_sofrida', 'violencia_praticada', 'risco_a_terceiro'
);
--> statement-breakpoint
CREATE TYPE alerta_risco_certeza AS ENUM ('explicito', 'ambiguo_citado');
--> statement-breakpoint
CREATE TYPE alerta_risco_status AS ENUM (
  'aberto', 'reconhecido', 'escalado_estagio_1',
  -- 2º prazo vencido = saturação INTERNA da clínica (§4.2.1, Opção B do
  -- parecer): banner clínica-wide + responsável técnico + protocolo interno +
  -- log imutável. Não existe canal externo em nenhum estágio.
  'escalado_estagio_2',
  'resolvido', 'descartado'
);
--> statement-breakpoint

-- ── Tabela ──────────────────────────────────────────────────────────────────
-- Fila DEDICADA, paralela a `alerta` e não filha dela (§3.2): risco é evento
-- pontual (cada menção em cada sessão é uma linha), não sinal persistente com
-- dedupe por chave natural.
CREATE TABLE alerta_risco_clinico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinic(id),

  -- NOT NULL *enquanto o alerta vive* — garantido pelo CHECK
  -- `alerta_risco_vinculo`, não pela coluna. A nulidade existe só para o expurgo
  -- LGPD (H2): o erasure DELETA `patient`/`session` e este registro
  -- PSEUDONIMIZA em vez de morrer junto. Mesmo mecanismo do
  -- `audit_log.patient_id` em `app_purgar_paciente` (0045).
  patient_id uuid,
  session_id uuid REFERENCES session(id),

  categoria   alerta_risco_categoria  NOT NULL,
  severidade  alerta_risco_severidade NOT NULL,
  certeza     alerta_risco_certeza    NOT NULL,
  trecho_fonte text NOT NULL,  -- citação literal do diário, nunca parafraseada
  detalhe      text NOT NULL,  -- descrição do agente, sem juízo de gravidade

  status alerta_risco_status NOT NULL DEFAULT 'aberto',

  -- auditoria de ENVIO (o que de fato disparou), não decisão. Registra também
  -- canal INDISPONÍVEL: canal que falha em silêncio é o modo de falha da #108.
  canais_notificados jsonb NOT NULL DEFAULT '[]'::jsonb,

  prazo_minutos integer NOT NULL,
  prazo_reconhecimento timestamptz NOT NULL,

  reconhecido_por uuid REFERENCES app_user(id),
  reconhecido_em  timestamptz,

  escalado_em            timestamptz,  -- estágio 1
  escalado_estagio_2_em  timestamptz,

  conduta_registrada text,  -- preenchido em resolver (texto livre: o produto
                            -- nunca prescreve conduta, então nunca é enum)
  motivo_descarte    text,  -- preenchido em descartar (obrigatório, §8/ARC-3)

  pseudonimizado_em timestamptz,  -- marca de expurgo LGPD (H2)

  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES app_user(id),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),

  deletado_em timestamptz,  -- paridade RLS; NUNCA usado para expurgo (H2)

  -- anti-IDOR em nível de banco (FK composta, padrão Agenda 2.0). RESTRICT e
  -- não CASCADE de propósito: cascade deletaria a linha inteira no expurgo, o
  -- oposto exato da decisão H2. `app_purgar_paciente` nula a FK antes do DELETE.
  CONSTRAINT alerta_risco_patient_fk FOREIGN KEY (patient_id, clinic_id)
    REFERENCES patient(id, clinic_id) ON DELETE RESTRICT,

  -- Invariante da §7 preservada onde importa: todo alerta VIVO tem paciente e
  -- sessão. Só o expurgo solta esses vínculos, e apenas marcando
  -- `pseudonimizado_em` — não há caminho para linha órfã silenciosa.
  CONSTRAINT alerta_risco_vinculo CHECK (
    (pseudonimizado_em IS NULL AND patient_id IS NOT NULL AND session_id IS NOT NULL)
    OR (pseudonimizado_em IS NOT NULL AND patient_id IS NULL AND session_id IS NULL)
  ),

  -- descarte nunca silencioso (§8/ARC-3); resolver exige conduta registrada.
  CONSTRAINT alerta_risco_terminal CHECK (
    (status <> 'descartado' OR motivo_descarte IS NOT NULL)
    AND (status <> 'resolvido' OR conduta_registrada IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE INDEX idx_alerta_risco_fila ON alerta_risco_clinico (clinic_id, status)
  WHERE deletado_em IS NULL;
--> statement-breakpoint
-- serve o job de escalonamento (H1): status IN ('aberto','escalado_estagio_1')
-- AND prazo_reconhecimento < now().
CREATE INDEX idx_alerta_risco_sla ON alerta_risco_clinico (status, prazo_reconhecimento);
--> statement-breakpoint

-- ── Prazos por severidade (§4.1) — fonte única, no banco ────────────────────
-- IMMUTABLE + pura: é a mesma tabela da spec, e resolver isto no cliente
-- permitiria forjar um prazo de 4h para uma tentativa relatada.
-- `certeza` é parâmetro de propósito, para tornar EXPLÍCITO no código que ela
-- NÃO relaxa o prazo (§4.1, última linha) — a ambiguidade só afeta apresentação.
CREATE OR REPLACE FUNCTION app_prazo_risco_minutos(
  p_severidade alerta_risco_severidade,
  p_certeza    alerta_risco_certeza
) RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_severidade
    WHEN 'ideacao_ativa_com_plano' THEN 15
    WHEN 'tentativa_relatada'      THEN 15
    WHEN 'ideacao_ativa_sem_plano' THEN 60
    WHEN 'autolesao_recente'       THEN 60
    ELSE 240
  END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_prazo_risco_minutos(alerta_risco_severidade, alerta_risco_certeza) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_prazo_risco_minutos(alerta_risco_severidade, alerta_risco_certeza) TO app_role;
--> statement-breakpoint

-- ── Visibilidade ────────────────────────────────────────────────────────────
-- Coordenador vê toda a clínica; terapeuta vê o que é da sua equipe de cuidado
-- OU o que nasceu de uma sessão sua (o alerta segue a sessão — H4).
-- Linha pseudonimizada (pós-expurgo) perde o vínculo com paciente e por isso só
-- é legível pelo coordenador do tenant: ela sobrevive para continuidade de
-- auditoria e defesa profissional, não para leitura clínica.
CREATE OR REPLACE FUNCTION app_alerta_risco_visivel(p_alerta uuid) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM alerta_risco_clinico a
    WHERE a.id = p_alerta
      AND a.deletado_em IS NULL
      AND a.clinic_id = current_setting('app.clinic_id')::uuid
      AND (
        (a.pseudonimizado_em IS NOT NULL AND current_setting('app.user_role') = 'coordenador')
        OR (a.pseudonimizado_em IS NULL
            AND app_patient_in_clinic(a.patient_id)
            AND (current_setting('app.user_role') = 'coordenador'
                 OR app_is_on_team(a.patient_id)
                 OR app_session_terapeuta_id(a.session_id) = current_setting('app.user_id')::uuid))
      )
  );
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_alerta_risco_visivel(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_alerta_risco_visivel(uuid) TO app_role;
--> statement-breakpoint

-- Grant explícito: o GRANT ON ALL TABLES de 0001 é point-in-time, tabela nova
-- não herda. Sem DELETE (soft-delete via UPDATE) e — de propósito — SEM INSERT:
-- criar alerta de risco é privilégio do caminho do agente, via a função
-- SECURITY DEFINER abaixo. Um INSERT direto permitiria forjar severidade e
-- prazo a partir do cliente.
GRANT SELECT, UPDATE ON alerta_risco_clinico TO app_role;
--> statement-breakpoint
ALTER TABLE alerta_risco_clinico ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE alerta_risco_clinico FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY alerta_risco_scope ON alerta_risco_clinico FOR ALL TO app_role
  USING (
    deletado_em IS NULL
    AND clinic_id = current_setting('app.clinic_id')::uuid
    AND (
      (pseudonimizado_em IS NOT NULL AND current_setting('app.user_role') = 'coordenador')
      OR (pseudonimizado_em IS NULL
          AND app_patient_in_clinic(patient_id)
          AND (current_setting('app.user_role') = 'coordenador'
               OR app_is_on_team(patient_id)
               OR app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid))
    )
  )
  WITH CHECK (
    -- app_role nunca escreve linha pseudonimizada nem pseudonimiza: isso é
    -- exclusividade do expurgo (SECURITY DEFINER do owner).
    pseudonimizado_em IS NULL
    AND clinic_id = current_setting('app.clinic_id')::uuid
    AND app_patient_in_clinic(patient_id)
    AND (current_setting('app.user_role') = 'coordenador'
         OR app_is_on_team(patient_id)
         OR app_session_terapeuta_id(session_id) = current_setting('app.user_id')::uuid)
  );
--> statement-breakpoint

-- ── Criação (caminho do agente) ─────────────────────────────────────────────
-- SECURITY DEFINER porque app_role não tem INSERT. Guard interno espelha o
-- predicado da leitura (mesma lição da migração 0048): confere que paciente e
-- sessão pertencem ao tenant corrente e que a sessão é do paciente — a função
-- não confia em nenhum dos UUIDs recebidos.
-- O prazo é resolvido AQUI, nunca recebido do chamador.
CREATE OR REPLACE FUNCTION app_criar_alerta_risco(
  p_patient    uuid,
  p_session    uuid,
  p_categoria  alerta_risco_categoria,
  p_severidade alerta_risco_severidade,
  p_certeza    alerta_risco_certeza,
  p_trecho     text,
  p_detalhe    text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_criar_alerta_risco(uuid, uuid, alerta_risco_categoria, alerta_risco_severidade, alerta_risco_certeza, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_criar_alerta_risco(uuid, uuid, alerta_risco_categoria, alerta_risco_severidade, alerta_risco_certeza, text, text) TO app_role;
--> statement-breakpoint

-- ── Motor de escalonamento (H1) ─────────────────────────────────────────────
-- Role dedicada do job. NOLOGIN: a role de login é criada fora das migrações,
-- IN ROLE iris_escalonamento (mesmo padrão de app_role/iris_app). O job NÃO
-- recebe SELECT em nenhuma tabela — só EXECUTE na função abaixo. Assim uma
-- credencial de job vazada não lê diário, paciente nem trecho de risco.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iris_escalonamento') THEN
    CREATE ROLE iris_escalonamento NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
--> statement-breakpoint
-- Varredura cross-tenant. Dois estágios DISCRETOS (§4.3), nunca escalonamento
-- contínuo: alarme perpétuo produz a mesma fadiga que a §2 combate.
--   aberto            + prazo vencido        → escalado_estagio_1
--   escalado_estagio_1 + 2×prazo vencido     → escalado_estagio_2
-- Retorna as linhas afetadas para o job registrar/notificar. Não devolve
-- trecho_fonte nem nome de paciente: o job só precisa saber A QUEM notificar
-- dentro do tenant, e push sem conteúdo clínico é requisito (H3).
-- LANGUAGE sql (não plpgsql) de propósito: os nomes das colunas de saída
-- colidiriam com as colunas da tabela na resolução de identificadores do
-- plpgsql, e uma CTE data-modifying já roda sempre até o fim em SQL puro.
CREATE OR REPLACE FUNCTION app_escalonar_risco_vencidos()
RETURNS TABLE (
  out_alerta_id     uuid,
  out_clinic_id     uuid,
  out_estagio       smallint,
  out_prazo_minutos integer,
  out_severidade    alerta_risco_severidade
) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH e2 AS (
    UPDATE alerta_risco_clinico a
       SET status = 'escalado_estagio_2',
           escalado_estagio_2_em = now(),
           atualizado_em = now(),
           canais_notificados = a.canais_notificados
             || jsonb_build_array('banner_clinica_wide', 'responsavel_tecnico', 'protocolo_emergencia_interno')
     WHERE a.status = 'escalado_estagio_1'
       AND a.deletado_em IS NULL
       AND now() >= a.prazo_reconhecimento + make_interval(mins => a.prazo_minutos)
    RETURNING a.id, a.clinic_id, 2::smallint AS estagio, a.prazo_minutos, a.severidade
  ), e1 AS (
    UPDATE alerta_risco_clinico a
       SET status = 'escalado_estagio_1',
           escalado_em = now(),
           atualizado_em = now(),
           canais_notificados = a.canais_notificados
             || jsonb_build_array('todos_coordenadores_clinica')
     WHERE a.status = 'aberto'
       AND a.deletado_em IS NULL
       AND now() >= a.prazo_reconhecimento
    RETURNING a.id, a.clinic_id, 1::smallint AS estagio, a.prazo_minutos, a.severidade
  ), todos AS (
    SELECT * FROM e1 UNION ALL SELECT * FROM e2
  ), trilha AS (
    -- log imutável (§4.2.1, ação 4). `audit_log` é imutável para app_role; esta
    -- função roda como owner, o único caminho autorizado a escrever aqui sem
    -- contexto de tenant. CTE data-modifying roda sempre até o fim, mesmo sem
    -- ser referenciada pela query principal.
    INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
    SELECT t.clinic_id, NULL, 'alerta_risco_escalado', 'alerta_risco_clinico', t.id, NULL,
           jsonb_build_object('estagio', t.estagio, 'prazo_minutos', t.prazo_minutos,
                              'motivo', 'nao reconhecido pela equipe clinica no prazo')
      FROM todos t
    RETURNING 1
  )
  SELECT t.id, t.clinic_id, t.estagio, t.prazo_minutos, t.severidade FROM todos t;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_escalonar_risco_vencidos() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_escalonar_risco_vencidos() TO iris_escalonamento;
--> statement-breakpoint

-- Banner clínica-wide do estágio 2 (§4.2.1, ação 1): TODOS os usuários logados
-- da clínica, não só coordenadores. Devolve só a contagem — sem nome de
-- paciente e sem categoria, porque quem vê o banner pode não ter acesso clínico
-- ao caso (H3 aplicado à tela, não só ao push).
CREATE OR REPLACE FUNCTION app_risco_estagio2_ativo() RETURNS integer
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT count(*)::integer FROM alerta_risco_clinico a
   WHERE a.clinic_id = current_setting('app.clinic_id')::uuid
     AND a.status = 'escalado_estagio_2'
     AND a.deletado_em IS NULL;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_risco_estagio2_ativo() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_risco_estagio2_ativo() TO app_role;
--> statement-breakpoint

-- ── Expurgo LGPD (H2 / Fatia 5) ─────────────────────────────────────────────
-- `app_purgar_paciente` reescrita por inteiro (CREATE OR REPLACE, padrão de
-- 0048). Única mudança funcional: `alerta_risco_clinico` é PSEUDONIMIZADA, não
-- deletada. Um registro de risco tem funções que sobrevivem ao pedido de
-- erasure do paciente — continuidade de cuidado e defesa profissional do
-- terapeuta (prova de diligência). Preserva categoria/severidade/certeza/status
-- e todos os carimbos de prazo, reconhecimento e escalonamento; apaga os
-- campos de texto livre, que são onde a PII pode residir.
CREATE OR REPLACE FUNCTION app_purgar_paciente(p_patient uuid, p_motivo text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clinic uuid;
BEGIN
  IF current_setting('app.user_role') <> 'coordenador' THEN
    RAISE EXCEPTION 'app_purgar_paciente: só coordenador purga (papel atual %)', current_setting('app.user_role');
  END IF;
  SELECT clinic_id INTO v_clinic FROM patient WHERE id = p_patient;
  IF v_clinic IS NULL OR NOT app_patient_in_clinic(p_patient) THEN
    RAISE EXCEPTION 'app_purgar_paciente: paciente inexistente ou sem permissão';
  END IF;

  -- 1) trilha PRIMEIRO — linha-fato já pseudônima.
  INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
  VALUES (v_clinic, current_setting('app.user_id')::uuid, 'paciente_purgado', 'patient', p_patient, NULL,
          jsonb_build_object('motivo', p_motivo, 'pseudonimizado', true));

  -- 2) pseudonimiza a trilha histórica do sujeito.
  UPDATE audit_log
     SET patient_id = NULL,
         detalhe = jsonb_build_object('pseudonimizado', true, 'motivo_expurgo', p_motivo)
   WHERE patient_id = p_patient;

  -- 2b) pseudonimiza os alertas de risco (H2) — ANTES dos DELETEs, porque é
  --     isto que solta as FKs para `patient` e `session` e destrava o erasure.
  --     Textos livres sobrescritos por inteiro, mesma justificativa do
  --     `detalhe` do audit_log: em erasure, over-remoção não gera breach,
  --     under-remoção sim.
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
REVOKE ALL ON FUNCTION app_purgar_paciente(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_purgar_paciente(uuid, text) TO app_role;
