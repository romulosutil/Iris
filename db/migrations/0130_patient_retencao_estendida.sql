ALTER TABLE "patient" ADD COLUMN "retencao_estendida_ate" date;--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "retencao_estendida_motivo" text;--> statement-breakpoint
-- D60/#352 P4 — mesmo padrão de 0126 (familia_abordagem): coluna nova de
-- `patient` nasce sem GRANT (REVOKE global da 0044), UPDATE explícito só nas
-- colunas novas.
GRANT UPDATE (retencao_estendida_ate, retencao_estendida_motivo) ON patient TO app_role;
