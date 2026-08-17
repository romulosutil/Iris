# Design Spec — Issue #174: Arquivamento Comercial de Paciente (`arquivado_em`) & Auto-Arquivamento em 90 Dias

> **Status:** 🟢 Especificação Aprovada & Validada  
> **Data:** 02/08/2026  
> **Autor:** Tech Lead & Painel (Product Manager, Product Designer, Psicólogo Clínico)  
> **Issue GitHub:** [#174](https://github.com/romulosutil/Iris/issues/174)

---

## 1. Contexto de Negócio & Objetivos

### 1.1 O Problema

Na Fatia B de cobrança (`#159` / `#36`), a métrica de faturamento do Iris é **por paciente ativo/mês**. Decisão travada em 01/08/2026: _paciente ativo = cadastrado e não arquivado_ (apurado por snapshot no ciclo de cobrança).

Existia o risco de utilizar a coluna existente `patient.alta_em` (`src/db/schema.ts`) como chave de cobrança. **Essa fusão foi rejeitada**: `alta_em` é uma decisão exclusivamente clínica e dispara os prazos legais de guarda da LGPD e do CFM/CFP (18 anos a 20 anos) e o expurgo de dados da Fase 6. Se `alta_em` afetasse a cobrança, uma ação comercial (_"não quero mais pagar por esse paciente este mês"_) alteraria o regime de retenção jurídica de dados de saúde.

### 1.2 A Solução: Duas Colunas, Dois Significados

| Coluna                | Significado                          | Efeito Jurídico/Comercial                        |
| --------------------- | ------------------------------------ | ------------------------------------------------ |
| `alta_em` (já existe) | Decisão **clínica** do profissional  | Dispara relógio de retenção legal e expurgo LGPD |
| `arquivado_em` (nova) | Decisão **organizacional/comercial** | Remove o paciente da contagem da fatura          |

$$\text{Alta Clínica} \implies \text{Arquivamento Automático} \quad (\text{alta\_em} \neq \text{null} \implies \text{arquivado\_em} = \text{now}())$$
$$\text{Arquivamento Comercial} \centernot\implies \text{Alta Clínica}$$

---

## 2. Visão dos Perfis Especialistas (Painel de Validação)

### 2.1 Visão do Product Manager (PM)

- **Previsibilidade Financeira:** A clínica paga apenas pelos pacientes que está atendendo ativamente naquele ciclo.
- **Leitura e Exportação Preservadas:** Paciente arquivado **nunca** é apagado ou escondido dos relatórios históricos. Tentar cobrar pela guarda de dados que o profissional é obrigado por lei a manter incentivaria a mutilação de prontuários.
- **Proteção de Receita (Anti-Fraud):** Se o sistema detectar o registro de uma nova sessão ou diário para um paciente que está marcado como arquivado, dispara um evento no `audit_log` e desarquiva o paciente automaticamente (prevenindo que clínicas manipulem o status para fraudar a fatura).

### 2.2 Visão do Product Designer (UX)

- **Ação Clara no Prontuário:** Botão discreto no menu do paciente: "Arquivar Paciente (sair da cobrança)" com modal explicativo de que os dados históricos continuam 100% visíveis e exportáveis.
- **Filtros na Lista de Pacientes:** Abas "Ativos" (padrão) e "Arquivados".

### 2.3 Visão do Psicólogo Clínico

- **Segurança Ética:** Garante que o prontuário do paciente (evidências, diários, linha do tempo) permaneça intacto após a pausa ou encerramento dos atendimentos, assegurando a rastreabilidade histórica exigida pelos conselhos de classe.

---

## 3. Especificação Técnica & Arquitetura de Dados

### 3.1 DDL e Schema (`src/db/schema.ts`)

```typescript
// src/db/schema.ts - Tabela patient
export const patient = pgTable(
  "patient",
  {
    // ...
    altaEm: timestamp("alta_em", { withTimezone: true }),
    arquivadoEm: timestamp("arquivado_em", { withTimezone: true }), // Nova coluna
    // ...
  },
  (t) => [index("patient_clinic_arquivado_idx").on(t.clinicId, t.arquivadoEm)],
);
```

### 3.2 Regra de RLS e Leitura/Escrita (`db/migrations/XXXX_patient_arquivado_em.sql`)

O acesso ao paciente arquivado é **mantido idêntico ao paciente ativo** nas políticas de RLS (`tenant_id = current_tenant_id()`). Nenhuma política de RLS oculta registros baseada em `arquivado_em`.

### 3.3 Motor de Auto-Arquivamento em 90 Dias (`src/lib/jobs/auto-arquivamento.ts`)

Um job diário verifica pacientes ativos cuja última interação clínica (última `session_note`, `evidence` ou `patient_goal`) ocorreu há $\ge 90$ dias:

1. **Dia 83 (Aviso Prévio):** Emite notificação no app e alerta para o coordenador/terapeuta: _"O paciente X não possui registros há 83 dias e será arquivado automaticamente em 7 dias."_
2. **Dia 90 (Execução):** Preenche `arquivado_em = NOW()` e grava evento `PATIENT_AUTO_ARCHIVED` no `audit_log`.

### 3.4 Desarquivamento Automático por Nova Sessão (`src/app/(app)/diario/[sessionId]/actions.ts`)

Ao registrar uma nova sessão para paciente arquivado:

```typescript
if (paciente.arquivadoEm !== null) {
  await tx
    .update(patient)
    .set({ arquivadoEm: null })
    .where(eq(patient.id, pacienteId));

  await registrarAuditLog(tx, {
    action: "PATIENT_AUTO_UNARCHIVED_ON_SESSION",
    patientId: paciente.id,
    details: "Desarquivado automaticamente devido a novo registro de sessão",
  });
}
```

---

## 4. Análise Adversarial (Tech Lead Review)

| Ataque / Hipótese de Falha                                                                                                      | Mitigação no Design                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ataque 1:** Uma consulta de contagem de fatura pode usar `count(*)` simples e esquecer o filtro `WHERE arquivado_em IS NULL`. | A query oficial de apuração da fatura é encapsulada na função de banco `app_contar_pacientes_ativos_billing(clinic_id)` que aplica estritamente `WHERE arquivado_em IS NULL AND deletado_em IS NULL`. |
| **Ataque 2:** O job de 90 dias usa `NOW()` do sistema em vez de data injetável nos testes.                                      | O job recebe uma dependência de relógio `clock: () => Date`, garantindo testes de integração exatos para a regra de 89, 90 e 91 dias.                                                                 |
| **Ataque 3:** E se o usuário der alta clínica no paciente?                                                                      | A ação de alta `darAltaPaciente` executa no mesmo commit: `UPDATE patient SET alta_em = NOW(), arquivado_em = COALESCE(arquivado_em, NOW())`.                                                         |

---

## 5. Plano de Verificação e Testes

1. **Teste RLS (`db/tests/patient-arquivado-rls.int.test.ts`):**
   - Verificar se leitura e exportação continuam 100% acessíveis para paciente arquivado.
2. **Teste do Job de Auto-Arquivamento (`src/lib/jobs/auto-arquivamento.test.ts`):**
   - Injeção de datas para 89 dias (permanece ativo), 90 dias (arquivado), 91 dias (arquivado).
3. **Teste de Faturamento (`src/lib/billing/faturamento.test.ts`):**
   - Confirmar que paciente arquivado é excluído do snapshot de contagem da fatura.
