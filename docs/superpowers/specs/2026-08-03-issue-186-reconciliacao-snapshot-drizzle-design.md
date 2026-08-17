# Especificação Técnica — Issue #186: Reconciliação do Snapshot do Drizzle ORM (Débito D1)

**Data:** 03/08/2026  
**Issue GitHub:** [#186](https://github.com/romulosutil/Iris/issues/186)  
**Ref:** `BACKLOG.md` (Item D1)  
**Escopo:** Reconciliação do estado de meta-snapshot do Drizzle ORM (`db/migrations/meta/*_snapshot.json`) com o schema de dados atual (`src/db/schema.ts`), destravando a execução segura do comando `pnpm db:generate`.

---

## 🎯 Contexto & Causa Raiz do Problema

1. **Parada no Snapshot `0041`:**
   - A pasta `db/migrations/meta/` possui snapshots históricos gravados até o arquivo `0041_snapshot.json`.
   - Das migrações `0042` até a `0070` (`0070_expurgo_audit_log_marco_civil.sql`), as alterações de DDL foram escritas manualmente em arquivos `.sql` e registradas no `_journal.json`, mas o snapshot estrutural em JSON não foi gerado/atualizado.
2. **Impacto:**
   - Ao executar `pnpm db:generate`, o Drizzle Kit compara o código TypeScript em `src/db/schema.ts` contra o snapshot `0041_snapshot.json`.
   - Como resultado, a CLI tenta gerar um script SQL contendo mais de 128 linhas recriando tabelas, enums e índices que já foram aplicados no banco em produção (como `two_factor`, `audit_log`, `alerta_risco_clinico`, etc.).

---

## 🛠️ Procedimento de Reconciliação Proposto

1. **Captura do Snapshot Vigente:**
   - Sincronizar a representação do Drizzle Kit com o estado do `src/db/schema.ts` e com as migrações até a `0070`.
2. **Atualização da pasta `db/migrations/meta/`:**
   - Gerar o snapshot atualizado equivalente à migração corrente.
3. **Validação do Diff Zero:**
   - Rodar `pnpm db:generate` e comprovar que o diff gerado é de 0 linhas (sem detecção de alterações pendentes ou tabelas duplicadas).

---

## 📊 Estado de Implementação

- **Diagnóstico & Causa Raiz:** ✅ Concluído.
- **Especificação Técnica:** ✅ Concluído.
- **Execução da Reconciliação de Snapshot:** 🚧 Pendente.
