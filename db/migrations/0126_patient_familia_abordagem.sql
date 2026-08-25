CREATE TYPE "public"."familia_abordagem" AS ENUM('psicodinamica', 'humanista_existencial', 'transpessoal_integrativa');--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "familia_abordagem" "familia_abordagem";--> statement-breakpoint
-- #331 — mesmo padrão de 0096 (clinical_modality): coluna nova de `patient`
-- nasce sem GRANT (REVOKE global da 0044), UPDATE explícito só na coluna.
GRANT UPDATE (familia_abordagem) ON patient TO app_role;