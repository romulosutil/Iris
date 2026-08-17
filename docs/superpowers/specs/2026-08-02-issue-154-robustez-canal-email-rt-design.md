# Design Spec — Issue #154: Robustez do Canal de E-mail do Responsável Técnico (RT)

> **Status:** 🟢 Especificação Aprovada & Validada  
> **Data:** 02/08/2026  
> **Autor:** Tech Lead & Painel (Product Manager, Product Designer, Psicólogo Clínico)  
> **Issue GitHub:** [#154](https://github.com/romulosutil/Iris/issues/154)

---

## 1. Contexto de Negócio & Objetivos

### 1.1 O Problema

Na implementação do envio de e-mails de alerta de risco ao RT (Fase 5/6), identificou-se que falhas temporárias na API de e-mail (Resend HTTP 429/5xx) marcavam o alerta como falhado definitivamente na primeira tentativa. Além disso, exceções no laço de varredura em `scripts/escalonamento-risco.mjs` podiam abortar a checagem dos demais alertas pendentes.

### 1.2 A Solução

Implementar retry para falhas transitórias com contagem de tentativas, isolar os laços de notificação por alerta com `try/catch` individual e alinhar a função SQL `app_registrar_email_rt` com o filtro de `deletado_em IS NULL`.

---

## 2. Especificação Técnica & Refinamentos

### 2.1 Separação de Erro Transitório vs Definitivo

- **Transitório (HTTP 429/5xx, Timeout):** Grava `email_responsavel_tecnico_adiado` e incrementa contador de tentativas (teto max: 3). Na próxima varredura, o job retenta o envio.
- **Definitivo (E-mail inválido, Bounce 4xx):** Grava `email_responsavel_tecnico_falhou` e encerra tentativas.

### 2.2 Isolamento de Laço (`scripts/escalonamento-risco.mjs`)

```javascript
for (const p of pendentes) {
  try {
    await processarEmailRt(sql, p.alerta_id);
  } catch (err) {
    console.error(
      `[Escalonamento] Falha ao processar alerta ${p.alerta_id}:`,
      err,
    );
    // Continua a execução para os próximos alertas sem derrubar a varredura
  }
}
```

### 2.3 Ajustes na Migration SQL

Adicionar `AND deletado_em IS NULL` na função `app_registrar_email_rt` para consistência entre funções irmãs de banco.

---

## 3. Plano de Verificação

1. Teste unitário de retry com erro 500 do Resend (confirmar até 3 retentativas).
2. Teste de isolamento de exceção em `scripts/escalonamento-risco.test.mjs`.
