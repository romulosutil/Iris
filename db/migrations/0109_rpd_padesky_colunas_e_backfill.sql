ALTER TABLE "tcc_rpd_entry" ALTER COLUMN "distorcao_cognitiva" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tcc_rpd_entry" ALTER COLUMN "resposta_racional" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN "taxonomia_distorcoes" jsonb DEFAULT '["catastrofizacao","leitura_mental","tudo_ou_nada","generalizacao_excessiva","desqualificacao_positivo","raciocinio_emocional","afirmacoes_deveria","rotulacao","personalizacao","filtro_mental","adivinhacao_futuro","outra_nao_especificada"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tcc_rpd_entry" ADD COLUMN "distorcoes_cognitivas" jsonb;--> statement-breakpoint
ALTER TABLE "tcc_rpd_entry" ADD COLUMN "evidencias_favor" text;--> statement-breakpoint
ALTER TABLE "tcc_rpd_entry" ADD COLUMN "evidencias_contra" text;--> statement-breakpoint
ALTER TABLE "tcc_rpd_entry" ADD COLUMN "credibilidade_inicial" smallint;--> statement-breakpoint
ALTER TABLE "tcc_rpd_entry" ADD COLUMN "credibilidade_alternativa" smallint;--> statement-breakpoint
ALTER TABLE "tcc_rpd_entry" ADD COLUMN "comportamento_resultante" text;--> statement-breakpoint
ALTER TABLE "tcc_rpd_entry" ADD CONSTRAINT "tcc_rpd_credibilidade_inicial_range" CHECK ("tcc_rpd_entry"."credibilidade_inicial" IS NULL OR ("tcc_rpd_entry"."credibilidade_inicial" BETWEEN 0 AND 100));--> statement-breakpoint
ALTER TABLE "tcc_rpd_entry" ADD CONSTRAINT "tcc_rpd_credibilidade_alternativa_range" CHECK ("tcc_rpd_entry"."credibilidade_alternativa" IS NULL OR ("tcc_rpd_entry"."credibilidade_alternativa" BETWEEN 0 AND 100));--> statement-breakpoint

-- A partir daqui é escrito à mão (#389): backfill idempotente de
-- distorcao_cognitiva (texto livre, Burns) -> distorcoes_cognitivas (slugs,
-- Padesky). Valor que não casar com nenhum dos 12 slugs vira NULL, e a
-- contagem de não-casados é impressa via RAISE NOTICE (aparece na saída de
-- `pnpm db:migrate`) — nunca descartada em silêncio (CLAUDE.md regra 1 /
-- issue #389). Reexecutável: WHERE só afeta linhas ainda não backfilled.
DO $$
DECLARE
  nao_casados integer;
BEGIN
  UPDATE tcc_rpd_entry SET distorcoes_cognitivas = CASE distorcao_cognitiva
    WHEN 'Catastrofização' THEN '["catastrofizacao"]'::jsonb
    WHEN 'Leitura Mental' THEN '["leitura_mental"]'::jsonb
    WHEN 'Tudo-ou-Nada' THEN '["tudo_ou_nada"]'::jsonb
    WHEN 'Generalização Excessiva' THEN '["generalizacao_excessiva"]'::jsonb
    WHEN 'Desqualificação do Positivo' THEN '["desqualificacao_positivo"]'::jsonb
    WHEN 'Raciocínio Emocional' THEN '["raciocinio_emocional"]'::jsonb
    WHEN 'Afirmações ''Deveria''' THEN '["afirmacoes_deveria"]'::jsonb
    WHEN 'Rotulação' THEN '["rotulacao"]'::jsonb
    WHEN 'Personalização' THEN '["personalizacao"]'::jsonb
    WHEN 'Filtro Mental' THEN '["filtro_mental"]'::jsonb
    WHEN 'Adivinhação do Futuro' THEN '["adivinhacao_futuro"]'::jsonb
    WHEN 'Outra / Não Especificada' THEN '["outra_nao_especificada"]'::jsonb
    ELSE NULL
  END
  WHERE distorcao_cognitiva IS NOT NULL AND distorcoes_cognitivas IS NULL;

  SELECT count(*) INTO nao_casados
  FROM tcc_rpd_entry
  WHERE distorcao_cognitiva IS NOT NULL AND distorcoes_cognitivas IS NULL;

  RAISE NOTICE 'backfill distorcoes_cognitivas (#389): % linha(s) sem slug correspondente, viraram NULL', nao_casados;
END $$;