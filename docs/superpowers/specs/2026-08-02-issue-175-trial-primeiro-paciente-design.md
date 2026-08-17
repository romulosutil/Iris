# Design Spec — Issue #175: Relógio de Trial no 1º Paciente (Teto de 14 Dias)

> **Status:** 🟢 Especificação Aprovada & Validada  
> **Data:** 02/08/2026  
> **Autor:** Tech Lead & Painel (Product Manager, Product Designer, Psicólogo Clínico)  
> **Issue GitHub:** [#175](https://github.com/romulosutil/Iris/issues/175)

---

## 1. Contexto de Negócio & Objetivos

### 1.1 O Problema

Atualmente, o campo `clinic.trial_comeco_em` possui o valor padrão `now()` definido na criação da clínica (`src/db/schema.ts`). Isso significa que o relógio de 7 dias do trial começa a correr imediatamente no momento do cadastro (signup).

No entanto, o fluxo até a percepção de valor pelo cliente é cumulativo:
$$\text{Signup} \longrightarrow \text{Configura Clínica} \longrightarrow \text{Cadastra 1º Paciente} \longrightarrow \text{1ª Sessão} \longrightarrow \text{1º Diário} \longrightarrow \text{Extração/Relatório (VALOR)}$$

Quando o terapeuta leva 3 a 5 dias para cadastrar seu primeiro paciente, sobram apenas 2 a 4 dias de teste real. Em 7 dias corridos a partir do signup, o profissional gerou apenas 1 ou 2 diários por paciente e é confrontado com o término do trial sem nunca ter visto um relatório denso ou a linha do tempo de evidências consolidada.

### 1.2 Diagnóstico do Pré-Mortem

Essa assimetria foi diagnosticada no pré-mortem do modelo de cobrança (`BACKLOG.md` 01/08/2026): um trial que expira antes do tempo-até-o-valor (_time-to-value_) gera baixa conversão. A reação intuitiva seria cortar preço, quando a causa real é o relógio prematuro.

### 1.3 A Regra Solução

O relógio de trial deve iniciar na data do **1º paciente cadastrado**, com um teto de **14 dias a partir do signup** (o que ocorrer primeiro).

$$\text{InícioEfetivoTrial} = \text{COALESCE}(\text{trial\_comeco\_em}, \text{criado\_em} + 14 \text{ dias})$$

---

## 2. Visão dos Perfis Especialistas (Painel de Validação)

### 2.1 Visão do Product Manager (PM)

- **Retenção & Conversão:** Alinha o fim do trial com o momento de máximo valor percebido (terapeuta com diários e evidências geradas).
- **Proteção contra Trial Infinito:** O teto rígido de 14 dias garante que uma clínica criada e abandonada sem pacientes não mantenha status de trial aberto indefinidamente.
- **Métrica de Alerta (Pre-mortem):** Alertas para contas onde o trial expira com $< 5$ diários registrados (sinal de onboarding empacado).

### 2.2 Visão do Product Designer (UX)

- **Redução de Ansiedade:** O banner no topo do app deixará de exibir "Trial expira em X dias" no dia 1 (quando a clínica ainda está vazia).
- **Comunicação Transparente:** Quando a clínica for criada, o banner indicará: _"Seu trial de 7 dias começará assim que você cadastrar seu primeiro paciente (ou em até 14 dias)"_.
- **Gatilho Visual:** Ao cadastrar o 1º paciente, um toast/banner comemorativo informa o início oficial dos 7 dias de avaliação completa.

### 2.3 Visão do Psicólogo Clínico

- **Respeito à Rotina Clínica:** A rotina do terapeuta autônomo e da clínica é corrida. O cadastro da ficha clínica de um paciente real costuma ocorrer na véspera da primeira anamnese. Permitir que o relógio espere por esse momento respeita a dinâmica de trabalho real do profissional.

---

## 3. Especificação Técnica & Arquitetura de Dados

### 3.1 Alterações no Schema (`src/db/schema.ts`)

Alterar o campo `trial_comeco_em` na tabela `clinic` de `NOT NULL DEFAULT now()` para `NULLABLE`:

```typescript
// src/db/schema.ts - Tabela clinic
export const clinic = pgTable("clinic", {
  // ...
  trialComecoEm: timestamp("trial_comeco_em", { withTimezone: true }), // Nullable por padrão (sem default)
  trialDias: integer("trial_dias").notNull().default(7),
  // ...
});
```

### 3.2 Lógica de Cálculo de Status de Trial (`src/lib/billing/trial.ts`)

```typescript
export interface StatusTrial {
  ativo: boolean;
  expirado: boolean;
  diasRestantes: number;
  dataInicio: Date;
  dataFim: Date;
  aguardandoPrimeiroPaciente: boolean;
}

export function calcularStatusTrial(
  criadoEm: Date,
  trialComecoEm: Date | null,
  trialDias: number = 7,
  agora: Date = new Date(),
): StatusTrial {
  // Se ainda não cadastrou paciente, calcula a data limite do teto (14 dias pós signup)
  const dataTetoMaximo = new Date(
    criadoEm.getTime() + 14 * 24 * 60 * 60 * 1000,
  );

  let dataInicioEfetiva: Date;
  let aguardandoPrimeiroPaciente = false;

  if (trialComecoEm !== null) {
    dataInicioEfetiva = trialComecoEm;
  } else if (agora > dataTetoMaximo) {
    // Teto de 14 dias estourado sem cadastrar paciente
    dataInicioEfetiva = dataTetoMaximo;
  } else {
    // Ainda dentro da janela de 14 dias e sem pacientes cadastrados
    aguardandoPrimeiroPaciente = true;
    dataInicioEfetiva = agora; // Para fins de exibição relativa
  }

  const dataFim = new Date(
    dataInicioEfetiva.getTime() + trialDias * 24 * 60 * 60 * 1000,
  );
  const diffMs = dataFim.getTime() - agora.getTime();
  const diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (aguardandoPrimeiroPaciente) {
    return {
      ativo: true,
      expirado: false,
      diasRestantes: trialDias,
      dataInicio: dataInicioEfetiva,
      dataFim,
      aguardandoPrimeiroPaciente: true,
    };
  }

  const expirado = agora > dataFim;
  return {
    ativo: !expirado,
    expirado,
    diasRestantes: Math.max(0, diasRestantes),
    dataInicio: dataInicioEfetiva,
    dataFim,
    aguardandoPrimeiroPaciente: false,
  };
}
```

### 3.3 Disparo no Cadastro do 1º Paciente (`src/app/(app)/pacientes/novo/actions.ts`)

Na Server Action de criação de paciente, incluir verificação atomicamente dentro da transação do banco:

```typescript
// Dentro da criação de paciente
await db.transaction(async (tx) => {
  // 1. Inserir paciente...
  const [novoPaciente] = await tx.insert(patient).values({...}).returning();

  // 2. Verificar se a clínica possui trial_comeco_em nulo
  const [clinicaAtual] = await tx
    .select({ trialComecoEm: clinic.trialComecoEm })
    .from(clinic)
    .where(eq(clinic.id, clinicId));

  if (clinicaAtual && clinicaAtual.trialComecoEm === null) {
    await tx
      .update(clinic)
      .set({ trialComecoEm: sql`NOW()` })
      .where(eq(clinic.id, clinicId));
  }
});
```

---

## 4. Análise Adversarial (Tech Lead Review)

| Ataque / Hipótese de Falha                                                                                      | Mitigação no Design                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ataque 1:** Race condition com múltiplos pacientes criados simultaneamente no onboarding.                     | O `UPDATE clinic SET trial_comeco_em = NOW() WHERE trial_comeco_em IS NULL` na mesma transação é atômico no Postgres. O segundo insert encontra o valor já preenchido. |
| **Ataque 2:** E se uma clínica já existente no banco de produção ficar com `trial_comeco_em` nulo pós-migração? | A migração SQL incluirá um `UPDATE clinic SET trial_comeco_em = criado_em WHERE trial_comeco_em IS NULL;` para backfill seguro das contas legadas.                     |
| **Ataque 3:** Testes que usam `new Date()` real podem flutuar em CI no cálculo dos 14 dias/7 dias.              | A função `calcularStatusTrial` aceita o parâmetro injetável `agora: Date`, permitindo testes determinísticos sem depender de relógio de sistema.                       |
| **Ataque 4:** E se o cliente deletar/arquivar o 1º paciente? O relógio reinicia?                                | Não. Uma vez que `trial_comeco_em` é preenchido (diferente de `null`), ele nunca mais é zerado.                                                                        |

---

## 5. Plano de Verificação e Testes

1. **Teste Unitário (`src/lib/billing/trial.test.ts`):**
   - Caminho A: Paciente cadastrado no dia 3 pós-signup (trial expira no dia 10).
   - Caminho B: Nenhum paciente cadastrado após 20 dias (teto estourou no dia 14, trial expirado).
   - Caminho C: Clínica recém-criada (status `aguardandoPrimeiroPaciente = true`).
2. **Teste RLS (`db/tests/trial-rls.int.test.ts`):**
   - Garantir que a Server Action atualiza `trial_comeco_em` respeitando a `clinic_id` da sessão RLS.
3. **Validação de Mutação:**
   - Garantir que alterar a constante de teto de 14 para 13/15 dias quebre a suíte de testes.
