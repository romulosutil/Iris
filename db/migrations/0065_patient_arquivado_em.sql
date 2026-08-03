-- #174 — arquivamento COMERCIAL do paciente, desatrelado da alta CLÍNICA.
--
-- `alta_em` (0045) é decisão clínica e é o que dispara a régua de retenção
-- LGPD. `arquivado_em` é decisão comercial: sai da contagem de pacientes
-- ativos/mês da fatura. As duas são independentes de propósito:
--   * dar alta ARQUIVA (não faz sentido faturar quem teve alta);
--   * arquivar NUNCA dá alta (arquivar é ato administrativo, não clínico);
--   * paciente arquivado continua 100% legível e exportável — arquivamento é
--     filtro de UI e de faturamento, jamais de RLS.

ALTER TABLE patient
  ADD COLUMN arquivado_em timestamptz;
--> statement-breakpoint

-- A apuração de faturamento e as listas do app filtram por
-- (clinic_id, arquivado_em IS NULL); o índice serve os dois.
CREATE INDEX patient_clinic_arquivado_idx ON patient (clinic_id, arquivado_em);
--> statement-breakpoint

-- 0044 (PX4) revogou UPDATE de tabela em `patient` e concedeu coluna a coluna.
-- Sem estes grants, "dar alta" e "arquivar" falhariam como
-- "permission denied for table patient" — erro que não diz qual coluna.
GRANT UPDATE (alta_em, arquivado_em) ON patient TO app_role;
--> statement-breakpoint

-- ==================== regra "alta arquiva" no banco ====================
-- A regra 2 da #174 ("alta_em preenchido => arquivado_em preenchido") é
-- invariante de dado, não de tela: `alta_em` também é escrito por script de
-- retenção e por caminho administrativo futuro. Um trigger garante a regra em
-- QUALQUER caminho de escrita; deixar isso só na Server Action criaria uma
-- classe de paciente com alta e ainda faturável.
--
-- A recíproca NÃO existe de propósito: arquivar não mexe em `alta_em`
-- (regra 3). E o trigger só age na TRANSIÇÃO NULL -> NOT NULL, então
-- desarquivar um paciente que já teve alta continua possível — quem
-- desarquiva está afirmando que houve retorno; o registro clínico de alta é
-- histórico e não se reescreve sozinho.
CREATE OR REPLACE FUNCTION patient_alta_arquiva()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.alta_em IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.alta_em IS NULL)
     AND NEW.arquivado_em IS NULL THEN
    NEW.arquivado_em := now();
  END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint

CREATE TRIGGER patient_alta_arquiva_trg
  BEFORE INSERT OR UPDATE OF alta_em ON patient
  FOR EACH ROW EXECUTE FUNCTION patient_alta_arquiva();
--> statement-breakpoint

-- Backfill coerente com o trigger: quem já tinha alta antes desta migração
-- também não deve contar como paciente ativo.
UPDATE patient
   SET arquivado_em = now()
 WHERE alta_em IS NOT NULL
   AND arquivado_em IS NULL;
