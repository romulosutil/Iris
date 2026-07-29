-- #100 — Consentimento de titular adulto (parte 2 de 2): responsável opcional
-- + CHECK que amarra responsável ao tipo de consentimento.
--
-- `responsavel_signatario` era NOT NULL porque o produto só atendia paciente
-- menor (TEA). Com os nichos de Terapia Convencional (#98) e TCC (#99), o
-- titular adulto assina por si — e NULL é a representação correta de "não
-- existe responsável", não uma sentinela com o nome do próprio paciente
-- (ver .specs/features/consentimento-titular-adulto/spec.md, D1).
--
-- O CHECK usa `tipo::text` em vez de comparar direto com o enum: ver a nota
-- em 0050 — o migrator do drizzle roda todas as migrações pendentes numa
-- única transação, e comparar com o valor de enum criado em 0050 dentro dessa
-- mesma transação aborta com "unsafe use of new value". Semanticamente o
-- predicado é idêntico ao do spec.
--
-- `uso_ia_processamento` e `exportacao_relatorios` (hoje sem uso em código)
-- passam sem restrição — o CHECK não decide o comportamento futuro deles,
-- só preserva compatibilidade retroativa.
ALTER TABLE "consent" ALTER COLUMN "responsavel_signatario" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "consent" ADD CONSTRAINT "consent_responsavel_por_tipo" CHECK (
  ("tipo"::text = 'tratamento_dados_menor' AND "responsavel_signatario" IS NOT NULL)
  OR
  ("tipo"::text = 'autoconsentimento_titular_adulto' AND "responsavel_signatario" IS NULL)
  OR
  ("tipo"::text IN ('uso_ia_processamento', 'exportacao_relatorios'))
);
