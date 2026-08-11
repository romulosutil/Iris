# Especificação Técnica: Resolução D23 — Helpers `app_user_role_exigido()` e `app_user_id_exigido()` para GUCs de Papel e Identidade

> **Débito Técnico:** D23 (`BACKLOG.md:51`)  
> **Status:** 🟢 Especificação  
> **Data:** 11/08/2026  
> **Princípio Pétreo:** GUC ausente dentro de `SECURITY DEFINER` deve falhar barulhento com código e mensagem diagnósticáveis — nunca `42704`/`22P02` genéricos, nunca `NULL` silencioso onde o valor decide autorização.

---

## 1. Diagnóstico & Causa Raiz

### 1.1 O Que A `0087` Deixou Aberto (E Por Quê)

A `0087` corrigiu o `current_setting('app.clinic_id')::uuid` cru em 14 funções DEFINER e na view `audit_log_mascarado`. Mas **deliberadamente** deixou fora `app.user_role` e `app.user_id`, registrado como D23 (antes D21) no `BACKLOG.md`, pela razão:

- São gates de **papel**, não de tenant.
- `current_setting('app.user_role', true)` troca "estoura" por "`NULL` → nega", que é fail-closed e *portanto seguro*.
- Dentro de `SECURITY DEFINER` — onde o guard interno **é** a fronteira de autorização — é mudança de semântica, e merece decisão própria.
- `app.user_id` é mais delicado: é castado para `uuid`, então `missing_ok` sozinho não elimina o `22P02` — precisa de um helper irmão.

### 1.2 O Risco Real

`withTenant()` (`src/db/rls.ts`) sempre seta os 3 GUCs juntos, então **hoje** o risco é baixo. Mas:

1. **Assimetria armadilha:** a próxima função DEFINER escrita com `current_setting('app.user_id')::uuid` copisa o padrão dos vizinhos e reintroduz o `22P02` sem perceber — porque ninguém levanta no guard de CI.
2. **Diagnóstico:** `42704` e `22P02` não nomeiam qual GUC falhou — são os mesmos códigos que o D16 já provou serem caro de diagnosticar em incidente.
3. **Consistência:** ter helper para `clinic_id` mas cast cru para `user_id` e `user_role` é convite a erro.

### 1.3 Escopo

| GUC | Uso atual | Tipo de uso | Helper necessário |
|-----|-----------|-------------|-------------------|
| `app.user_role` | ~39 policies + ~11 funções + 1 view | Comparação string (sem cast) | `app_user_role_exigido()` → `text` |
| `app.user_id` | ~25 policies + ~5 funções | Cast `::uuid` | `app_user_id_exigido()` → `uuid` + `app_user_id_atual()` → `uuid` (leniente) |

---

## 2. Decisão de Design

### 2.1 O Par de Helpers (Mesmo Desenho da `0085`)

**`app_user_role_exigido()`** — `text`, SQL/STABLE:
- `current_setting('app.user_role', true)` → se não-nulo e não-vazio, devolve.
- Senão → `app_user_role_nao_resolvido()` (plpgsql, RAISE P0001).
- Sem cast (é text), logo não há `22P02` — o `missing_ok` é suficiente para evitar o `42704`.
- Não valida se o valor é um papel válido: isso é responsabilidade do `withTenant()` e da tabela `user_role`.

**`app_user_id_atual()`** — `uuid`, SQL/STABLE, leniente:
- Mesma lógica da `app_clinic_id_atual()`: regex de UUID, cast dentro do CASE, devolve `NULL` se malformado.
- Para uso dentro de INSERT/audit_log onde `NULL` é aceitável (precedente: `app_criar_alerta_risco` já usa `nullif(current_setting('app.user_id', true), '')::uuid`).

**`app_user_id_exigido()`** — `uuid`, SQL/STABLE:
- `COALESCE(app_user_id_atual(), app_user_id_nao_resolvido())`.
- Para uso dentro de guards de autorização e comparações de identidade.

### 2.2 Onde NÃO Trocar

- **Policies:** As ~39 policies que usam `current_setting('app.user_role')` **NÃO serão reescritas** neste débito. Motivo: dentro de policy, o `app.clinic_id` já é resolvido via `app_clinic_id_exigido()` que levanta P0001 antes de qualquer comparação de role. Se o GUC de role falhar, o de clinic já falhou antes. Reescrever 39 policies é alto risco, custo alto, benefício residual.
- **Policies com `current_setting('app.user_id')::uuid`:** Mesmo raciocínio — o tenant já levanta antes.
- **View `audit_log_mascarado`:** Já usa `current_setting('app.user_role', true)` com `missing_ok` (corrigido na `0087`). GUC ausente → `NULL` → `IN` vira `NULL` → linha negada (fail-closed). Sem cast, sem 22P02. Não mexer.

### 2.3 Onde Trocar (Funções DEFINER Apenas)

Dentro de SECURITY DEFINER o cenário é diferente: a função roda com direitos do dono, **ignora** a RLS, e o guard interno **é** a fronteira de autorização. O tenant pode até levantar antes (no `app_clinic_id_exigido()`), mas o `user_role` e `user_id` são usados **depois** do tenant, para decisões de papel. Se alguém um dia chamar uma função DEFINER por um caminho que não passa por `withTenant()` (seed, script, migração futura), o cast cru estoura com código genérico.

**Funções com `current_setting('app.user_role')` sem `missing_ok` (estouram `42704`):**

1. `app_salvar_config_emergencia` — guard de papel coordenador + msg de erro
2. `app_salvar_cpf_cnpj_clinica` — guard de papel coordenador + msg de erro
3. `app_desarquivar_paciente` — `IN ('coordenador', 'admin_recepcao')`
4. `app_alerta_risco_visivel` — comparação com 'coordenador'
5. `app_session_clinica_visivel` — comparação com 'coordenador'

**Funções com `current_setting('app.user_id')::uuid` (estouram `22P02` ou `42704`):**

1. `app_alerta_risco_visivel` — `= current_setting('app.user_id')::uuid`
2. `app_session_clinica_visivel` — `= current_setting('app.user_id')::uuid`
3. `app_salvar_config_emergencia` — `::uuid` no COALESCE de `protocolo_emergencia_declarado_por`
4. `app_desarquivar_paciente` — `= (current_setting('app.user_id'))::uuid`
5. `app_criar_alerta_risco` — `nullif(current_setting('app.user_id', true), '')::uuid` (2 ocorrências)

---

## 3. Matriz de Requisitos

| # | Requisito | Verificação |
|---|-----------|-------------|
| **R1** | `app_user_role_exigido()` devolve o valor quando GUC bem formado | Teste de contraprova |
| **R2** | `app_user_role_exigido()` levanta `P0001` (não `42704`) nos 3 estados ruins (ausente, vazio, lixo) | Teste por estado |
| **R3** | `app_user_id_atual()` devolve `NULL` nos 4 estados ruins de GUC (mesmo padrão da `app_clinic_id_atual`) | Teste por estado |
| **R4** | `app_user_id_exigido()` levanta `P0001` (não `42704`/`22P02`) nos 4 estados ruins | Teste por estado |
| **R5** | `app_user_id_exigido()` devolve o uuid quando GUC bem formado | Teste de contraprova |
| **R6** | Guard de CI: nenhuma função DEFINER pública usa `current_setting('app.user_id')::uuid` cru | Query em `pg_proc`, mesmo padrão da `0087` |
| **R7** | Guard de CI: nenhuma função DEFINER pública usa `current_setting('app.user_role')` 1-arg (sem `missing_ok`) | Query em `pg_proc` |
| **R8** | Conjunto exato de funções que chamam `app_user_role_exigido()` e `app_user_id_exigido()` | Array literal, comparação de conjunto |
| **R9** | Testes unitários existentes (`pnpm test`) continuam verdes | Gate de CI |
| **R10** | Testes RLS existentes (`pnpm test:rls`) continuam verdes | Gate de CI |

---

## 4. Riscos & Mitigações

| Risco | Mitigação |
|-------|-----------|
| Reescrita de corpo de função pode mutar uma query (D-CREATE-OR-REPLACE) | Gerar corpos de `pg_get_functiondef()`, trocar **apenas** o cast cru, comparação normalizada |
| Funções `app_criar_alerta_risco` usam `nullif(current_setting('app.user_id', true), '')::uuid` que já é parcialmente protegida | Trocar por `app_user_id_atual()` (leniente) nos INSERTs e `app_user_id_exigido()` nos guards |
| Policy que delega a função reescrita pode mudar de comportamento | Políticas NÃO são tocadas; funções mantêm contrato idêntico: levantam nos mesmos casos, devolvem os mesmos tipos |
