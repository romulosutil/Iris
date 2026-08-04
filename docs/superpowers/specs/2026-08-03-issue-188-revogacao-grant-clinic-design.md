# Especificação Técnica — Issue #188: Revogação de GRANT de Escrita Herdado em Clinic (Débito D3)

**Data:** 03/08/2026  
**Issue GitHub:** [#188](https://github.com/romulosutil/Iris/issues/188)  
**Ref:** `BACKLOG.md` (Item D3)  
**Escopo:** Revogação de privilégios de mutação genéricos (`INSERT`, `UPDATE`) concedidos à role `app_role` na tabela `clinic`, com concessão cirúrgica restrita coluna a coluna para aplicar defesa em profundidade em colunas de faturamento como `isento_trial`.

---

## 🎯 Contexto & Motivação de Segurança

A tabela `clinic` herdou privilégios genéricos de `INSERT`/`UPDATE` para a role `app_role` (usada pelas conexões HTTP normais da aplicação).
Embora o RLS bloqueie modificações sem policy de escrita, a coluna `clinic.isento_trial` é a flag de faturamento que desativa o relógio de trial e a trava de cobrança.

Para evitar que uma eventual policy de escrita adicionada no futuro abra acidentalmente alteração em colunas de cobrança, aplicamos a **defesa em profundidade no nível de privilégio SQL (GRANT/REVOKE)**, exatamente como feito para a tabela `patient` (migração `0044`) e `app_user` (migração `0057`).

---

## 📊 Mapeamento de Colunas de `clinic`

### Colunas Restritas / Imutáveis para `app_role` (Protegidas)
- `id` (PK)
- `responsavel_conta_id` (Dono da conta)
- `is_demo` (Flag interna de ambiente demo)
- `trial_comeco_em` (Relógio de trial — mutável apenas via `app_iniciar_trial` `SECURITY DEFINER`)
- `trial_dias` (Teto de trial)
- `isento_trial` (Flag de faturamento — mutável apenas via `SECURITY DEFINER` pela role `iris_auth`)
- `criado_em` (Auditoria)

### Colunas Mutáveis para `app_role` (Permitidas para edição de perfil/configurações da clínica)
- `nome`
- `politica_retencao_meses`
- `politica_retencao_config`
- `timezone`
- `passo_grade_min`
- `duracao_disciplina`
- `faltas_limiar`
- `faltas_janela_semanas`
- `responsavel_tecnico_id`
- `protocolo_emergencia_interno`
- `protocolo_emergencia_declarado_em`
- `protocolo_emergencia_declarado_por`

---

## 🛠️ Desenho da Migração SQL (Padrão Drizzle + Postgres)

```sql
-- Revoga escrita global na tabela clinic para app_role
REVOKE INSERT, UPDATE ON clinic FROM app_role;
--> statement-breakpoint

-- Concede UPDATE estritamente nas colunas administrativas permitidas
GRANT UPDATE (
  nome,
  politica_retencao_meses,
  politica_retencao_config,
  timezone,
  passo_grade_min,
  duracao_disciplina,
  faltas_limiar,
  faltas_janela_semanas,
  responsavel_tecnico_id,
  protocolo_emergencia_interno,
  protocolo_emergencia_declarado_em,
  protocolo_emergencia_declarado_por
) ON clinic TO app_role;
```

---

## 📊 Estado de Implementação
- **Levantamento & Spec:** ✅ Concluído.
- **Migração SQL & _journal.json:** 🚧 Pendente de escrita/execução.
