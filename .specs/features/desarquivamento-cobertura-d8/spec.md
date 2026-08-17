# Especificação Técnica (Tech Lead Validated): Resolução do Débito D8 — Desarquivamento por Terapeuta de Cobertura

> **Débito Técnico:** D8 (`BACKLOG.md:39`)  
> **Issue GitHub:** [#174](https://github.com/romulosutil/Iris/issues/174)  
> **Status:** 🟢 Especificação Aprovada & Validada pelo Tech Lead  
> **Data:** 11/08/2026  
> **Princípio Pétreo:** Qualquer ato clínico legítimo (incluindo cobertura/substituição de sessão) reativa o paciente arquivado automaticamente, preservando o isolamento multi-tenant e a rastreabilidade em `audit_log`.

---

## 1. Diagnóstico do Tech Lead & Causa Raiz

### 1.1 O Fato Medido

Na concepção da Issue [#174](https://github.com/romulosutil/Iris/issues/174), a **Regra 6** estabeleceu que qualquer atendimento ou registro clínico para paciente arquivado (`arquivado_em IS NOT NULL`) deve desarquivá-lo automaticamente (`arquivado_em = NULL`) e gravar um evento em `audit_log`.

No débito **D8** (`BACKLOG.md:39`):

- A procedure `app_desarquivar_paciente` (migração `0067`) restringiu a autorização estritamente a coordenadores, admin de recepção e membros da equipe fixa do paciente (`app_is_on_team(p_patient)`).
- Terapeutas de cobertura (designados para conduzir uma sessão via `session.terapeuta_id` ou `session.atendido_por_id`, mas que não constam em `care_team_membership`) possuem autorização clínica e RLS legítimo para conduzir a sessão e gravar notas (`session_note_insert`), porém eram barrados pela procedure com `RAISE EXCEPTION '... paciente fora da equipe do chamador'`.
- Para evitar que o lançamento de exceção abortasse a transação do diário do terapeuta de cobertura, foi introduzido um gate prévio via `SELECT ... FROM patient WHERE arquivado_em IS NOT NULL` sob o RLS do chamador em `desarquivamento.ts`. Como o terapeuta de cobertura não possui visibilidade global em `patient_select`, o gate retornava vazio (`false`) e o paciente permanecia arquivado silenciosamente, violando a Regra 6.

### 1.2 Fronteira de Decisão & Escopo de Cobertura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🟢 TERAPEUTA DE COBERTURA / SUBSTITUTO (Deve Desarquivar na Sessão)        │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Terapeuta designado como condutor da sessão (`session.terapeuta_id`)     │
│ 2. Terapeuta substituto registrado na sessão (`session.atendido_por_id`)    │
│ 3. Execução dentro da mesma clínica (`session.clinic_id = app_clinic_id`)   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🔴 TERAPEUTA NÃO AUTORIZADO (NÃO Pode Desarquivar — Falha Fechada)          │
├─────────────────────────────────────────────────────────────────────────────┤
│ • Terapeuta de outra clínica (violação multi-tenant -> RAISE EXCEPTION)     │
│ • Terapeuta sem vínculo de equipe E sem qualquer sessão com o paciente      │
│   (violação cross-team -> RAISE EXCEPTION)                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Matriz de Requisitos Funcionais (FRs)

- **FR1 (Autorização Ampliada na Procedure `SECURITY DEFINER`):** Atualizar `app_desarquivar_paciente(p_patient uuid)` para validar autorização se o chamador for coordenador/admin, membro da equipe (`app_is_on_team`) OU possuir sessão atribuída ao paciente na mesma clínica (`session.terapeuta_id = userId` ou `session.atendido_por_id = userId`).
- **FR2 (Desbloqueio do Helper de Domínio):** O helper `desarquivarPacienteSeArquivado` (`src/lib/patient/desarquivamento.ts`) deve invocar a procedure `app_desarquivar_paciente` de forma direta e atômica dentro da transação `tx`, garantindo que terapeutas de cobertura reativem o paciente e emitam `audit_log` normalmente.
- **FR3 (Auditoria Imutável com Atribuição Correta):** O registro em `audit_log` (`paciente_desarquivado_automaticamente`) deve gravar com precisão o `ator_id = ctx.userId` (o terapeuta de cobertura) e a respectiva `origem` clínica.
- **FR4 (Idempotência Estrita):** Múltiplas notas ou registros na mesma sessão de cobertura retornam `false` após a primeira execução e geram exatamente uma única linha de log de auditoria.
- **FR5 (Isolamento Multi-Tenant Inegociável):** Qualquer tentativa cross-tenant continua estourando erro de isolamento multi-tenant (`app_patient_in_clinic`).

---

## 3. Requisitos Não-Funcionais & Guardrails de Segurança (NFRs)

- **NFR1 (Zero Afrouxamento de RLS em `patient`):** Terapeutas continuam sem permissão de `UPDATE` direto na tabela `patient` (RLS `patient_update` inalterado). A mutação de `arquivado_em` permanece circunscrita à procedure `SECURITY DEFINER`.
- **NFR2 (Tríplice Paridade Arquitetural Mantida):** O paciente desarquivado pelo terapeuta de cobertura volta imediatamente a ser computado no ciclo de faturamento (`billing_apurar_ciclo`) e na varredura de auto-arquivamento (`app_auto_arquivar_pacientes`).
- **NFR3 (Fail-Closed Cross-Team):** Terapeutas que não possuem vínculo de equipe nem sessão agendada com o paciente continuam estritamente barrados de invocar o desarquivamento.
