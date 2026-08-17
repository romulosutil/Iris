# Design Spec — Issue #119: Prontuário Multidisciplinar Unificado & Audit Log de Acessos

> **Status:** 🟢 Especificação Aprovada & Validada  
> **Data:** 02/08/2026  
> **Autor:** Tech Lead & Painel (Product Manager, Product Designer, Psicólogo Clínico)  
> **Issue GitHub:** [#119](https://github.com/romulosutil/Iris/issues/119)

---

## 1. Contexto de Negócio & Objetivos

### 1.1 O Problema & Decisão de Produto

Existia uma discussão sobre restringir a visibilidade de dados psicológicos dentro do prontuário multidisciplinar (`visibility_level` restrito por disciplina).

Contudo, a decisão de produto travada em **02/08/2026 (Rômulo)** estabeleceu que:

1. No atendimento multidisciplinar (ABA + Fono + TO + Psicologia), todos os profissionais da equipe de cuidado vinculados à criança precisam enxergar **100% das informações clínicas**. Isso simplifica substituições de emergência, reduz a carga cognitiva e garante o acompanhamento holístico do paciente.
2. Perfis não clínicos (Recepção, Faturamento, Apoio Administrativo) devem ser **totalmente bloqueados** de acessar prontuários e notas de evolução.
3. Para atender ao sigilo profissional e aos órgãos reguladores (CFP, CFM, CFFa, CREFITO), a rastreabilidade será garantida por um **Audit Log de Acesso Clínico** (_"quem acessou qual prontuário e quando"_), em vez de restrições rígidas entre profissionais da equipe.

---

## 2. Visão dos Perfis Especialistas (Painel de Validação)

### 2.1 Visão do Psicólogo Clínico & Equipe Multidisciplinar

- **Acompanhamento Integrado:** Comportamentos em casa e na terapia da fala influenciam diretamente a sessão de psicologia e vice-versa. O prontuário unificado permite que a equipe atue em sinergia.
- **Resguardo Legal via Audit Log:** Saber que todo acesso ao prontuário é registrado de forma inalterável com ID do profissional, data e IP traz resguardo ético caso haja vazamento de informação.

### 2.2 Visão do Product Manager (PM)

- **Simplicidade de Regras & Baixo Erro:** Evita regras complexas de RLS por disciplina que poderiam causar falhas de permissão no meio de um atendimento ou durante uma substituição de terapeuta.
- **Segurança Administrativa:** Bloqueio rígido para papéis de recepção/faturamento previne acesso indevido por funcionários sem dever de sigilo de saúde.

---

## 3. Especificação Técnica & Arquitetura de Dados

### 3.1 Tabela de Auditoria de Acesso Clínico (`clinical_access_log`)

```typescript
// src/db/schema.ts
export const clinicalAccessLog = pgTable(
  "clinical_access_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patient.id, { onDelete: "cascade" }),
    resourceType: varchar("resource_type", { length: 50 }).notNull(), // 'SESSION_NOTE' | 'EVIDENCE' | 'REPORT'
    resourceId: uuid("resource_id").notNull(),
    accessedAt: timestamp("accessed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ipAddress: varchar("ip_address", { length: 45 }),
  },
  (t) => [
    index("clinical_access_patient_idx").on(t.patientId, t.accessedAt),
    index("clinical_access_user_idx").on(t.userId, t.accessedAt),
  ],
);
```

### 3.2 Bloqueio de Recepção via RLS no Postgres (`db/migrations/XXXX_rls_recepcao_prontuario.sql`)

As tabelas sensíveis (`session_note`, `evidence`, `patient_goal`, `family_report`) aplicam RLS restritivo para papéis não clínicos:

```sql
CREATE POLICY "Permitir leitura apenas para equipe clinica"
ON session_note FOR SELECT
USING (
  tenant_id = current_tenant_id() AND
  current_user_role() IN ('THERAPIST', 'COORDINATOR', 'CLINIC_OWNER')
);
```

### 3.3 Middleware de Log de Acesso (`src/lib/audit/clinical-access.ts`)

Sempre que a Server Action de visualização de diário ou prontuário é chamada por um terapeuta/coordenador, insere um registro assíncrono em `clinical_access_log`.

---

## 4. Análise Adversarial (Tech Lead Review)

| Ataque / Hipótese de Falha                                                                      | Mitigação no Design                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ataque 1:** A gravação do log de acesso pode degradar a performance da leitura do prontuário. | A gravação em `clinical_access_log` é feita de forma assíncrona/não-bloqueante via `waitUntil` ou transação secundária para não desacelerar a renderização da página. |
| **Ataque 2:** E se a recepção tentar acessar diretamente a Server Action via API endpoint?      | A verificação de papel (`current_user_role()`) é feita no nível do banco de dados via RLS, impedindo bypass na aplicação Next.js.                                     |

---

## 5. Plano de Verificação e Testes

1. **Teste RLS de Papéis (`db/tests/prontuario-roles-rls.int.test.ts`):**
   - Confirmar que `THERAPIST` e `COORDINATOR` leem o prontuário.
   - Confirmar que `RECEPTION` recebe erro de acesso negado pelo Postgres ao tentar ler `session_note`.
2. **Teste de Audit Log (`src/lib/audit/clinical-access.test.ts`):**
   - Validar a criação do registro em `clinical_access_log` ao abrir o prontuário de um paciente.
