ALTER TABLE "clinic" ADD COLUMN "timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN "passo_grade_min" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN "duracao_disciplina" jsonb DEFAULT '{}'::jsonb NOT NULL;