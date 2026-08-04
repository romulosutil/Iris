# Design Spec — Issue #99: Nicho TCC (Terapia Cognitivo-Comportamental)

> **Status:** 🟢 Especificação Aprovada & Validada  
> **Data:** 02/08/2026  
> **Autor:** Tech Lead & Painel (Product Manager, Product Designer, Psicólogo Clínico)  
> **Issue GitHub:** [#99](https://github.com/romulosutil/Iris/issues/99)

---

## 1. Contexto de Negócio & Objetivos

### 1.1 O Problema
A Terapia Cognitivo-Comportamental (TCC) é uma das abordagens clínicas mais utilizadas no mundo para atendimento de adolescentes e adultos. Diferente da Terapia Convencional (`#98`), a TCC é altamente estruturada e baseada em métricas — contudo, suas unidades de medida (pensamentos automáticos, distorções cognitivas, escalas de humor PHQ-9/GAD-7 e tarefas de casa) são totalmente distintas do catálogo de TEA (VB-MAPP, PEDI).

### 1.2 A Solução
Criar a especificação do protocolo de TCC no Iris, modelando o Registro de Pensamentos Automáticos (RPD) como estrutura de eventos no diário narrativo, integrando escalas públicas de humor (PHQ-9 e GAD-7) e acompanhando o cumprimento de tarefas de casa.

---

## 2. Visão dos Perfis Especialistas (Painel de Validação)

### 2.1 Visão do Psicólogo Clínico Especialista em TCC
* **RPD no Diário Narrativo:** Na sessão, o terapeuta anota o relato do paciente. O agente de IA extrai automaticamente a estrutura do RPD: *Situação $\rightarrow$ Pensamento Automático $\rightarrow$ Emoção (Intensidade 0-100%) $\rightarrow$ Categorização da Distorção Cognitiva $\rightarrow$ Resposta Racional*.
* **Escalas Isentas de Direitos Autorais:** Utilização de PHQ-9 (depressão) e GAD-7 (ansiedade), que são de domínio público, permitindo a geração de gráficos de evolução sintomática ao longo das semanas.

### 2.2 Visão do Product Designer (UX)
* **Visualização dos Cartões RPD:** Exibição elegante dos pensamentos automáticos reestruturados na linha do tempo do paciente.
* **Gráficos de Ansiedade/Depressão:** Gráfico de linha mostrando a pontuação do PHQ-9 e GAD-7 aplicados a cada 15 ou 30 dias.

---

## 3. Especificação Técnica & Modelagem de Dados

### 3.1 Schema de Eventos RPD (`src/lib/agent/tcc-schema.json`)

No output do agente para sessões TCC, os pensamentos reestruturados são extraídos na chave `registro_pensamentos`:

```json
{
  "protocolo": "TCC",
  "registros_pensamento": [
    {
      "situacao": "Apresentação de projeto no trabalho",
      "pensamento_automatico": "Vou travar e todos vão rir de mim",
      "emocao_nome": "Ansiedade",
      "emocao_intensidade_0_100": 85,
      "distorcao_cognitiva": "CATASTROFIZACAO",
      "resposta_racional": "Já apresentei 5 vezes este ano e correu tudo bem"
    }
  ],
  "tarefa_casa_status": "CONCLUIDA_PARCIALMENTE",
  "escalas_aplicadas": [
    { "sigla": "GAD-7", "pontuacao": 12, "classificacao": "Ansiedade Moderada" }
  ]
}
```

### 3.2 Tabela de Registro RPD (`tcc_thought_record`)

```typescript
// src/db/schema.ts
export const tccThoughtRecord = pgTable("tcc_thought_record", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id, { onDelete: "cascade" }),
  sessionNoteId: uuid("session_note_id").references(() => sessionNote.id),
  situacao: text("situacao").notNull(),
  pensamentoAutomatico: text("pensamento_automatico").notNull(),
  emocaoNome: varchar("emocao_nome", { length: 50 }),
  emocaoIntensidade: integer("emocao_intensidade"),
  distorcaoCognitiva: varchar("distorcao_cognitiva", { length: 50 }),
  respostaRacional: text("resposta_racional"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});
```

---

## 4. Análise Adversarial (Tech Lead Review)

| Ataque / Hipótese de Falha | Mitigação no Design |
|---|---|
| **Ataque 1:** A classificação da distorção cognitiva pela IA pode falhar ou divergir da visão do terapeuta. | Todas as distorções extraídas pelo agente entram com status `PENDENTE_REVISAO` na Fila de Validação do Coordenador/Terapeuta, permitindo alteração com um clique antes de consolidar. |
| **Ataque 2:** Violação de direitos autorais de escalas psicológicas comerciais (ex: BDI Beck). | A especificação proíbe expressamente o uso de escalas pagas/protegidas por copyright. Apenas PHQ-9 e GAD-7 (domínio público) são incluídos no padrão. |

---

## 5. Plano de Verificação e Testes

1. **Teste de Extração RPD (`src/lib/agent/tcc-extraction.test.ts`):**
   * Validar a extração correta de pensamentos automáticos e distorções a partir de diários narrativos de TCC.
