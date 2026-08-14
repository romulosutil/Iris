-- Verificação pós-deploy da 0096 + diagnóstico dos ciclos já órfãos
-- (#287 Problema 1). Leitura pura: nenhum INSERT/UPDATE/DDL.
--
-- Duas perguntas, nesta ordem:
--   (1) a 0096 rodou? (o valor `devido` existe no enum em produção)
--   (2) sobrou lixo do período anterior ao fix? (ciclo em `aberto`/`apurado`
--       cuja assinatura já está `canceled` — o estado que ficava invisível
--       para sempre, porque `fecharCiclosVencendo` varre `status = 'active'`)
--
-- A consulta (2) NÃO calcula dinheiro de propósito. O preço mora na calculadora
-- em TypeScript (faixas marginais de R$ 39/32/25); reimplementá-lo aqui criaria
-- uma segunda tabela de faixas impossível de manter sincronizada — que é a
-- razão pela qual `billing_apurar_ciclo` devolve CONTAGEM e nunca valor. O que
-- sai daqui são os insumos (fichas contadas, dias usados, dias do ciclo) para
-- decidir o destino de cada linha.

-- ─── (1) A migração rodou? ───────────────────────────────────────────────────
SELECT item, esperado, encontrado,
       CASE WHEN ok THEN 'PASSOU' ELSE '>>> FALHOU <<<' END AS veredito
FROM (
  SELECT '0096 billing_cycle_status.devido' AS item,
         'existe' AS esperado,
         coalesce((SELECT 'existe'
                     FROM pg_enum e
                     JOIN pg_type t ON t.oid = e.enumtypid
                    WHERE t.typname = 'billing_cycle_status'
                      AND t.typnamespace = 'public'::regnamespace
                      AND e.enumlabel = 'devido'), 'AUSENTE') AS encontrado,
         EXISTS (SELECT 1
                   FROM pg_enum e
                   JOIN pg_type t ON t.oid = e.enumtypid
                  WHERE t.typname = 'billing_cycle_status'
                    AND t.typnamespace = 'public'::regnamespace
                    AND e.enumlabel = 'devido') AS ok
) v;

-- ─── (2) Ciclos órfãos anteriores ao fix ─────────────────────────────────────
-- Zero linha = nada a fazer. Cada linha que aparecer é receita que ficou sem
-- fatura antes da 0096; o destino (congelar como `devido` com o pro-rata,
-- perdoar, ou cobrar na reativação) é decisão do Rômulo, não deste arquivo.
SELECT bc.id                                   AS cycle_id,
       bc.clinic_id,
       c.nome                                  AS clinica,
       bc.status::text                         AS status_do_ciclo,
       s.status::text                          AS status_da_assinatura,
       bc.inicio,
       bc.fim,
       s.cancelada_em,
       s.ciclo_dias,
       bc.pacientes_contados,
       bc.valor_centavos,
       -- Dias usados pela MESMA régua do código (`apurarDebitoProRata`): o dia
       -- iniciado conta cheio, com piso de 1 e teto na duração do ciclo.
       least(
         greatest(ceil(extract(epoch FROM (s.cancelada_em - bc.inicio)) / 86400), 1),
         greatest(round(extract(epoch FROM (bc.fim - bc.inicio)) / 86400), 1)
       )::int                                  AS dias_usados,
       greatest(round(extract(epoch FROM (bc.fim - bc.inicio)) / 86400), 1)::int
                                               AS dias_do_ciclo
  FROM billing_cycle bc
  JOIN subscription s ON s.id = bc.subscription_id
  JOIN clinic c       ON c.id = bc.clinic_id
 WHERE s.status = 'canceled'
   AND bc.status IN ('aberto', 'apurado')
 ORDER BY s.cancelada_em NULLS FIRST, bc.inicio;
