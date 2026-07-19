-- Agenda 2.0 (Etapa E+F) — disciplina vira obrigatória.
-- `disciplina` era text livre nullable em `session` (avulsas/legado sem valor).
-- A métrica por disciplina (Etapa F) junta alvo×agendado×realizado por essa
-- chave; null quebra o join. Backfill de linhas legadas com 'desconhecida'
-- (sessões pré-Agenda-2.0, anteriores ao conceito) — valor que não é chave de
-- `clinic.duracao_disciplina`, então fica fora de qualquer métrica de disciplina
-- real em vez de falsear uma. Depois, NOT NULL. Tudo numa transação implícita
-- (drizzle roda o arquivo atômico).
UPDATE "session" SET "disciplina" = 'desconhecida' WHERE "disciplina" IS NULL;
--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "disciplina" SET NOT NULL;
