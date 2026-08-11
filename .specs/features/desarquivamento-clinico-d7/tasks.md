# Resolução D7 — Tarefas de Implementação (Tech Lead Validated)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o desarquivamento automático de pacientes comerciais em todos os fluxos de registro e planejamento clínico ativo (diário, áudio, escopo de sessão, evidências, dúvidas, protocolos, metas, prescrição e ficha clínica), consolidando o helper de domínio e fechando o débito técnico D7 no BACKLOG.

**Architecture:** Módulo central `src/lib/patient/desarquivamento.ts` que orquestra a chamada à função de banco `app_desarquivar_paciente` (SECURITY DEFINER) dentro da transação existente de cada mutação clínica, emitindo evento em `audit_log` apenas na transição de estado.

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL (SECURITY DEFINER functions, RLS), Vitest.

---

### Task 1: Criar o Módulo Central de Desarquivamento e Testes de Integração

**Files:**
- Create: `src/lib/patient/desarquivamento.ts`
- Create: `src/lib/patient/desarquivamento.int.test.ts`

- [x] **Step 1: Escrever o teste de integração para o helper central**

Criar `src/lib/patient/desarquivamento.int.test.ts` cobrindo:
1. Desarquivamento de paciente arquivado com emissão de `audit_log` contendo `acao: "paciente_desarquivado_automaticamente"` e a `origem` especificada.
2. Idempotência: paciente já ativo (`arquivado_em IS NULL`) retorna `false` e não insere `audit_log`.
3. Autorização: Coordenador e Terapeuta da Equipe desarquivam com sucesso.
4. Paciente fora do tenant/RLS: não gera erro e não altera o banco.

- [x] **Step 2: Rodar teste para verificar que falha**

Run: `pnpm vitest run src/lib/patient/desarquivamento.int.test.ts`
Expected: FAIL (módulo ainda não existe).

- [x] **Step 3: Implementar `src/lib/patient/desarquivamento.ts`**

Implementar a função `desarquivarPacienteSeArquivado` conforme `design.md`.

- [x] **Step 4: Rodar teste para verificar que passa**

Run: `pnpm vitest run src/lib/patient/desarquivamento.int.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/lib/patient/desarquivamento.ts src/lib/patient/desarquivamento.int.test.ts
git commit -m "feat(patient): centraliza helper de desarquivamento automatico de paciente"
```

---

### Task 2: Integrar o Helper no Módulo de Diário (Notas, Áudio e Escopo)

**Files:**
- Modify: `src/app/(app)/diario/[sessionId]/logic.ts`
- Modify/Test: `src/app/(app)/diario/[sessionId]/actions.int.test.ts`

- [x] **Step 1: Escrever testes para áudio local e ajuste de escopo**

Adicionar testes em `src/app/(app)/diario/[sessionId]/actions.int.test.ts` verificando que:
- `registrarAudioLocal` para paciente arquivado desarquiva e grava `audit_log` com `origem: "audio_local"`.
- `corrigirEscopoProtocolo` para paciente arquivado desarquiva e grava `audit_log` com `origem: "escopo_protocolo"`.

- [x] **Step 2: Atualizar `src/app/(app)/diario/[sessionId]/logic.ts`**

Importar `desarquivarPacienteSeArquivado` e acioná-lo em:
- `capturarDiarioCore` (`"registro_clinico"`)
- `consolidarSessaoCore` (`"registro_clinico"`)
- `corrigirEscopoProtocoloCore` (`"escopo_protocolo"`)
- `registrarAudioLocalCore` (`"audio_local"`)

- [x] **Step 3: Rodar testes de diário**

Run: `pnpm vitest run src/app/(app)/diario/[sessionId]/actions.int.test.ts`
Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add src/app/(app)/diario/[sessionId]/logic.ts src/app/(app)/diario/[sessionId]/actions.int.test.ts
git commit -m "refactor(diario): unifica desarquivamento em notas, audio local e escopo de sessao"
```

---

### Task 3: Integrar Desarquivamento na Aprovação de Evidências Clínicas (Revisão)

**Files:**
- Modify: `src/app/(app)/revisao/[sessionId]/logic.ts`
- Modify/Test: `src/app/(app)/revisao/[sessionId]/actions.int.test.ts`

- [ ] **Step 1: Escrever teste de integração de desarquivamento na revisão**

Adicionar teste em `actions.int.test.ts` verificando que aprovar extração de paciente arquivado reativa o paciente e grava evento de auditoria com origem `"aprovacao_evidencia"`.

- [ ] **Step 2: Implementar chamada em `revisao/[sessionId]/logic.ts`**

Dentro de `transicionar`, quando `novoEstado === "aprovada" || novoEstado === "editada"`, chamar `desarquivarPacienteSeArquivado(tx, ctx, sess.patientId, "aprovacao_evidencia")`.

- [ ] **Step 3: Rodar testes de revisão**

Run: `pnpm vitest run src/app/(app)/revisao/[sessionId]/actions.int.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/revisao/[sessionId]/logic.ts src/app/(app)/revisao/[sessionId]/actions.int.test.ts
git commit -m "feat(revisao): desarquiva paciente automaticamente ao aprovar evidencias clinicas"
```

---

### Task 4: Integrar Desarquivamento na Fila de Validação e Dúvidas de Evidência

**Files:**
- Modify: `src/app/(app)/validacao/logic.ts`
- Modify: `src/app/(app)/duvidas/logic.ts`
- Modify/Test: `src/app/(app)/validacao/actions.int.test.ts`

- [ ] **Step 1: Escrever testes de integração em `validacao/actions.int.test.ts`**

Testar que `confirmarEvidencia` e `reclassificarEvidencia` desarquivam o paciente com origem `"validacao_evidencia"`.

- [ ] **Step 2: Implementar chamadas em `validacao/logic.ts` e `duvidas/logic.ts`**

Adicionar `desarquivarPacienteSeArquivado(tx, ctx, e.patientId, "validacao_evidencia")` em `confirmarEvidenciaCore`, `reclassificarEvidenciaCore` e `responderQueryCore`.

- [ ] **Step 3: Rodar testes de validação**

Run: `pnpm vitest run src/app/(app)/validacao/actions.int.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/validacao/logic.ts src/app/(app)/duvidas/logic.ts src/app/(app)/validacao/actions.int.test.ts
git commit -m "feat(validacao): desarquiva paciente ao validar evidencias e responder duvidas"
```

---

### Task 5: Integrar Desarquivamento no Planejamento Clínico (Protocolos, Metas, Prescrição e Ficha)

**Files:**
- Modify: `src/app/(app)/pacientes/[id]/cadastro-clinico/protocolo-logic.ts`
- Modify: `src/app/(app)/pacientes/[id]/metas/logic.ts`
- Modify: `src/app/(app)/pacientes/[id]/cadastro-clinico/prescricao-logic.ts`
- Modify: `src/app/(app)/pacientes/[id]/cadastro-clinico/logic.ts`
- Test: `src/app/(app)/pacientes/[id]/cadastro-clinico/protocolo.int.test.ts`
- Test: `src/app/(app)/pacientes/[id]/metas/actions.int.test.ts`
- Test: `src/app/(app)/pacientes/[id]/cadastro-clinico/prescricao.int.test.ts`

- [ ] **Step 1: Escrever testes de integração**

Garantir testes cobrindo desarquivamento em:
- `ativarProtocolo` (`"ativacao_protocolo"`)
- `criarMeta` (`"criacao_meta"`)
- `salvarPrescricao` (`"prescricao_disciplina"`)
- `salvarFichaClinica` (`"ficha_clinica"`)

- [ ] **Step 2: Implementar chamadas nos módulos clínicos**

Adicionar `desarquivarPacienteSeArquivado` em cada função com sua respectiva origem.

- [ ] **Step 3: Rodar os testes de planejamento clínico**

Run: `pnpm vitest run src/app/(app)/pacientes/[id]/cadastro-clinico/protocolo.int.test.ts src/app/(app)/pacientes/[id]/metas/actions.int.test.ts src/app/(app)/pacientes/[id]/cadastro-clinico/prescricao.int.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/pacientes/[id]/cadastro-clinico/protocolo-logic.ts src/app/(app)/pacientes/[id]/metas/logic.ts src/app/(app)/pacientes/[id]/cadastro-clinico/prescricao-logic.ts src/app/(app)/pacientes/[id]/cadastro-clinico/logic.ts src/app/(app)/pacientes/[id]/cadastro-clinico/protocolo.int.test.ts src/app/(app)/pacientes/[id]/metas/actions.int.test.ts src/app/(app)/pacientes/[id]/cadastro-clinico/prescricao.int.test.ts
git commit -m "feat(paciente): desarquiva paciente em atos de prescricao, metas, protocolos e ficha clinica"
```

---

### Task 6: Atualizar BACKLOG e Verificação Geral do Repositório

**Files:**
- Modify: `BACKLOG.md`

- [ ] **Step 1: Atualizar entrada D7 no BACKLOG.md**

Marcar **D7** como **Fechado em 11/08/2026** detalhando a cobertura completa de desarquivamento por ato clínico.

- [ ] **Step 2: Rodar typecheck e suíte completa de testes**

Run: `pnpm typecheck`  
Run: `pnpm test`  
Expected: 0 erros de tipagem, 100% dos testes verdes.

- [ ] **Step 3: Commit**

```bash
git add BACKLOG.md
git commit -m "docs(backlog): fecha debito D7 com cobertura completa de desarquivamento clinico (#174)"
```
