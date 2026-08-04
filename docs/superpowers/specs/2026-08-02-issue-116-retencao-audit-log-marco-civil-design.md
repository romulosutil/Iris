# Design Spec — Issue #116: Retenção de Logs de Aplicação (Marco Civil Art. 15)

> **Status:** 🟢 Especificação Aprovada & Validada  
> **Data:** 02/08/2026  
> **Autor:** Tech Lead & Painel (Product Manager, Product Designer, Psicólogo Clínico)  
> **Issue GitHub:** [#116](https://github.com/romulosutil/Iris/issues/116)

---

## 1. Contexto de Negócio & Objetivos

### 1.1 O Problema
A Lei 12.965/2014 (Marco Civil da Internet), em seu artigo 15, obriga os provedores de aplicação a manter os registros de acesso (IP, data/hora, identificador do usuário) sob sigilo pelo prazo mínimo de **6 meses**.

Atualmente, um pedido de exclusão de conta ou término de contrato com uma clínica poderia expurgar o histórico de `audit_log` prematuramente, violando a obrigação legal.

### 1.2 A Solução
Desatrelar o expurgo de `audit_log` da exclusão da conta do usuário ou tenant. Respaldado pelo Art. 7º, II da LGPD (*cumprimento de obrigação legal*), os eventos de autenticação e acesso na tabela `audit_log` permanecerão retidos por 6 meses antes da exclusão física definitiva.

---

## 2. Visão dos Perfis Especialistas (Painel de Validação)

### 2.1 Visão Jurídica & LGPD
* **Cumprimento de Obrigação Legal:** Prevalece sobre o direito de exclusão do titular durante o período de 6 meses (LGPD Art. 16, I).
* **Pseudonimização:** Caso o usuário solicite exclusão, os dados cadastrais diretos são pseudonimizados no banco, preservando apenas o hash do identificador e os dados técnicos de IP/timestamp exigidos pelo Marco Civil.

---

## 3. Especificação Técnica & Arquitetura

### 3.1 Job de Expurgo Desatrelado (`src/lib/jobs/expurgo-audit-log.ts`)

```sql
-- Procedure de expurgo de AuditLog (rodada diariamente)
DELETE FROM audit_log
WHERE criado_em < NOW() - INTERVAL '6 months';
```

### 3.2 Isolamento de Pseudonimização (`src/lib/auth/user-erasure.ts`)

Ao processar a exclusão de uma conta de usuário (`deleteUserAccount`):
1. Dados pessoais diretos em `user` (nome, e-mail, foto) são anonimizados.
2. Os registros em `audit_log` mantêm o `user_id` e `ip_address` intocados.
3. A exclusão física do `audit_log` só ocorrerá quando a linha atingir 180 dias de idade.

---

## 4. Análise Adversarial (Tech Lead Review)

| Ataque / Hipótese de Falha | Mitigação no Design |
|---|---|
| **Ataque 1:** E se a exclusão em cascata (FK CASCADE) da tabela `user` deletar o `audit_log`? | A Foreign Key `audit_log.user_id` é configurada como `ON DELETE SET NULL` ou mantida com um identificador de UUID pseudonimizado, impedindo a remoção em cascata. |

---

## 5. Plano de Verificação e Testes

1. **Teste de Expurgo (`src/lib/jobs/expurgo-audit-log.test.ts`):**
   * Validar que registros com 179 dias são preservados e registros com 181 dias são deletados.
2. **Teste de Exclusão de Usuário (`src/lib/auth/erasure-audit.test.ts`):**
   * Confirmar que deletar o usuário mantém as linhas de `audit_log` para cumprimento do Marco Civil.
