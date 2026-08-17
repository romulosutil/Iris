# Design Técnico: Resolução D23 — Helpers de GUC para Papel e Identidade

> **Data:** 11/08/2026  
> **Status:** 🟢 Design Consolidado  
> **Componentes:** Migração `0093_user_role_id_helpers.sql` (helpers + reescrita DEFINER) & testes em `clinic-id-helper-rls.int.test.ts`

---

## 1. Novos Helpers SQL (Migração `0093`)

### 1.1 Raiser Functions (plpgsql, STABLE)

```sql
-- Levanta P0001 diagnóstico quando app.user_role não está resolvido.
CREATE OR REPLACE FUNCTION app_user_role_nao_resolvido()
RETURNS text LANGUAGE plpgsql STABLE AS $$
BEGIN
  RAISE EXCEPTION 'papel não resolvido: GUC app.user_role ausente ou vazio'
    USING ERRCODE = 'P0001',
          HINT = 'toda leitura de dado de paciente passa por withTenant() — src/db/rls.ts';
END;
$$;

-- Levanta P0001 diagnóstico quando app.user_id não está resolvido.
CREATE OR REPLACE FUNCTION app_user_id_nao_resolvido()
RETURNS uuid LANGUAGE plpgsql STABLE AS $$
BEGIN
  RAISE EXCEPTION 'identidade não resolvida: GUC app.user_id ausente ou fora do formato uuid'
    USING ERRCODE = 'P0001',
          HINT = 'toda leitura de dado de paciente passa por withTenant() — src/db/rls.ts';
END;
$$;
```

**REVOKE/GRANT:** mesma disciplina da `0085` — `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO app_role, iris_auth`.

### 1.2 Helpers Lenientes (SQL, STABLE)

```sql
-- Devolve o papel corrente ou NULL. Sem cast, sem 22P02 possível.
CREATE OR REPLACE FUNCTION app_user_role_atual()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(BTRIM(current_setting('app.user_role', true)), '');
$$;

-- Devolve o user_id corrente ou NULL. Mesma lógica da app_clinic_id_atual().
CREATE OR REPLACE FUNCTION app_user_id_atual()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT CASE
           WHEN current_setting('app.user_id', true)
                ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
           THEN current_setting('app.user_id', true)::uuid
           ELSE NULL
         END;
$$;
```

### 1.3 Helpers Estritos (SQL, STABLE)

```sql
CREATE OR REPLACE FUNCTION app_user_role_exigido()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(app_user_role_atual(), app_user_role_nao_resolvido());
$$;

CREATE OR REPLACE FUNCTION app_user_id_exigido()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT COALESCE(app_user_id_atual(), app_user_id_nao_resolvido());
$$;
```

---

## 2. Reescrita das Funções DEFINER

Todas geradas de `pg_get_functiondef()` com substituição textual **apenas** do cast cru.

### 2.1 `app_alerta_risco_visivel` (user_role E user_id)

| Antes                                              | Depois                                    |
| -------------------------------------------------- | ----------------------------------------- |
| `current_setting('app.user_role') = 'coordenador'` | `app_user_role_exigido() = 'coordenador'` |
| `current_setting('app.user_id')::uuid`             | `app_user_id_exigido()`                   |

### 2.2 `app_session_clinica_visivel` (user_role E user_id)

| Antes                                              | Depois                                    |
| -------------------------------------------------- | ----------------------------------------- |
| `current_setting('app.user_role') = 'coordenador'` | `app_user_role_exigido() = 'coordenador'` |
| `current_setting('app.user_id')::uuid`             | `app_user_id_exigido()`                   |

### 2.3 `app_salvar_config_emergencia` (user_role E user_id)

| Antes                                               | Depois                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `current_setting('app.user_role') <> 'coordenador'` | `app_user_role_exigido() <> 'coordenador'`                                          |
| `current_setting('app.user_role')` (msg)            | `app_user_role_exigido()`                                                           |
| `current_setting('app.user_id')::uuid`              | `app_user_id_atual()` (leniente — no COALESCE de `declarado_por`, NULL é aceitável) |

### 2.4 `app_salvar_cpf_cnpj_clinica` (user_role)

| Antes                                               | Depois                                     |
| --------------------------------------------------- | ------------------------------------------ |
| `current_setting('app.user_role') <> 'coordenador'` | `app_user_role_exigido() <> 'coordenador'` |
| `current_setting('app.user_role')` (msg)            | `app_user_role_exigido()`                  |

### 2.5 `app_desarquivar_paciente` (user_role E user_id)

| Antes                                         | Depois                             |
| --------------------------------------------- | ---------------------------------- |
| `current_setting('app.user_role') IN (...)`   | `app_user_role_exigido() IN (...)` |
| `(current_setting('app.user_id'))::uuid` (2x) | `app_user_id_exigido()`            |

### 2.6 `app_criar_alerta_risco` (user_id, forma leniente)

| Antes                                                                    | Depois                |
| ------------------------------------------------------------------------ | --------------------- |
| `nullif(current_setting('app.user_id', true), '')::uuid` (2 ocorrências) | `app_user_id_atual()` |

**Nota:** Esta função usa a forma leniente (`nullif(..., '')`) de propósito — os INSERTs de `alerta_risco_clinico` e `audit_log` aceitam `NULL` no `ator_id` e `atualizado_por`. Trocar por `app_user_id_atual()` é semanticamente idêntico e elimina o cast cru que sobrevive a um GUC malformado (que não é empty string).

---

## 3. Funções NÃO Tocadas (E Por Quê)

| Função                             | Motivo                                                                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app_purgar_paciente`              | Sem cast cru: usa `current_setting('app.user_id')::uuid` em INSERT audit, mas é chamada **apenas** via owner role (scripts). Fora do caminho `app_role`. |
| `app_purgar_report`                | Idem ao `app_purgar_paciente`.                                                                                                                           |
| `app_aplicar_snapshot`             | Idem — owner-only.                                                                                                                                       |
| `app_barreira_somente_leitura`     | Sem cast, sem GUC de user_role/user_id. Usa `app.clinic_id` apenas, já tratado na `0087`.                                                                |
| `app_assinatura_bloqueia_cadastro` | Idem — só `app.clinic_id`, tratado na `0087`.                                                                                                            |

---

## 4. Ampliação dos Testes Existentes

O arquivo `db/tests/clinic-id-helper-rls.int.test.ts` já tem a infraestrutura completa. Acrescentar:

1. **Caso de helpers lenientes:** `app_user_role_atual()` devolve `NULL` nos 3 estados ruins (ausente, vazio, lixo). `app_user_id_atual()` devolve `NULL` nos 4 estados ruins.
2. **Caso de helpers estritos:** `app_user_role_exigido()` levanta `P0001` nos 3 estados. `app_user_id_exigido()` levanta `P0001` nos 4 estados.
3. **Contraprovas:** devolvem o valor/uuid quando GUC bem formado.
4. **Guard de CI (conjunto exato):** novo array `FUNCOES_COM_HELPER_USER_ROLE` e `FUNCOES_COM_HELPER_USER_ID` com os mesmos princípios do `FUNCOES_COM_HELPER` existente.
5. **Guard de CI (negativo):** nenhuma função DEFINER pública usa cast cru de `app.user_id` nem `current_setting('app.user_role')` 1-arg.
