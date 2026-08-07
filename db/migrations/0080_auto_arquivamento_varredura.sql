-- #174 (débito D4) — VARREDURA de auto-arquivamento por inatividade.
--
-- Por que no banco e não no TypeScript: a decisão tira paciente da contagem da
-- fatura, e a régua tem que valer para TODAS as clínicas numa passada só. Um
-- job sem tenant não passa por `withTenant`, logo não existe GUC
-- `app.clinic_id` para uma policy avaliar — daí SECURITY DEFINER, mesmo idioma
-- de `app_escalonar_risco_vencidos()` (0049) e `billing_apurar_ciclo` (0071).
-- Como a função NÃO recebe `clinic_id` em nenhuma hipótese (o tenant sai
-- sempre da própria linha de `patient`), não existe caminho para forjar tenant
-- chamando-a.
--
-- Por que ESTES sinais de "última atividade": são exatamente os que
-- `billing_apurar_ciclo` (0071) usa para "interação no ciclo". Se a régua de
-- arquivamento divergisse, o Iris arquivaria um paciente que a clínica ainda
-- está pagando — ou o contrário. A definição é uma só, de propósito.
--
-- Por que dias CIVIS e não `age()`/divisão de intervalo: espelha
-- `diasCivisEntre` de `src/lib/jobs/auto-arquivamento.ts`. Aritmética crua faz
-- o resultado depender da HORA do dia, e a varredura da manhã veria 82 onde a
-- da tarde vê 83. Truncar cada instante para a data UTC antes de subtrair
-- torna a régua invariante por hora do dia — e idêntica à regra pura em TS.
--
-- O aviso é IN-APP e só isso (uma linha em `audit_log` que a faixa da clínica
-- lê). Nada de e-mail/SMS: arquivamento é ato administrativo sobre cobrança,
-- não evento clínico.
--
-- Arquivar NUNCA dá alta (regra 3 da issue): `alta_em` não é tocado aqui. O
-- caminho inverso (alta arquiva) já existe como trigger na 0065.
--> statement-breakpoint

-- Role dedicada do job. NOLOGIN: a role de login é criada fora das migrações,
-- IN ROLE iris_arquivamento (mesmo padrão de iris_escalonamento na 0049). O
-- job NÃO recebe SELECT em nenhuma tabela — só EXECUTE na função abaixo. Uma
-- credencial de job vazada não lê nome de paciente, diário nem trilha.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iris_arquivamento') THEN
    CREATE ROLE iris_arquivamento NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_auto_arquivar_pacientes(
  p_agora timestamptz DEFAULT now(),
  p_dias_aviso integer DEFAULT 83,
  p_dias_arquivamento integer DEFAULT 90
) RETURNS TABLE (avisados integer, arquivados integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_avisados integer;
  v_arquivados integer;
BEGIN
  -- ── 1. ARQUIVAMENTO (dias >= p_dias_arquivamento) ────────────────────────
  -- Roda ANTES do aviso: quem cruza o corte é arquivado, não avisado.
  --
  -- `dias` pode ficar NEGATIVO quando o paciente tem sessão AGENDADA PARA O
  -- FUTURO — e isso está CERTO: paciente com consulta marcada está ativo, e um
  -- número negativo nunca satisfaz nenhum dos dois limiares. Não "consertar"
  -- com GREATEST(0, …): isso transformaria agendamento futuro em inatividade
  -- de zero dias, que é a mesma coisa que atividade de hoje só por acidente.
  WITH base AS (
    SELECT p.id,
           p.clinic_id,
           GREATEST(
             p.criado_em,
             (SELECT max(GREATEST(s.agendada_para, s.check_in_em, s.criado_em))
                FROM session s WHERE s.patient_id = p.id),
             (SELECT max(e.aprovado_em)
                FROM evidence e WHERE e.patient_id = p.id),
             (SELECT max(sn.criado_em)
                FROM session_note sn
                JOIN session s2 ON s2.id = sn.session_id
               WHERE s2.patient_id = p.id)
           ) AS ultima_atividade
      FROM patient p
     WHERE p.arquivado_em IS NULL
  ), calc AS (
    SELECT b.*,
           ((p_agora AT TIME ZONE 'UTC')::date
            - (b.ultima_atividade AT TIME ZONE 'UTC')::date) AS dias
      FROM base b
  ), alvo AS (
    SELECT c.* FROM calc c WHERE c.dias >= p_dias_arquivamento
  ), upd AS (
    UPDATE patient p SET arquivado_em = p_agora
     WHERE p.id IN (SELECT a.id FROM alvo a)
    RETURNING p.id
  ), ins AS (
    INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id,
                           patient_id, detalhe, criado_em)
    SELECT a.clinic_id,
           NULL,  -- ator_id nulo = ação automática do sistema (nullable na 0049)
           'paciente_arquivado_automaticamente', 'patient', a.id, a.id,
           jsonb_build_object('origem', 'job', 'dias_sem_atividade', a.dias),
           p_agora
      FROM alvo a
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_arquivados FROM ins;

  -- ── 2. AVISO PRÉVIO (p_dias_aviso <= dias < p_dias_arquivamento) ─────────
  -- Janela FECHADA em cima: passado o corte quem age é o arquivamento. Sem
  -- esse limite superior o job avisaria de novo a cada varredura.
  --
  -- Dedup ancorado na ÚLTIMA ATIVIDADE, não em "existe algum aviso": atividade
  -- nova reinicia o relógio, então um aviso posterior a ela é legítimo. Como
  -- `audit_log` é append-only e imutável para app_role, aviso duplicado é lixo
  -- que ninguém pode apagar depois.
  --
  -- Os pacientes arquivados no passo 1 já saíram daqui: `arquivado_em IS NULL`
  -- é reavaliado nesta segunda consulta, dentro da mesma transação.
  WITH base AS (
    SELECT p.id,
           p.clinic_id,
           GREATEST(
             p.criado_em,
             (SELECT max(GREATEST(s.agendada_para, s.check_in_em, s.criado_em))
                FROM session s WHERE s.patient_id = p.id),
             (SELECT max(e.aprovado_em)
                FROM evidence e WHERE e.patient_id = p.id),
             (SELECT max(sn.criado_em)
                FROM session_note sn
                JOIN session s2 ON s2.id = sn.session_id
               WHERE s2.patient_id = p.id)
           ) AS ultima_atividade
      FROM patient p
     WHERE p.arquivado_em IS NULL
  ), calc AS (
    SELECT b.*,
           ((p_agora AT TIME ZONE 'UTC')::date
            - (b.ultima_atividade AT TIME ZONE 'UTC')::date) AS dias
      FROM base b
  ), alvo AS (
    SELECT c.* FROM calc c
     WHERE c.dias >= p_dias_aviso
       AND c.dias <  p_dias_arquivamento
       AND NOT EXISTS (
         SELECT 1 FROM audit_log al
          WHERE al.acao = 'arquivamento_aviso_previo'
            AND al.entidade_id = c.id
            AND al.criado_em > c.ultima_atividade
       )
  ), ins AS (
    INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id,
                           patient_id, detalhe, criado_em)
    SELECT a.clinic_id,
           NULL,
           'arquivamento_aviso_previo', 'patient', a.id, a.id,
           jsonb_build_object('origem', 'job',
                              'dias_sem_atividade', a.dias,
                              'arquiva_em_dias', p_dias_arquivamento - a.dias),
           p_agora
      FROM alvo a
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_avisados FROM ins;

  avisados := v_avisados;
  arquivados := v_arquivados;
  RETURN NEXT;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_auto_arquivar_pacientes(timestamptz, integer, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_auto_arquivar_pacientes(timestamptz, integer, integer) TO iris_arquivamento;
