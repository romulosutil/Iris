CREATE TABLE "job_heartbeat" (
	"job" text PRIMARY KEY NOT NULL,
	"ultimo_ok" timestamp with time zone,
	"ultimo_erro" timestamp with time zone,
	"detalhe" text
);
--> statement-breakpoint
-- ─── Parte à mão (#536, DA-03) — fronteira de acesso de `job_heartbeat` ───────
--
-- POR QUE FUNÇÃO SECURITY DEFINER, E NÃO GRANT NA TABELA (mesma lição da 0129):
-- a tabela cruza clínicas e é lida por uma credencial de infra (`iris_alarme`)
-- e escrita por cinco roles diferentes. RLS forçada SEM policy + zero GRANT de
-- tabela = nenhuma role toca a tabela direto; o que cada uma consegue fazer é
-- exatamente o que a função dela permite, e nada mais. Um GRANT de tabela numa
-- role sem policy devolveria ZERO LINHAS SEM ERRO — e um detector que lê
-- "nenhum heartbeat" para sempre é o pior dos alarmes (memória
-- `grant-sem-policy-nega-tudo-em-silencio`).
--
-- `detalhe` é truncado no banco a 200 caracteres: é defesa contra um chamador
-- que um dia passe uma `message` de erro de driver (que carrega SQL + params =
-- PHI). O helper (`scripts/lib/heartbeat.mjs`) já só manda contagens e
-- categoria; o teto aqui é o cinto para o caso de o helper não ser usado.
ALTER TABLE "job_heartbeat" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "job_heartbeat" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "job_heartbeat" FROM PUBLIC;
--> statement-breakpoint

-- Escrita: UPSERT por `job`. `p_ok = true` avança `ultimo_ok`; `false` avança
-- `ultimo_erro`. O outro carimbo fica como está — é a comparação entre os dois
-- que diz ao detector se a última passada deu certo.
--
-- MAPA job -> role DENTRO da função (revisão pós-PR #551): EXECUTE sozinho
-- deixaria qualquer role com o grant carimbar o heartbeat de QUALQUER job —
-- `app_role` (isto é, um SQL injection no app) gravaria `retencao` ok e
-- silenciaria o alarme do job de retenção. O chamador só grava o job da SUA
-- role; fora do mapa é P0001. Um job novo entra aqui (é migração, de
-- propósito: quem grava o quê é fronteira do banco, não configuração).
--
-- `session_user`, não `current_user`: dentro de SECURITY DEFINER o
-- `current_user` é a DONA da função (`iris`), e `pg_has_role` responderia
-- sim para tudo. `session_user` é quem fez login — a role de job (membro de
-- `iris_retencao`, `iris_arquivamento`, …) ou `iris_app` (membro de
-- `app_role`). Superusuário é membro implícito de toda role, então a dona
-- continua podendo chamar à mão para diagnóstico.
--
-- `p_job` ainda passa pela regex antes do mapa: o erro de nome fora do padrão
-- é diferente do erro "job válido, role errada", e os dois aparecem no log.
CREATE OR REPLACE FUNCTION public.app_job_heartbeat_gravar(p_job text, p_ok boolean, p_detalhe text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role_exigida text;
BEGIN
  IF p_job IS NULL OR p_job !~ '^[a-z][a-z0-9-]{0,39}$' THEN
    RAISE EXCEPTION 'job_heartbeat: nome de job inválido (esperado ^[a-z][a-z0-9-]{0,39}$)'
      USING ERRCODE = 'P0001';
  END IF;
  IF p_ok IS NULL THEN
    RAISE EXCEPTION 'job_heartbeat: p_ok não pode ser NULL' USING ERRCODE = 'P0001';
  END IF;

  v_role_exigida := CASE p_job
    WHEN 'retencao'          THEN 'iris_retencao'
    WHEN 'arquivamento'      THEN 'iris_arquivamento'
    WHEN 'escalonamento'     THEN 'iris_escalonamento'
    WHEN 'expurgo-audit-log' THEN 'iris_expurgo_audit_log'
    -- Rotas internas do app (billing, conciliar, exportacao-integral,
    -- asr-transcrever) e o asr-sweeper (ASR_SWEEPER_DATABASE_URL é membro
    -- de app_role).
    WHEN 'billing'           THEN 'app_role'
    WHEN 'conciliacao'       THEN 'app_role'
    WHEN 'exportacao'        THEN 'app_role'
    WHEN 'asr'               THEN 'app_role'
    WHEN 'asr-sweeper'       THEN 'app_role'
    ELSE NULL
  END;
  IF v_role_exigida IS NULL THEN
    RAISE EXCEPTION 'job_heartbeat: job "%" não está no mapa job->role da 0143', p_job
      USING ERRCODE = 'P0001';
  END IF;
  IF NOT pg_has_role(session_user, v_role_exigida, 'MEMBER') THEN
    RAISE EXCEPTION 'job_heartbeat: a role da sessão não pode gravar o heartbeat de "%" (exige membro de %)', p_job, v_role_exigida
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO job_heartbeat (job, ultimo_ok, ultimo_erro, detalhe)
  VALUES (
    p_job,
    CASE WHEN p_ok THEN now() ELSE NULL END,
    CASE WHEN p_ok THEN NULL ELSE now() END,
    left(coalesce(p_detalhe, ''), 200)
  )
  ON CONFLICT (job) DO UPDATE SET
    ultimo_ok   = CASE WHEN p_ok THEN now() ELSE job_heartbeat.ultimo_ok END,
    ultimo_erro = CASE WHEN p_ok THEN job_heartbeat.ultimo_erro ELSE now() END,
    detalhe     = left(coalesce(p_detalhe, ''), 200);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_job_heartbeat_gravar(text, boolean, text) FROM PUBLIC;
--> statement-breakpoint

-- Quem escreve (medido em 02/09/2026 lendo a env de cada script/rota):
--   app_role                — rotas internas do app (billing fechar-ciclos e
--                             conciliar, exportacao-integral, asr-transcrever:
--                             o trilho `.mjs` desses jobs é fetch-only, sem
--                             banco por desenho) e o asr-sweeper
--                             (`ASR_SWEEPER_DATABASE_URL` é membro de app_role).
--   iris_retencao           — scripts/retencao-aviso-previo.mjs
--   iris_arquivamento       — scripts/auto-arquivamento.mjs
--   iris_escalonamento      — scripts/escalonamento-risco.mjs
--   iris_expurgo_audit_log  — scripts/expurgo-audit-log.mjs (0142)
GRANT EXECUTE ON FUNCTION public.app_job_heartbeat_gravar(text, boolean, text) TO app_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_job_heartbeat_gravar(text, boolean, text) TO iris_retencao;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_job_heartbeat_gravar(text, boolean, text) TO iris_arquivamento;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_job_heartbeat_gravar(text, boolean, text) TO iris_escalonamento;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_job_heartbeat_gravar(text, boolean, text) TO iris_expurgo_audit_log;
--> statement-breakpoint

-- Leitura: só o detector de alarme. Devolve a tabela inteira — são poucas
-- linhas (uma por job) e nenhuma delas tem dado clínico.
CREATE OR REPLACE FUNCTION public.app_alarme_job_heartbeats()
RETURNS TABLE (job text, ultimo_ok timestamptz, ultimo_erro timestamptz, detalhe text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT job, ultimo_ok, ultimo_erro, detalhe FROM job_heartbeat ORDER BY job;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_alarme_job_heartbeats() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_alarme_job_heartbeats() TO iris_alarme;
