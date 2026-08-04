# Design Spec — Issue #89: Harmonização LGPD - Retenção de Backup (30d) vs. Expurgo da Fase 6

> **Status:** 🟢 Especificação Aprovada & Validada  
> **Data:** 02/08/2026  
> **Autor:** Tech Lead & Painel (Product Manager, Product Designer, Psicólogo Clínico)  
> **Issue GitHub:** [#89](https://github.com/romulosutil/Iris/issues/89)

---

## 1. Contexto de Negócio & Objetivos

### 1.1 O Problema
Na Fase 6, foi entregue a funcionalidade de eliminação/expurgo de dados no banco de dados ativo em atendimento a pedidos de titulares (Art. 18 LGPD). No entanto, o serviço de backup (`iris-backup`) mantém os dumps diários cifrados por 30 dias (`RETENTION_DAYS=30`). Dados eliminados do banco ativo continuam existindo nos backups por até 30 dias.

### 1.2 A Solução
Formalizar e justificar a retenção de 30 dias de backup perante a ANPD na Política de Retenção de Dados (`docs/legal/politica-retencao-dados.md`) e padronizar a resposta ao titular dos dados.

---

## 2. Especificação Legal & Processual

### 2.1 Justificativa Legal (`docs/legal/politica-retencao-dados.md`)
* A retenção de 30 dias de dumps de segurança cifrados é uma exigência de segurança da informação (LGPD Art. 46) para garantia de resiliência e recuperação de desastres (DRP).
* Dumps são cifrados com chave `age` e o acesso é estritamente restrito a operações de emergência.

### 2.2 Protocolo de Resposta ao Titular (`src/lib/lgpd/erasure-response.ts`)
Ao responder a um pedido de eliminação:
> *"Seus dados pessoais foram eliminados do banco de dados ativo da plataforma Iris em [Data/Hora]. Para fins de resiliência e recuperação de desastres, cópias de segurança cifradas são expurgadas automaticamente no ciclo de rotação em até 30 dias."*

---

## 3. Plano de Verificação

1. Atualização confirmada da documentação legal em `docs/legal/politica-retencao-dados.md`.
2. Testes de ciclo de vida (lifecycle rule) no MinIO/Oracle S3 confirmando que dumps antigos são deletados exatamente após 30 dias.
