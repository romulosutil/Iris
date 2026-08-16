# Aviso por e-mail no cancelamento da assinatura (#312) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enviar aviso transacional por e-mail ao responsável da clínica no instante em que a assinatura é cancelada, informando o modo somente-leitura e o débito pro-rata em aberto (se houver) para reativação, sem carência e sem degradar a transação de faturamento.

**Architecture:** Módulo isolado `notificacao-cancelamento.ts` que resolve o destinatário (`clinic.responsavel_conta_id` → `app_user.email` com fallbacks seguros), calcula o total devido via `levantarDebito(subscriptionId)`, renderiza o template `criarTemplateAvisoCancelamentoAssinatura` e despacha via `enviarEmailTransacional`. O gatilho é acionado após o commit de transição em `aplicarStatusProvider` e no corte por carência/backstop em `revogarECortarAssinatura`, garantindo idempotência e tolerância total a falhas (falhas de envio nunca abortam o faturamento).

**Tech Stack:** TypeScript / Next.js Server Components / Drizzle ORM / Resend / Vitest

---

### Task 1: Template de e-mail de aviso de cancelamento

**Files:**

- Modify: `src/lib/email/templates.ts`
- Test: `src/lib/email/templates.test.ts`

- [ ] **Step 1: Escrever teste falhando para o template de aviso de cancelamento**

Criar `src/lib/email/templates.test.ts` cobrindo:

1. Renderização com `debitoCentavos > 0` (ex: 1300 centavos -> `R$ 13,00` e mensagem sobre quitar valor para reativar).
2. Renderização com `debitoCentavos === 0` (sem menção a valor devido).
3. Escape correto de caracteres HTML no `nomeClinica` e `nomeResponsavel` (prevenção de injeção XSS).
4. Inclusão da URL de assinatura (`urlAssinatura`).

- [ ] **Step 2: Rodar o teste para verificar que falha**

Run: `pnpm vitest run src/lib/email/templates.test.ts`
Expected: FAIL com "criarTemplateAvisoCancelamentoAssinatura is not a function"

- [ ] **Step 3: Implementar `criarTemplateAvisoCancelamentoAssinatura` em `src/lib/email/templates.ts`**

Adicionar função que renderiza layout com identidade visual do Iris, copy em pt-BR empática e direta, informando:

- Acesso somente-leitura imediato (dados e exportação livres);
- Valor em aberto do ciclo interrompido (quando `debitoCentavos > 0`);
- Reativação exige quitar esse valor;
- Caminho para reativar caso tenha sido cancelado por engano.

- [ ] **Step 4: Rodar o teste para verificar que passa**

Run: `pnpm vitest run src/lib/email/templates.test.ts`
Expected: PASS

- [ ] **Step 5: Commit atômico**

```bash
git add src/lib/email/templates.ts src/lib/email/templates.test.ts
git commit -m "feat(email): adiciona template de aviso de cancelamento de assinatura (#312)"
```

---

### Task 2: Serviço de notificação de cancelamento

**Files:**

- Create: `src/lib/billing/notificacao-cancelamento.ts`
- Test: `src/lib/billing/notificacao-cancelamento.test.ts`

- [ ] **Step 1: Escrever teste unitário para `notificarCancelamentoAssinatura`**

Criar `src/lib/billing/notificacao-cancelamento.test.ts` cobrindo:

1. Resolução do destinatário via `clinic.responsavel_conta_id` → `app_user.email`.
2. Fallback para `clinic.emailFinanceiro` e para usuário com papel `coordenador` quando `responsavelContaId` não existir.
3. Não lançamento de erro quando nenhum destinatário for encontrado (log de aviso + `{ enviado: false, motivo: "destinatario_nao_encontrado" }`).
4. Consulta do débito correto via `levantarDebito` e passagem ao template.
5. Tolerância a falhas: se `enviarEmailTransacional` falhar, retorna `{ enviado: false }` e não lança exceção.

- [ ] **Step 2: Rodar o teste para verificar que falha**

Run: `pnpm vitest run src/lib/billing/notificacao-cancelamento.test.ts`
Expected: FAIL com "module not found"

- [ ] **Step 3: Implementar `src/lib/billing/notificacao-cancelamento.ts`**

Implementar `notificarCancelamentoAssinatura(clinicId: string, subscriptionId: string): Promise<{ enviado: boolean; motivo?: string }>`:

- Utiliza `authDb` (sem tenant GUC, pois roda no contexto de billing/webhook);
- Busca clínica e responsável / email financeiro / coordenador;
- Levanta débito usando `levantarDebito(subscriptionId)`;
- Monta URL com `getAppBaseUrl() + "/assinatura"`;
- Envia via `enviarEmailTransacional`;
- Trata qualquer exceção de forma fail-safe (nunca lança para o chamador).

- [ ] **Step 4: Rodar o teste para verificar que passa**

Run: `pnpm vitest run src/lib/billing/notificacao-cancelamento.test.ts`
Expected: PASS

- [ ] **Step 5: Commit atômico**

```bash
git add src/lib/billing/notificacao-cancelamento.ts src/lib/billing/notificacao-cancelamento.test.ts
git commit -m "feat(billing): adiciona servico de notificacao de cancelamento (#312)"
```

---

### Task 3: Integração do disparo no ciclo de cancelamento e testes de idempotência

**Files:**

- Modify: `src/lib/billing/subscription.ts`
- Create: `src/lib/billing/notificacao-cancelamento.int.test.ts`

- [ ] **Step 1: Escrever teste de integração para o disparo e idempotência**

Criar `src/lib/billing/notificacao-cancelamento.int.test.ts` cobrindo:

1. Disparo de e-mail na transição para `canceled` em `aplicarStatusProvider`.
2. Idempotência: reentrega de webhook com status já `canceled` NÃO dispara segundo e-mail.
3. Disparo no corte por carência / backstop (`cancelarAssinaturasComCarenciaVencida`).
4. Isolamento: falha no envio do e-mail não reverte o congelamento do ciclo nem o status da assinatura.

- [ ] **Step 2: Rodar o teste para verificar que falha**

Run: `pnpm vitest run src/lib/billing/notificacao-cancelamento.int.test.ts`
Expected: FAIL (disparo ainda não conectado)

- [ ] **Step 3: Conectar `notificarCancelamentoAssinatura` em `src/lib/billing/subscription.ts`**

1. Em `aplicarStatusProvider`:
   Detectar `virandoCancelada = novo === "canceled" && linha.status !== "canceled"`.
   Após o commit de `congelarCiclosComoDebito`, disparar `await notificarCancelamentoAssinatura(linha.clinicId, linha.id)`.
2. Em `revogarECortarAssinatura`:
   Após o commit da transação de corte e congelamento, disparar `await notificarCancelamentoAssinatura(assinatura.clinicId, assinatura.subscriptionId)`.
   Ambos protegidos por try/catch para garantir zero impacto no billing.

- [ ] **Step 4: Rodar o teste para verificar que passa**

Run: `pnpm vitest run src/lib/billing/notificacao-cancelamento.int.test.ts`
Expected: PASS

- [ ] **Step 5: Commit atômico**

```bash
git add src/lib/billing/subscription.ts src/lib/billing/notificacao-cancelamento.int.test.ts
git commit -m "feat(billing): conecta disparo de aviso por e-mail no cancelamento (#312)"
```

---

### Task 4: Validação completa, formatação e PR

**Files:**

- All modified files

- [ ] **Step 1: Executar typecheck e linter**

Run: `pnpm typecheck && pnpm lint`
Expected: 0 errors

- [ ] **Step 2: Executar suite de testes de billing e e-mail**

Run: `pnpm vitest run src/lib/billing src/lib/email`
Expected: 100% passing

- [ ] **Step 3: Executar formatação**

Run: `pnpm format`

- [ ] **Step 4: Push da branch e criação do PR**

Run: `git push -u origin feat/312-aviso-email-cancelamento`
Run: `gh pr create --title "feat(billing): aviso por e-mail no cancelamento da assinatura (#312)" --body "..." --draft`
