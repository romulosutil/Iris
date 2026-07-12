ALTER TABLE "goal" ADD COLUMN "disciplina" text;
--> statement-breakpoint
-- Plano 3 (Metas): disciplina é atributo clínico EDITÁVEL da meta (ABA/Fono/TO),
-- então entra no GRANT UPDATE por coluna de `goal` (o mesmo idioma do 0006 que
-- trava identidade — patient_id/clinic_id/criado_por seguem SEM update). GRANT
-- por coluna é aditivo no Postgres: só acrescenta `disciplina` ao grant já dado.
GRANT UPDATE (disciplina) ON goal TO app_role;