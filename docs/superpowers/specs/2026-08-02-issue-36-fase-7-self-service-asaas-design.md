# Design Spec — Issue #36: Fase 7 - Integração de Billing com Asaas (Pix Automático & Paciente Ativo)

> **Status:** 🟢 Especificação Aprovada & Validada  
> **Data:** 02/08/2026  
> **Autor:** Tech Lead & Painel (Product Manager, Product Designer, Psicólogo Clínico)  
> **Issue GitHub:** [#36](https://github.com/romulosutil/Iris/issues/36)

---

## 1. Contexto de Negócio & Objetivos

### 1.1 O Problema
Na Fase 7, o Iris necessita de um sistema de cobrança recorrente automatizado para faturamento mensal por paciente ativo.

### 1.2 A Solução
Integração com o gateway **Asaas** via **Pix Automático (Jornada 3)** como trilho primário (sem limitação de valor fixo, aceitando cobrança variável apurada por paciente) e cartão de crédito como fallback.

---

## 2. Especificação Técnica & Arquitetura de Pagamentos

### 2.1 Fluxo Pix Automático Jornada 3
1. **Autorização sem Valor Fixo:** Solicitação de autorização sem o campo `value` preenchido no Asaas, permitindo cobrança variável mensal com base na quantidade de pacientes ativos apurados no ciclo.
2. **Janela de Apuração:** Apuração realizada entre 2 e 10 dias úteis antes do vencimento da fatura.
3. **Webhooks (`/api/hooks/asaas`):** Recepção dos eventos `PIX_AUTOMATIC_RECURRING_*` protegidos por token de cabeçalho (`ASAAS_WEBHOOK_TOKEN`).

### 2.2 Apuração de Pacientes Ativos
Count de pacientes vinculados à clínica onde `arquivado_em IS NULL AND deletado_em IS NULL`.

---

## 3. Plano de Verificação

1. Teste de webhook com payload simulado do Asaas em ambiente de Sandbox (`$aact_hmlg_`).
2. Teste de apuração de fatura com snapshot de pacientes ativos e arquivados.
