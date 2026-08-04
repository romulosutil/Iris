# Especificação Técnica — Issue #187: Teste de CI para Integridade de Migrações e `_journal.json` (Débito D2)

**Data:** 03/08/2026  
**Issue GitHub:** [#187](https://github.com/romulosutil/Iris/issues/187)  
**Ref:** `BACKLOG.md` (Item D2)  
**Escopo:** Implementação de teste automatizado em Vitest para validar a integridade dos arquivos de migração SQL (`db/migrations/*.sql`) e o manifesto do Drizzle ORM (`db/migrations/meta/_journal.json`).

---

## 🎯 Contexto & Problema de Negócio

No Drizzle ORM, migrações escritas à mão em `db/migrations/NNNN_nome.sql` precisam de uma entrada correspondente no manifesto `db/migrations/meta/_journal.json`.

Cada entrada no manifesto requer a propriedade `when` (timestamp numérico em ms). Se o valor de `when` de um novo registro for **menor ou igual ao do registro anterior**, o Drizzle ignora o arquivo SQL **em silêncio** durante o `pnpm db:migrate` sem emitir warning ou erro (incidente registrado na migração `0055`).

Para impedir regressões em silêncio, a validação deve ser feita no nível de teste unitário/CI em todo build e PR.

---

## 🛠️ Regras de Validação do Teste (`src/db/migrations.test.ts`)

1. **Correspondência 1:1 de Arquivos SQL:**
   - Todo arquivo `.sql` existente em `db/migrations/` (desconsiderando arquivos em subdiretórios) deve possuir exatamente um registro correspondente na lista `entries` de `_journal.json`.
2. **Ausência de Registros Órfãos:**
   - Nenhuma entrada em `_journal.json` pode apontar para um arquivo `.sql` inexistente no disco.
3. **Sequência de `when` Estritamente Crescente:**
   - Para cada entrada $i > 0$ em `entries`, $when[i] > when[i-1]$.
   - Não são permitidos timestamps iguais ou decrescentes.
4. **Unicidade de Índices (`idx`):**
   - O campo `idx` das entradas no journal deve ser sequencial e único (ex: 0, 1, 2, ... N).

---

## 📊 Estado de Implementação
- **Mapeamento & Spec:** ✅ Concluído.
- **Teste Unitário (`src/db/migrations.test.ts`):** 🚧 Pendente de implementação.
