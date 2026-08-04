# Especificação Técnica — Issue #191: Trava Anti-Fraude de Trial & Validação de CPF (Paciente/Responsável)

**Data:** 03/08/2026  
**Issue GitHub:** [#191](https://github.com/romulosutil/Iris/issues/191)  
**Ref:** `BACKLOG.md` (Sessão 03/08/2026)  
**Escopo:** Implementação de validação algorítmica de CPF (do paciente ou responsável), controle de unicidade intra-clínica e hash cego cross-tenant para impedir abusos do período de trial (#175) e cadastros duplicados ou fictícios na apuração de faturamento (#36).

---

## 1. Contexto de Negócio & Motivação

### 1.1 O Problema
Atualmente, no modelo de trial ativado no 1º paciente (#175) e faturamento por paciente ativo (#36), existia a vulnerabilidade de fraude onde um usuário mal-intencionado poderia:
1. Cadastrar pacientes fictícios ou repetir cadastros para burlar/estender o trial de 14 dias.
2. Criar sucessivas contas de clínicas ("signups fakes") cadastrando a mesma pessoa para resetar o relógio de trial grátis.

### 1.2 A Solução
1. Exigir o CPF (do próprio paciente em adultos, ou do responsável legal em menores de idade) no formulário de cadastro (`/pacientes/novo`).
2. Validar o algoritmo oficial de dígitos verificadores (Módulo 11) no backend.
3. Impedir duplicatas dentro da mesma clínica via índice de unicidade SQL.
4. Aplicar **Hash Cego Salgado (`cpf_hash`)** para identificar CPFs que já consumiram trial grátis em contas passadas, bloqueando o trial gratuito sem violar o isolamento de dados da LGPD (Zero-Knowledge cross-tenant).

---

## 2. Modelagem de Dados (`src/db/schema.ts`)

```typescript
// Alterações na tabela patient:
export const patient = pgTable(
  "patient",
  {
    // ... campos existentes (id, clinicId, nome, nascimento, etc.) ...
    
    // CPF do paciente (para adultos - Issue #98) ou do responsável (para menores)
    cpf: text("cpf"), 
    responsavelCpf: text("responsavel_cpf"),

    // Hash cego salgado para verificação anti-fraude cross-tenant (LGPD compliant)
    // HMAC-SHA256(cpf_sanitizado, APP_SALT)
    cpfHash: text("cpf_hash"),
  },
  (t) => [
    index("idx_patient_clinic").on(t.clinicId),
    index("patient_clinic_arquivado_idx").on(t.clinicId, t.arquivadoEm),
    index("idx_patient_cpf_hash").on(t.cpfHash),
    unique("uq_patient_id_clinic").on(t.id, t.clinicId),
    // Índice de unicidade parcial por clínica (impede duplicar CPF no mesmo tenant)
    unique("uq_patient_clinic_cpf").on(t.clinicId, t.cpf),
  ]
);
```

---

## 3. Validação Algorítmica & Regras de Negócio

### 3.1 Módulo de Validação (`src/lib/cpf.ts`)
```typescript
/**
 * Sanitiza e valida um número de CPF utilizando o algoritmo oficial Módulo 11.
 */
export function validarEMaterializarCPF(input: string): { valido: boolean; cpfLimpo?: string; erro?: string } {
  const limpo = input.replace(/\D/g, "");
  if (limpo.length !== 11) return { valido: false, erro: "CPF deve conter exatamente 11 dígitos numéricos." };
  if (/^(\d)\1{10}$/.test(limpo)) return { valido: false, erro: "CPF inválido (sequência repetida)." };

  // Cálculo do 1º Dígito Verificador
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(limpo.charAt(i)) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(limpo.charAt(9))) return { valido: false, erro: "CPF inválido (dígito verificador incorreto)." };

  // Cálculo do 2º Dígito Verificador
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(limpo.charAt(i)) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(limpo.charAt(10))) return { valido: false, erro: "CPF inválido (dígito verificador incorreto)." };

  return { valido: true, cpfLimpo: limpo };
}
```

### 3.2 Geração de Hash Cego Anti-Abuso (`src/lib/security/cpf-hash.ts`)
```typescript
import { createHmac } from "crypto";

export function gerarCpfHash(cpfLimpo: string): string {
  const salt = process.env.CPF_HASH_SALT || "iris-anti-abuse-salt-2026";
  return createHmac("sha256", salt).update(cpfLimpo).digest("hex");
}
```

---

## 4. Integração com o Motor de Trial (#175) & Cadastro (#98)

1. **No Cadastro do Paciente (`/pacientes/novo`):**
   - Se for criança (TEA): Exigir `responsavel_cpf`.
   - Se for adulto (Terapia Convencional): Exigir `cpf`.
2. **Ao Ativar o Trial (1º Paciente):**
   - A Server Action calcula o `cpfHash` do 1º paciente.
   - Verifica na tabela global se o `cpfHash` já foi utilizado em um trial de outra clínica no passado.
   - Se o hash for inédito: inicia o trial de 14 dias normalmente.
   - Se o hash já tiver sido usado: impede a ativação do trial e notifica que a clínica requer assinatura do plano pago no Asaas (#36).

---

## 📊 Estado de Implementação
- **Especificação & Desenho de Segurança:** ✅ Concluído.
- **Migração SQL & Lógica no Backend:** 🚧 Pendente de implementação junto com as Issues #98, #175 e #36.
