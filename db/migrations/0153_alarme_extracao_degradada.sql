-- 0153_alarme_extracao_degradada.sql
-- Contadores da extração para o detector de alarme (#560, `DA-04` — fatia F5).
--
-- O QUE FALTAVA, DEPOIS DA 0148: `metricas_extracao_por_clinica_semana` (#535)
-- já agrega extração por clínica e semana, mas é uma view DE TENANT — filtra
-- por `app_clinic_id_exigido()` e só o `coordenador` daquela clínica lê. Ela
-- responde "como está a IA na MINHA clínica esta semana"; não responde "o
-- provider degradou AGORA, em qualquer clínica", que é a pergunta do operador
-- e a única que um alarme pode fazer. Daí uma função própria, cross-tenant e
-- de janela curta, em vez de alargar a view (alargar quebraria o isolamento
-- que é a razão de ela existir).
--
-- POR QUE FUNÇÃO SECURITY DEFINER, E NÃO `GRANT SELECT` NA TABELA: mesma razão
-- literal da 0129 — `extraction` está sob RLS e as policies de leitura são
-- TO app_role. Um GRANT de tabela para `iris_alarme` não bate em policy
-- nenhuma e devolve ZERO LINHAS SEM ERRO; o detector reportaria "tudo ok" para
-- sempre, que é pior do que não ter alarme.
--
-- POR QUE O RETORNO NÃO TEM `clinic_id` (diferente das duas funções da 0129):
-- o provider de extração é global — quando ele degrada, degrada para todo
-- mundo, e a chave de investigação é o MODELO, não a clínica. Devolver o
-- tenant aqui só ampliaria o que uma credencial vazada deste serviço extrai,
-- sem responder nada que o operador vá usar. Nenhuma coluna de texto clínico,
-- nenhum id de paciente/sessão/clínica sai daqui: só modelo e contagem.
--
-- ─── O QUE A LINHA CONTA, E POR QUE NÃO É `count(*)` ─────────────────────────
--
-- `extraction` NÃO é ledger de chamada. Uma chamada bem-sucedida grava N
-- linhas (uma por item de evidência) e uma falha grava UMA
-- (`pendente_reprocessamento`, o `PENDENTE_DRAFT` de `diario-consolidacao.ts`).
-- Contar linhas cruas mediria "itens de evidência", e a taxa de falha sairia
-- diluída por um fator que muda com a verborragia da nota. Por isso o agregado
-- passa por `por_sessao`: a unidade é a CHAMADA (uma sessão, um modelo, uma
-- latência), e as N linhas do sucesso colapsam em uma.
--
-- LIMITE CONHECIDO E ACEITO (medido em 04/09/2026, ao abrir a fatia): a Fase C
-- da consolidação APAGA as linhas `sugerida`/`pendente_reprocessamento` da
-- sessão antes de regravar. Uma falha que o terapeuta re-tentou com sucesso
-- some do histórico. Ou seja: `falhas` conta falha NÃO RESOLVIDA, não "falhas
-- ocorridas". Para um ALARME isso é a métrica certa, e não uma concessão —
-- queda real do provider mantém as linhas de pé (ninguém consegue re-tentar
-- com sucesso enquanto ele está fora), enquanto a falha transitória que o
-- retry resolveu é justamente a que não deve acordar ninguém. O ledger fiel,
-- se um dia a contagem histórica for necessária, é tabela nova — registrado
-- como débito, não improvisado aqui.
--
-- `p_janela` é parâmetro, e não constante embutida, pelo mesmo motivo da
-- 0129: o runbook precisa poder investigar com outra régua sem migração nova.
CREATE OR REPLACE FUNCTION public.app_alarme_extracao(p_janela interval)
RETURNS TABLE (
  modelo          text,
  chamadas        integer,
  falhas          integer,
  p95_latencia_ms integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH por_sessao AS (
    SELECT
      e.session_id,
      e.modelo AS modelo,
      -- `bool_or`: a Fase C grava OU os drafts OU a linha pendente, nunca as
      -- duas para a mesma chamada. Linhas já revisadas de uma chamada ANTERIOR
      -- podem coexistir na sessão, mas com `criado_em` fora desta janela.
      bool_or(e.estado = 'pendente_reprocessamento') AS falhou,
      -- Todas as linhas da mesma chamada carregam a MESMA latência (a meta é
      -- gravada uma vez, para o lote inteiro) — `max` só escolhe uma delas.
      max(e.latencia_ms) AS latencia_ms
    FROM extraction e
    WHERE e.criado_em >= now() - p_janela
    GROUP BY e.session_id, e.modelo
  )
  SELECT
    s.modelo,
    count(*)::integer,
    count(*) FILTER (WHERE s.falhou)::integer,
    -- `latencia_ms` é NULL em provider sem medição (NullProvider) e em linha
    -- anterior à 0147; o FILTER tira essas do percentil em vez de deixá-las
    -- virar zero. Sem nenhuma medida na janela o percentil é NULL, e quem lê
    -- distingue "rápido" de "não medido".
    (percentile_cont(0.95) WITHIN GROUP (ORDER BY s.latencia_ms)
       FILTER (WHERE s.latencia_ms IS NOT NULL))::integer
  FROM por_sessao s
  GROUP BY s.modelo;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_alarme_extracao(interval) FROM PUBLIC;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.app_alarme_extracao(interval) TO iris_alarme;
