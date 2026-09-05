ALTER TABLE "audio_capture" ADD COLUMN "mime_type" text;--> statement-breakpoint
ALTER TABLE "audio_capture" ADD COLUMN "falhou_em" timestamp with time zone;--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- D71 + janela de resgate do áudio clínico (#494)
--
-- DDL escrito à mão (grants e funções não são modelados pelo Drizzle —
-- CLAUDE.md §Migrações, regra 1). As DUAS colunas acima vieram do
-- `db:generate`; deste ponto em diante nada toca o snapshot.
--
-- O QUE MUDA, E POR QUÊ:
--
-- 1. `mime_type` passa a viajar da gravação até o `Content-Type` do POST de
--    transcrição (D71). Hoje o header é fixo em `audio/webm`, errado para
--    clipe de iOS/Safari (`audio/mp4` AAC). Inerte enquanto `servidor.py`
--    detecta o formato por magic bytes; quebra em silêncio no dia em que o
--    serviço olhar o header ou a extensão do arquivo temporário.
--
-- 2. FALHA DE IA DEIXA DE APAGAR ÁUDIO CLÍNICO. `app_asr_falhar` zerava
--    `objeto_ref` no teto de 3 tentativas; sem a referência,
--    `app_asr_objetos_em_uso` deixava de reivindicar a chave e o `finally` do
--    worker chamava `apagar()` — o áudio sumia do MinIO na hora. A UI só sabe
--    reenviar a partir do blob LOCAL (IndexedDB, TTL 24 h); passado isso, a
--    única saída oferecida à terapeuta era digitar o trecho à mão.
--
--    O conserto NÃO é só parar de zerar: o bucket de ASR é efêmero por design
--    (R11), sem retenção nem expurgo LGPD. Referência eterna faria
--    `app_asr_objetos_em_uso` responder "em uso" para sempre e o áudio ficaria
--    indefinidamente fora de qualquer wiring de expurgo — o mesmo laço que o
--    contador `reversoes` fechou em T19. Então: janela de resgate COM expurgo
--    explícito no fim dela (`app_asr_expirar_resgate`).
-- ─────────────────────────────────────────────────────────────────────────────

-- Grant de COLUNA, não de tabela: `audio_capture` tem `UPDATE` revogado por
-- tabela e concedido coluna a coluna (`0006`, `0135`). Sem isto a promoção a
-- `na_fila` que grava o mime falha com `permission denied for table
-- audio_capture` — e o erro aponta a TABELA, não a coluna que falta.
--
-- `falhou_em` entra porque o resgate (ação da terapeuta, sob RLS do tenant)
-- limpa o carimbo ao devolver o clipe à fila. O pior que `app_role` consegue
-- fazer com ela é ESTENDER a janela das próprias linhas — direção segura: o
-- efeito é preservar áudio por mais tempo, nunca apagar antes.
GRANT UPDATE (mime_type, falhou_em) ON audio_capture TO app_role;
--> statement-breakpoint

-- `DROP`+`CREATE`, não `CREATE OR REPLACE`: muda o RETURNS TABLE (ganha
-- `mime_type`), e o Postgres recusa trocar o tipo de retorno num replace.
DROP FUNCTION IF EXISTS public.app_asr_reservar(integer);
--> statement-breakpoint

CREATE FUNCTION public.app_asr_reservar(p_limite integer)
RETURNS TABLE (
  id         uuid,
  clinic_id  uuid,
  objeto_ref text,
  lote_id    uuid,
  ordem      integer,
  mime_type  text
)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE audio_capture AS a
     SET asr_status = 'transcrevendo',
         tentativas = a.tentativas + 1
   WHERE a.id IN (
     SELECT c.id
       FROM audio_capture AS c
      WHERE c.asr_status = 'na_fila'
        AND c.tentativas < 3
        AND c.objeto_ref IS NOT NULL
      ORDER BY c.criado_em ASC
      LIMIT p_limite
        FOR UPDATE SKIP LOCKED
   )
  RETURNING a.id, a.clinic_id, a.objeto_ref, a.lote_id, a.ordem, a.mime_type;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_asr_reservar(integer) FROM PUBLIC;
--> statement-breakpoint
-- `app_role` NÃO recebe: os definers cross-tenant saíram de `app_role` na
-- `0140` (T18). Só o papel do worker executa.
GRANT EXECUTE ON FUNCTION public.app_asr_reservar(integer) TO iris_asr_worker;
--> statement-breakpoint

-- Desfecho definitivo agora PRESERVA `objeto_ref` e carimba `falhou_em`.
--
-- CORPO REBASEADO SOBRE A `0141`, NAO SOBRE A `0136`. `CREATE OR REPLACE`
-- substitui a funcao INTEIRA: partir do corpo da `0136` (o arquivo onde a
-- funcao nasceu) apagaria em silencio o TETO DE REVERSOES que a `0141`
-- acrescentou, e a fila voltaria a nunca drenar sob 503 sustentado. O `git
-- log` da `0136` descreve corpo morto — memoria
-- `create-or-replace-torna-diff-enganoso`. O unico delta desta migracao sobre
-- a `0141` esta no UPDATE final.
CREATE OR REPLACE FUNCTION public.app_asr_falhar(
  p_id uuid,
  p_reverter_tentativa boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_afetadas  integer;
  v_reversoes integer;
  c_teto CONSTANT integer := 10;
BEGIN
  IF p_reverter_tentativa THEN
    -- `FOR UPDATE` porque a decisao (reverter ou nao) e lida antes da escrita:
    -- sem o lock, dois `falhar(true)` concorrentes sobre o mesmo clipe leriam
    -- o mesmo `reversoes` e os dois reverteriam.
    SELECT reversoes INTO v_reversoes
      FROM audio_capture
     WHERE id = p_id
       AND asr_status = 'transcrevendo'
       FOR UPDATE;

    IF v_reversoes IS NOT NULL AND v_reversoes < c_teto THEN
      UPDATE audio_capture
         SET asr_status = 'na_fila',
             tentativas = greatest(tentativas - 1, 0),
             reversoes  = reversoes + 1
       WHERE id = p_id
         AND asr_status = 'transcrevendo';

      GET DIAGNOSTICS v_afetadas = ROW_COUNT;
      RETURN v_afetadas;
    END IF;

    -- Teto estourado (ou linha fora de `transcrevendo`): cai de proposito no
    -- caminho normal abaixo, para a fila ter fim sob saturacao sustentada.
  END IF;

  UPDATE audio_capture
     SET asr_status = CASE WHEN tentativas >= 3 THEN 'falhou'::asr_status
                           ELSE 'na_fila'::asr_status END,
         -- UNICO DELTA SOBRE A `0141`: `objeto_ref` NAO e mais zerado aqui
         -- (era `CASE WHEN tentativas >= 3 THEN NULL ELSE objeto_ref END`).
         -- Quem solta a referencia agora e `app_asr_expirar_resgate`, no fim
         -- da janela de resgate — nao a falha da IA, no mesmo tick.
         falhou_em  = CASE WHEN tentativas >= 3 THEN now()
                           ELSE falhou_em END
   WHERE id = p_id
     AND asr_status = 'transcrevendo';

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas;
END; $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_asr_falhar(uuid, boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_asr_falhar(uuid, boolean) TO iris_asr_worker;
--> statement-breakpoint

-- Backstop de idade da LINHA (`0141`): mesma mudança. Uma linha presa 6h em
-- `na_fila`/`transcrevendo` é justamente o caso em que o clipe NUNCA foi
-- transcrito — condená-la a perder o áudio seria punir o clipe por uma falha
-- de infraestrutura. Ela também entra na janela de resgate.
CREATE OR REPLACE FUNCTION public.app_asr_expirar_presos(p_idade interval)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_afetadas integer;
BEGIN
  UPDATE audio_capture
     SET asr_status = 'falhou'::asr_status,
         falhou_em  = now()
   WHERE asr_status IN ('na_fila', 'transcrevendo')
     AND criado_em <= now() - p_idade;

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas;
END; $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_asr_expirar_presos(interval) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_asr_expirar_presos(interval) TO iris_asr_worker;
--> statement-breakpoint

-- A sobrecarga de 1 argumento e DERRUBADA, nao mantida ao lado da nova.
-- Mante-la seria manter viva a versao que responde "nao esta em uso" para um
-- clipe em resgate — e e exatamente ela que o sweeper (e o `finally` do
-- worker) chamariam por engano, apagando o audio que esta migracao existe
-- para preservar. Assinatura antiga ausente e o que torna o erro impossivel,
-- em vez de improvavel.
DROP FUNCTION IF EXISTS public.app_asr_objetos_em_uso(text[]);
--> statement-breakpoint

-- Costura UNICA que decide se o objeto pode ser apagado — consultada pelos
-- DOIS consumidores (o `finally` do worker e o sweeper de orfaos). Ensinar a
-- janela aqui cobre os dois sem tocar no laco de nenhum deles.
CREATE FUNCTION public.app_asr_objetos_em_uso(p_refs text[], p_janela interval)
RETURNS TABLE (ref text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT a.objeto_ref
    FROM audio_capture AS a
   WHERE a.objeto_ref = ANY(p_refs)
     AND (
       a.asr_status IN ('na_fila', 'transcrevendo')
       OR (a.asr_status = 'falhou'
           AND a.falhou_em IS NOT NULL
           AND a.falhou_em > now() - p_janela)
     );
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_asr_objetos_em_uso(text[], interval) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_asr_objetos_em_uso(text[], interval) TO app_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_asr_objetos_em_uso(text[], interval) TO iris_asr_worker;
--> statement-breakpoint

-- EXPURGO EXPLICITO — a metade que torna a janela uma janela, e nao retencao
-- eterna. Zera `objeto_ref` das linhas cujo resgate venceu: so entao elas
-- deixam de reivindicar a chave, e so entao o sweeper de orfaos volta a
-- alcancar o objeto. Sem esta funcao, preservar o audio viraria guarda-lo
-- para sempre num bucket que nao tem retencao nem expurgo LGPD.
--
-- `asr_status` NAO muda: `falhou` ja e o estado terminal correto. O que muda
-- e so a posse do objeto.
--
-- Parametro (nao constante) pelo mesmo motivo de `app_asr_expirar_presos`: o
-- runbook precisa poder investigar com outra regua sem migracao nova.
CREATE OR REPLACE FUNCTION public.app_asr_expirar_resgate(p_janela interval)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_afetadas integer;
BEGIN
  UPDATE audio_capture
     SET objeto_ref = NULL
   WHERE asr_status = 'falhou'
     AND objeto_ref IS NOT NULL
     AND falhou_em IS NOT NULL
     AND falhou_em <= now() - p_janela;

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas;
END; $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_asr_expirar_resgate(interval) FROM PUBLIC;
--> statement-breakpoint
-- So o worker: e mutacao em massa cross-tenant, a superficie mais perigosa
-- deste arquivo. Nasce fora de `app_role`, como `app_asr_expirar_presos`.
GRANT EXECUTE ON FUNCTION public.app_asr_expirar_resgate(interval) TO iris_asr_worker;
