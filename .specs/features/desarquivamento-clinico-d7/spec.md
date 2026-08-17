# Especificação Técnica (Tech Lead Validated): Resolução do Débito D7 — Desarquivamento Automático por Registro Clínico Pleno

> **Débito Técnico:** D7 (`BACKLOG.md:38`)  
> **Issue GitHub:** [#174](https://github.com/romulosutil/Iris/issues/174)  
> **Status:** 🟢 Especificação Aprovada & Validada pelo Tech Lead  
> **Data:** 11/08/2026  
> **Princípio Pétreo:** Leitura/exportação são livres e não reativam; qualquer escrita clínica ativa reativa o paciente e audita a origem.

---

## 1. Diagnóstico do Tech Lead & Causa Raiz

### 1.1 O Fato Medido

Na concepção da Issue [#174](https://github.com/romulosutil/Iris/issues/174), a **Regra 6** foi estabelecida como a salvaguarda anti-fraude para o modelo de faturamento por paciente ativo:

> _"Se o sistema detectar o registro de atividade clínica para um paciente marcado como arquivado comercialmente (`arquivado_em IS NOT NULL`), deve desarquivá-lo automaticamente (`arquivado_em = NULL`) e registrar o evento em `audit_log`."_

O débito **D7** (`BACKLOG.md`) registrou a assimetria:

- Apenas o diário (`session_note` via `capturarDiario` e `consolidarSessao`) executava o desarquivamento.
- Outras superfícies clínicas onde o profissional atua sobre o prontuário (áudio local, correção de protocolos em sessão, aprovação de evidências de IA, validação de repertório, respostas a dúvidas clínicas, prescrição multidisciplinar, vinculação de protocolos e criação de metas terapêuticas) não disparavam a reativação.

### 1.2 Fronteira de Decisão: O que DEVE e o que NÃO DEVE Desarquivar

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🟢 ATOS CLÍNICOS ATIVOS (Disparam Regra 6 / Desarquivamento)                │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Diário de Sessão: Captura rápida e consolidação de sessão                │
│ 2. Mídia de Sessão: Registro de áudio local (`audio_capture`)                │
│ 3. Protocolos de Sessão: Ajuste manual de escopo (`session_protocol_scope`) │
│ 4. Evidências de IA: Aprovação/edição de extração em revisão (`evidence`)   │
│ 5. Validação de Repertório: Confirmação e reclassificação de evidências     │
│ 6. Dúvidas Clínicas: Resposta do terapeuta que fecha query de evidência     │
│ 7. Planejamento de Metas: Criação de meta terapêutica (`goal`)              │
│ 8. Encaixe de Protocolos: Ativação de protocolo de catálogo                 │
│ 9. Prescrição de Disciplinas: Prescrição/represcrição de carga horária      │
│ 10. Perfil Clínico: Registro/atualização de anamnese e ficha clínica        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🔴 ATOS NÃO-CLÍNICOS / CONSULTIVOS (NUNCA Desarquivam — Regra 4 de #174)    │
├─────────────────────────────────────────────────────────────────────────────┤
│ • Consulta/leitura de prontuário, linha do tempo e relatórios               │
│ • Exportação de PDF auditável / dossiê convênio                             │
│ • Ações administrativas de recepção (alterar endereço/contato/responsável)  │
│ • Visualização de gráficos e dashboards                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Matriz de Requisitos Funcionais (FRs)

- **FR1 (Domínio Centralizado):** Módulo `src/lib/patient/desarquivamento.ts` exportando `desarquivarPacienteSeArquivado(tx, ctx, patientId, origem)`.
- **FR2 (Atomicidade Transacional):** Toda chamada de desarquivamento deve ser executada estritamente dentro da transação `tx` (`withTenant`) da mutação clínica que a originou.
- **FR3 (Auditoria Estrita com Rastreabilidade de Origem):** Quando houver transição de `arquivado_em` de `NOT NULL` para `NULL`, gravar em `audit_log`:
  - `acao`: `'paciente_desarquivado_automaticamente'`
  - `entidade`: `'patient'`
  - `entidadeId`: `patientId`
  - `patientId`: `patientId`
  - `atorId`: `ctx.userId`
  - `detalhe`: `{ origem: OrigemDesarquivamento }`
- **FR4 (Idempotência sem Lock Inútil):** Um `SELECT id FROM patient WHERE id = patientId AND arquivado_em IS NOT NULL` prévio no RLS do chamador evita chamadas desnecessárias à procedure e previne contenção de concorrência.
- **FR5 (Cobertura Total dos 8 Pontos Clínicos):**
  1. `diario/[sessionId]/logic.ts` (`capturarDiarioCore`, `consolidarSessaoCore`, `registrarAudioLocalCore`, `corrigirEscopoProtocoloCore`)
  2. `revisao/[sessionId]/logic.ts` (`transicionar`)
  3. `validacao/logic.ts` (`confirmarEvidenciaCore`, `reclassificarEvidenciaCore`)
  4. `duvidas/logic.ts` (`responderQueryCore`)
  5. `pacientes/[id]/cadastro-clinico/protocolo-logic.ts` (`ativarProtocoloCore`)
  6. `pacientes/[id]/metas/logic.ts` (`criarMetaCore`)
  7. `pacientes/[id]/cadastro-clinico/prescricao-logic.ts` (`salvarPrescricaoCore`)
  8. `pacientes/[id]/cadastro-clinico/logic.ts` (`salvarFichaClinicaCore`)

---

## 3. Requisitos Não-Funcionais & Guardrails de Segurança (NFRs)

- **NFR1 (Zero Regressão de Permissões):** Terapeutas não ganham `UPDATE` direto na tabela `patient`. A reativação ocorre exclusivamente via `app_desarquivar_paciente` (`SECURITY DEFINER`, migração `0067`/`0088`), cuja autorização espelha a leitura e protege contra manipulação de outras colunas.
- **NFR2 (Tríplice Paridade Arquitetural):**
  - **Apuração de Fatura (`0075`):** mede `session`, `session_note`, `evidence`, `patient.criado_em`.
  - **Varredura de Inatividade 90d (`0080`):** mede `session`, `session_note`, `evidence`, `patient.criado_em`.
  - **Desarquivamento em Tempo Real (D7):** reativa o paciente no instante exato em que qualquer um desses eventos clínicos ou de planejamento ocorre.
- **NFR3 (Fail-Safe para Cobertura):** Terapeutas em cobertura de sessão (que não são da equipe fixa do paciente) não sofrem quebra de transação nem perda de dados durante seus registros.
