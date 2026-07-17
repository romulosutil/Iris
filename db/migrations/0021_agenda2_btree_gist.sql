-- Agenda 2.0 (Etapa A) — habilita btree_gist. Pré-requisito das constraints
-- EXCLUDE USING gist anti-overbook em `session` (0035): permite combinar
-- igualdade (terapeuta_id/patient_id WITH =) com overlap de range (&&) no mesmo
-- índice gist. Não é expressável em Drizzle → migration à mão, sem snapshot.
CREATE EXTENSION IF NOT EXISTS btree_gist;
