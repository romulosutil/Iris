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
-- CUSTO DO `::text`: a constraint fica CEGA a `ALTER TYPE ... RENAME VALUE`.
-- Renomear um valor de `consent_tipo` NÃO reescreve o literal de texto do lado
-- direito, e o CHECK passa a rejeitar silenciosamente TODA linha daquele valor
-- (comparação com um nome que não existe mais). Quem renomear um valor deste
-- enum tem que reescrever esta constraint na MESMA migração — não há aviso do
-- Postgres. O mesmo vale para o espelho em src/db/schema.ts.
--
-- `IS NOT NULL` sozinho não basta: `''` e `'   '` satisfazem NOT NULL e são
-- exatamente a sentinela falsa que esta constraint existe para impedir. Daí o
-- `btrim(...) <> ''` SOMADO ao `IS NOT NULL` — e não no lugar dele. Trocar um
-- pelo outro abriria um buraco maior: em CHECK, expressão que avalia para NULL
-- SATISFAZ a constraint (só FALSE rejeita), então com responsável NULL o ramo
-- do menor viraria `TRUE AND NULL` = NULL, e `NULL OR FALSE OR FALSE` = NULL —
-- a linha inválida passaria.
--
-- `uso_ia_processamento` e `exportacao_relatorios` (hoje sem uso em código)
-- passam sem restrição — o CHECK não decide o comportamento futuro deles,
-- só preserva compatibilidade retroativa.
--
-- ADD CONSTRAINT direto (validando na hora), e NÃO o `NOT VALID` +
-- `VALIDATE CONSTRAINT` de 0043_report_narrativo_com_ia.sql: a validação toma
-- ACCESS EXCLUSIVE e faz um seq scan de `consent`, mas no volume do piloto
-- (dezenas a poucas centenas de linhas) isso é lock de milissegundos. O padrão
-- de duas etapas paga um custo real — deixa a janela em que a constraint existe
-- sem cobrir o dado legado — e só se justifica em tabela grande o bastante para
-- o scan bloquear escrita por tempo perceptível. Não é o caso aqui. Se `consent`
-- crescer a ponto de a migração incomodar, o caminho é converter ESTA linha em
-- `... NOT VALID;` + `VALIDATE CONSTRAINT` numa migração posterior.
ALTER TABLE "consent" ALTER COLUMN "responsavel_signatario" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "consent" ADD CONSTRAINT "consent_responsavel_por_tipo" CHECK (
  ("tipo"::text = 'tratamento_dados_menor'
    AND "responsavel_signatario" IS NOT NULL
    AND btrim("responsavel_signatario") <> '')
  OR
  ("tipo"::text = 'autoconsentimento_titular_adulto' AND "responsavel_signatario" IS NULL)
  OR
  ("tipo"::text IN ('uso_ia_processamento', 'exportacao_relatorios'))
);
