-- Issue #72 / revisão final de integração — predicado ÚNICO de "este objeto
-- efêmero ainda está em uso".
--
-- POR QUE EXISTE: dois consumidores apagam objetos do bucket efêmero e os dois
-- estavam decidindo isso SEM perguntar ao banco:
--
--  1. o worker (`src/app/api/internal/jobs/asr-transcrever/route.ts`, T07)
--     apagava o objeto no `finally` nos três desfechos — inclusive nos dois em
--     que `app_asr_falhar` devolve o clipe a `na_fila` PRESERVANDO
--     `objeto_ref` (503/saturação e falha transitória abaixo do teto). A
--     próxima reserva encontrava a linha elegível e o objeto já apagado: o
--     clipe queimava as tentativas restantes em `ler()` e morria `falhou` sem
--     nunca ter sido transcrito.
--  2. o sweeper (`scripts/asr-sweeper-orfaos.mjs`, T15) apagava por IDADE do
--     objeto e só por ela. Fila represada (ou agendador parado) por mais de 6h
--     e o backstop apagava o áudio de um clipe legitimamente `na_fila`.
--
-- A resposta certa para os dois é a MESMA pergunta, então ela mora em um lugar
-- só: o banco. Duplicar em TS a aritmética do teto de `app_asr_falhar` (T02)
-- daria duas verdades que envelhecem separado.
--
-- POR QUE DEFINER E POR QUE SEM TENANT: idêntico ao bloco de abertura da
-- `0136` — `audio_capture` tem FORCE RLS e todas as policies são `TO app_role`
-- resolvidas por `app_clinic_id_exigido()`. Nem o worker nem o sweeper têm
-- usuário logado ou `app.clinic_id` de sessão; sob a RLS o worker veria a
-- resposta "nenhum objeto em uso" SEM ERRO — que aqui é a resposta PERIGOSA
-- (apaga tudo). Cross-tenant por desenho, como as outras três.
--
-- SUPERFÍCIE: o chamador não passa predicado nenhum, e a função não devolve
-- dado clínico — só ecoa de volta o subconjunto das chaves QUE O CHAMADOR JÁ
-- TINHA e que ainda estão reivindicadas por alguma linha. É um bit por chave
-- (mesma régua da memória `definer-cross-tenant-so-devolve-boolean`).
--
-- ESTADOS QUE CONTAM COMO "EM USO": `na_fila` (vai ser lido na próxima
-- reserva) e `transcrevendo` (está sendo lido agora). `transcrito`/`falhou`
-- são terminais — ali `app_asr_concluir`/`app_asr_falhar` já zeraram
-- `objeto_ref`, então a linha nem chega a casar com a chave; um objeto que
-- sobrou no bucket nesse caso é vazamento real e deve ser apagado.
-- `nao_solicitado` também NÃO é uso: é a linha recém-inserida por
-- `enviarLoteAsr` (T09) cujo upload ainda não confirmou — se o objeto existir
-- no bucket com essa idade, o upload subiu e a promoção a `na_fila` não
-- aconteceu (container morreu no meio), que é exatamente o órfão do backstop.
CREATE OR REPLACE FUNCTION public.app_asr_objetos_em_uso(p_refs text[])
RETURNS TABLE (ref text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT a.objeto_ref
    FROM audio_capture AS a
   WHERE a.objeto_ref = ANY(p_refs)
     AND a.asr_status IN ('na_fila', 'transcrevendo');
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_asr_objetos_em_uso(text[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_asr_objetos_em_uso(text[]) TO app_role;
