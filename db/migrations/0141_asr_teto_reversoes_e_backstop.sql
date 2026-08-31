-- 0141_asr_teto_reversoes_e_backstop.sql
-- Issue #494 / T19 — fecha o laço infinito de `503` e dá backstop de idade
-- para a LINHA, não só para o objeto.
--
-- ─── O QUE A `0136` AFIRMOU E NÃO SE SUSTENTA ────────────────────────────────
-- O comentário da `0136:130-134` diz que o `503` "é anomalia, não caminho
-- normal", porque estaria "contido por CONFIG — com o teto de concorrência do
-- serviço >= o teto do agendador".
--
-- Medido, não deduzido: NÃO existe teto de concorrência no agendador. O laço de
-- `infra/asr/agendador.sh` é serial DENTRO do container (ele espera o `node
-- --once` terminar), mas o cliente do disparo aborta em 120s
-- (`scripts/disparo-asr-transcrever.mjs`, `timeoutMs = 120000`) enquanto um tick
-- CHEIO do lado do servidor pode levar ~215s (5 clipes × ~43s medidos no
-- runbook §2). O `AbortSignal` derruba a conexão do CLIENTE; a rota do Next
-- continua processando do outro lado. O laço então dorme 20s e dispara de novo
-- — contra um tick anterior que ainda está vivo. Sob fila cheia, ticks
-- sobrepostos são o REGIME NORMAL, não a anomalia, e `503` do serviço ASR
-- (`ASR_MAX_CONCORRENTES`) vira o desfecho corriqueiro.
--
-- ─── POR QUE ISSO ERA UM VAZAMENTO SEM LIMITE, E NÃO SÓ LENTIDÃO ─────────────
-- `app_asr_falhar(id, true)` devolve o clipe a `na_fila` com `greatest(
-- tentativas - 1, 0)` IGNORANDO o teto de 3 — de propósito, para que saturação
-- da VPS não condene um áudio que nunca foi processado. Só que sem contador
-- próprio isso não tem fim: reserva → 503 → reversão → reserva → 503 → …
-- E `app_asr_objetos_em_uso` (0138) conta `na_fila` como EM USO, então o
-- sweeper (T15) preserva o objeto para sempre. Havia backstop de idade para o
-- OBJETO, nenhum para a LINHA — e era a linha que isentava o objeto. Resultado:
-- R11 ("nenhum áudio sobrevive ao fim do tick") violado sem limite, e fila que
-- nunca drena.
--
-- ─── AS DUAS TRAVAS ──────────────────────────────────────────────────────────
-- 1. TETO DE REVERSÕES (`audio_capture.reversoes`, coluna da 0139). Contador
--    SEPARADO de `tentativas` porque a reversão, por definição, não cobra
--    tentativa: usar o mesmo contador reintroduziria exatamente o defeito que a
--    reversão existe para evitar (clipe morto por carga da máquina). Estourado
--    o teto, a saturação deixa de ser gratuita e o clipe passa a percorrer o
--    caminho normal — consome as 3 tentativas e termina em `falhou`. Ou seja:
--    a fila drena mesmo com o serviço ASR saturado indefinidamente.
-- 2. BACKSTOP DE IDADE DA LINHA (`app_asr_expirar_presos`). O teto acima cobre
--    o clipe que continua sendo processado. Não cobre o clipe que ficou preso
--    por uma via que ninguém previu (container morto entre a reserva e o
--    `falhar`, deploy no meio do tick, bug futuro). O backstop é a rede embaixo
--    da rede: passou da janela, vira `falhou` e SOLTA o objeto.

-- Teto de reversões por clipe. 10 é folga generosa e finita: a 20s de tick, são
-- ~3 minutos de saturação sustentada antes de o clipe começar a gastar
-- tentativa. Vai no corpo da função, não em env: quem lê o estado do clipe
-- (sweeper, suporte, esta migração) precisa da mesma aritmética, e duplicá-la
-- em TS daria duas verdades que envelhecem separado — mesmo argumento que criou
-- a 0138.
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
    -- `FOR UPDATE` porque a decisão (reverter ou não) é lida antes de escrita:
    -- sem o lock, dois `falhar(true)` concorrentes sobre o mesmo clipe leriam
    -- o mesmo `reversoes` e os dois reverteriam. O guard de estado
    -- (`transcrevendo`) é o mesmo do UPDATE — se a linha já saiu desse estado,
    -- `v_reversoes` fica NULL e caímos no caminho normal, que também não vai
    -- casar. Rowcount 0 é a resposta correta ali.
    SELECT reversoes INTO v_reversoes
      FROM audio_capture
     WHERE id = p_id
       AND asr_status = 'transcrevendo'
       FOR UPDATE;

    IF v_reversoes IS NOT NULL AND v_reversoes < c_teto THEN
      UPDATE audio_capture
         SET asr_status = 'na_fila',
             -- `greatest(..., 0)`: um `falhar(true)` duplicado (retry do
             -- worker) não pode levar o contador a negativo.
             tentativas = greatest(tentativas - 1, 0),
             reversoes  = reversoes + 1
       WHERE id = p_id
         AND asr_status = 'transcrevendo';

      GET DIAGNOSTICS v_afetadas = ROW_COUNT;
      RETURN v_afetadas;
    END IF;

    -- Teto estourado (ou linha fora de `transcrevendo`): NÃO retorna aqui — cai
    -- de propósito no caminho normal abaixo. A saturação continua não sendo
    -- culpa do clipe, mas a partir daqui ela custa tentativa, senão o laço não
    -- tem fim. Depois de 3 tentativas o clipe termina em `falhou` e o objeto é
    -- liberado, que é o desfecho honesto para um áudio que a infra não deu
    -- conta de transcrever.
  END IF;

  UPDATE audio_capture
     SET asr_status = CASE WHEN tentativas >= 3 THEN 'falhou'::asr_status
                           ELSE 'na_fila'::asr_status END,
         objeto_ref = CASE WHEN tentativas >= 3 THEN NULL
                           ELSE objeto_ref END
   WHERE id = p_id
     AND asr_status = 'transcrevendo';

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas;
END; $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_asr_falhar(uuid, boolean) FROM PUBLIC;
--> statement-breakpoint
-- Repetido de propósito depois do `CREATE OR REPLACE`: replace preserva a ACL,
-- mas quem lê esta migração isolada precisa ver quem pode executar. `app_role`
-- NÃO entra (T18, migração 0140).
GRANT EXECUTE ON FUNCTION public.app_asr_falhar(uuid, boolean) TO iris_asr_worker;
--> statement-breakpoint

-- Backstop de idade para a LINHA presa em `na_fila`/`transcrevendo`.
--
-- `falhou` + `objeto_ref = NULL` na mesma passada, e nessa ordem lógica, porque
-- o que interessa é SOLTAR O OBJETO: enquanto a linha reivindicar a chave,
-- `app_asr_objetos_em_uso` responde "em uso" e o sweeper preserva o áudio. É a
-- linha que isenta o objeto — zerar a referência é o que devolve o objeto ao
-- alcance do backstop de 6h do sweeper.
--
-- `criado_em` como régua (não um `atualizado_em`, que a tabela não tem): a
-- janela é sempre medida desde a gravação, então um clipe não pode se renovar
-- indefinidamente ficando na fila. É deliberadamente a MESMA régua do sweeper
-- (`ASR_SWEEPER_LIMITE_HORAS`, default 6h): passada a janela, o objeto seria
-- apagado de qualquer jeito se estivesse ocioso, então uma linha que continua
-- esperando por ele está esperando por um áudio condenado.
--
-- Nenhum risco de matar tick legítimo em voo: um tick inteiro tem teto de 5
-- clipes e ~215s medidos, quatro ordens de grandeza abaixo da janela.
--
-- Parâmetro (e não constante) pelo mesmo motivo de `app_alarme_*` (0129): o
-- runbook precisa poder investigar com outra régua sem migração nova.
CREATE OR REPLACE FUNCTION public.app_asr_expirar_presos(p_idade interval)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_afetadas integer;
BEGIN
  UPDATE audio_capture
     SET asr_status = 'falhou'::asr_status,
         objeto_ref = NULL
   WHERE asr_status IN ('na_fila', 'transcrevendo')
     AND criado_em <= now() - p_idade;

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas;
END; $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_asr_expirar_presos(interval) FROM PUBLIC;
--> statement-breakpoint
-- Só o worker. É uma função de MUTAÇÃO em massa cross-tenant — a superfície
-- mais perigosa deste arquivo — então ela nasce fora de `app_role`, ao
-- contrário das três da 0136 que precisaram ser retiradas depois (T18).
GRANT EXECUTE ON FUNCTION public.app_asr_expirar_presos(interval) TO iris_asr_worker;
