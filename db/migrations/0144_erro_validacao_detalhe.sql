-- #532 (auditoria 360, Q-01): DLQ da revisão ganha coluna própria.
--
-- Antes, o catch de `transicionar()` gravava `payload_editado = {error: msg}`
-- — contaminando o conteúdo clínico efetivo (`payload_editado ?? payload`):
-- reaprovar lia `{error}`, não achava `alvos` e virava `aprovada` com zero
-- `evidence`. O diagnóstico da falha passa a viver em `erro_validacao_detalhe`
-- (`{codigo, hash, quando}` — sem a message crua do driver, que carrega
-- SQL + params = PHI).
ALTER TABLE "extraction" ADD COLUMN "erro_validacao_detalhe" jsonb;--> statement-breakpoint
-- `extraction` tem UPDATE revogado por tabela e concedido coluna a coluna
-- (0012, 0037; medido em information_schema.column_privileges antes desta
-- migração: estado, payload_editado, revisado_em, revisado_por, versao). Sem
-- este GRANT o UPDATE inteiro do DLQ falha com `permission denied for table
-- extraction` (regra 4 do CLAUDE.md).
GRANT UPDATE (erro_validacao_detalhe) ON extraction TO app_role;--> statement-breakpoint
-- Backfill: linhas que o DLQ antigo deixou com `{error: msg}` em
-- `payload_editado` migram para a coluna nova e liberam `payload_editado`.
-- A message crua NÃO é copiada (pode carregar SQL + params do driver = PHI):
-- fica só o hash curto, para correlação com logs antigos, e o carimbo de
-- quando a extração foi para `erro_validacao` (`revisado_em`, ou `criado_em`
-- quando o DLQ não chegou a gravar o carimbo).
UPDATE extraction
SET erro_validacao_detalhe = jsonb_build_object(
      'codigo', 'LEGADO_DLQ',
      'hash', substr(encode(sha256(convert_to(payload_editado->>'error', 'UTF8')), 'hex'), 1, 12),
      'quando', to_char(COALESCE(revisado_em, criado_em) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'legado', true),
    payload_editado = NULL
WHERE estado = 'erro_validacao' AND payload_editado ? 'error';
