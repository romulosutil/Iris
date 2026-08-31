-- Issue #72 / T02 — funções SECURITY DEFINER da fila de ASR.
--
-- POR QUE DEFINER E POR QUE SEM TENANT:
-- `audio_capture` tem FORCE ROW LEVEL SECURITY e todas as policies são
-- `TO app_role`, resolvidas por `app_clinic_id_exigido()`. O worker de
-- transcrição roda a partir de uma rota interna disparada por um agendador —
-- não existe usuário logado, não existe `app.clinic_id` na sessão. Sob a RLS
-- ele veria FILA VAZIA, SEM ERRO (memória `grant-sem-policy-nega-tudo-em-
-- silencio`): a policy simplesmente não casa e o job reporta "nada a fazer"
-- para sempre. Por isso a reserva atravessa tenants a partir do owner.
--
-- Consequência aceita: estas três funções são cross-tenant POR DESENHO. Elas
-- NÃO resolvem tenant nenhum — não há `current_setting('app.clinic_id')` aqui,
-- nem cru nem via helper, porque não existe predicado de clínica que faça
-- sentido para um worker global (CLAUDE.md regra 6 trata do caso oposto: quem
-- PRECISA do tenant). O `clinic_id` sai como RESULTADO da reserva, para o
-- chamador saber a que clínica o objeto pertence — nunca como filtro.
--
-- A superfície é o que limita o estrago: nenhuma das três aceita um predicado
-- do chamador. `app_asr_reservar` só devolve o que já está `na_fila`;
-- `app_asr_concluir`/`app_asr_falhar` só agem sobre um id que a própria
-- reserva entregou, e só se a linha ainda estiver `transcrevendo`.
--
-- Idioma da reserva atômica: `src/lib/export/acervo/motor.ts:141-170` e
-- `app_export_bundle_reservar` — reservar ANTES de processar, incrementando a
-- tentativa na reserva.

-- Reserva até `p_limite` clipes da fila e os marca `transcrevendo`.
--
-- POR QUE O TETO DE TENTATIVAS VAI DENTRO DA SUBQUERY DO LIMIT (R16):
-- se `tentativas < 3` ficasse no WHERE de FORA, a subquery ainda escolheria as
-- N linhas mais antigas — inclusive as estouradas — e o filtro externo as
-- descartaria DEPOIS. Um punhado de clipes queimados no topo da ordenação
-- ocuparia a janela do LIMIT em todo tick e a fila inteira travaria, sem erro
-- nenhum (memória `varredura-filtro-depois-do-limit`). O teto tem que fazer
-- parte da ESCOLHA, não da filtragem posterior.
--
-- POR QUE `tentativas + 1` ACONTECE AQUI E NÃO NO FIM:
-- se o incremento só acontecesse ao falhar, um container morto no meio do
-- processamento devolveria o clipe ao conjunto elegível com o mesmo contador —
-- laço infinito silencioso. Reservando com incremento, falha parcial é
-- fail-closed COM PROGRESSO (memória `varredura-escreve-o-proprio-predicado`).
--
-- `FOR UPDATE SKIP LOCKED`: dois ticks sobrepostos não disputam a mesma linha;
-- o segundo pula o que o primeiro travou em vez de bloquear até o timeout.
-- `FOR UPDATE` exige privilégio de UPDATE — a função é do owner, então passa.
--
-- `objeto_ref IS NOT NULL`: sem o objeto efêmero não há o que transcrever.
-- Linha nesse estado só existe por corrida de upload ou por um `concluir`
-- anterior que já zerou a referência; reservá-la só gastaria tentativa.
CREATE OR REPLACE FUNCTION public.app_asr_reservar(p_limite integer)
RETURNS TABLE (
  id         uuid,
  clinic_id  uuid,
  objeto_ref text,
  lote_id    uuid,
  ordem      integer
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
  RETURNING a.id, a.clinic_id, a.objeto_ref, a.lote_id, a.ordem;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_asr_reservar(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_asr_reservar(integer) TO app_role;
--> statement-breakpoint

-- Conclui a transcrição de um clipe.
--
-- `objeto_ref = NULL` NÃO É COSMÉTICO: o objeto no bucket efêmero é apagado
-- pelo worker no `finally` do processamento (R11 — nenhum áudio sobrevive ao
-- fim do tick). Se a referência ficasse na linha, o banco passaria a apontar
-- para uma chave que não existe mais, e qualquer leitura futura (exportação de
-- acervo, expurgo, suporte) trataria isso como "áudio disponível". A coluna
-- volta a `NULL` porque é a verdade: não há mais objeto.
--
-- Guard de estado (`asr_status = 'transcrevendo'`): só conclui o que ESTA
-- passada reservou. Uma resposta atrasada de um tick anterior, chegando depois
-- de o clipe já ter sido devolvido à fila ou marcado `falhou`, não sobrescreve
-- o estado atual — afeta 0 linhas e o chamador vê isso no rowcount.
CREATE OR REPLACE FUNCTION public.app_asr_concluir(p_id uuid, p_texto text)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_afetadas integer;
BEGIN
  UPDATE audio_capture
     SET asr_status        = 'transcrito',
         transcricao_texto = p_texto,
         transcrito_em     = now(),
         objeto_ref        = NULL
   WHERE id = p_id
     AND asr_status = 'transcrevendo';

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas;
END; $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_asr_concluir(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_asr_concluir(uuid, text) TO app_role;
--> statement-breakpoint

-- Encerra o processamento de um clipe que não transcreveu.
--
-- DOIS CAMINHOS, PORQUE NÃO SÃO A MESMA FALHA (design §6):
--
-- 1. `p_reverter_tentativa = true` — o serviço ASR respondeu `503`, teto de
--    concorrência. Isso é SATURAÇÃO DA VPS, não defeito do clipe: o áudio nunca
--    chegou a ser processado. Como `app_asr_reservar` já incrementou
--    `tentativas` na reserva, deixar como está faria o clipe queimar as 3
--    tentativas (R16) por carga da máquina e morrer em `falhou` SEM NUNCA TER
--    SIDO TRANSCRITO. Então devolve a `na_fila` com `greatest(tentativas - 1,
--    0)`, IGNORANDO o teto — inclusive para um clipe que já está em 3, que é
--    justamente o que não pode ser condenado por um erro que não é dele.
--    `greatest(..., 0)` porque um `falhar(true)` duplicado (retry do worker)
--    não pode levar o contador a negativo.
--    Risco conhecido e contido por CONFIG, não por contador: com o teto de
--    concorrência do serviço >= o teto do agendador, `503` é anomalia, não
--    caminho normal. Se essa contenção não bastar, a alternativa é aceitar o
--    gasto da tentativa — e aí o parâmetro deixa de ser usado.
--
-- 2. `false` (default) — falha que o clipe de fato causou ou presenciou
--    (`400`/`413` definitivos, `408`/`500` transitórios). No teto, `falhou`
--    definitivo; abaixo dele, volta a `na_fila` PRESERVANDO `tentativas` (o
--    incremento já foi cobrado na reserva; somar de novo faria cada falha valer
--    duas). O objeto é zerado só no desfecho definitivo — no retorno à fila ele
--    também já foi apagado pelo `finally` do worker, mas quem reescreve
--    `objeto_ref` naquele caminho é o reenvio, não esta função.
--
-- Guard de estado igual ao de `app_asr_concluir`: só age sobre `transcrevendo`.
CREATE OR REPLACE FUNCTION public.app_asr_falhar(
  p_id uuid,
  p_reverter_tentativa boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_afetadas integer;
BEGIN
  IF p_reverter_tentativa THEN
    UPDATE audio_capture
       SET asr_status = 'na_fila',
           tentativas = greatest(tentativas - 1, 0)
     WHERE id = p_id
       AND asr_status = 'transcrevendo';
  ELSE
    UPDATE audio_capture
       SET asr_status = CASE WHEN tentativas >= 3 THEN 'falhou'::asr_status
                             ELSE 'na_fila'::asr_status END,
           objeto_ref = CASE WHEN tentativas >= 3 THEN NULL
                             ELSE objeto_ref END
     WHERE id = p_id
       AND asr_status = 'transcrevendo';
  END IF;

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas;
END; $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_asr_falhar(uuid, boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_asr_falhar(uuid, boolean) TO app_role;
