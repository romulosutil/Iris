# Jules Self-Healing Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o workflow automatizado `.github/workflows/jules-auto-fix.yml` que escuta a conclusão do `pr-review.yml`, analisa achados (`[BLOCKING]`, `[WARN]`, `[NIT]`), controla tentativas anti-loop (máximo 3) e aciona a API do Google Jules para auto-correção na branch do PR.

**Architecture:** Módulo utilitário modular e testado para parsing de comentários e geração de prompts do Jules (`src/lib/ci/jules-parser.ts`), integrado diretamente ao GitHub Actions via `.github/workflows/jules-auto-fix.yml` com concorrência `cancel-in-progress` e integração com `https://jules.googleapis.com/v1alpha/sessions`.

**Tech Stack:** TypeScript, Vitest, GitHub Actions (`workflow_run`), GitHub Script / Octokit, Google Jules REST API.

---

### Task 1: Parser de Achados do Jules e Lógica Anti-Loop

**Files:**
- Create: `src/lib/ci/jules-parser.ts`
- Test: `src/lib/ci/jules-parser.test.ts`

- [ ] **Step 1: Escrever testes unitários para detecção de achados, veredito e contador de tentativas**

```typescript
import { describe, it, expect } from 'vitest';
import {
  parseReviewFindings,
  calculateNextAttempt,
  buildJulesFixPrompt,
} from './jules-parser';

describe('jules-parser', () => {
  it('detecta achados [BLOCKING], [WARN] e [NIT]', () => {
    const comment = `
<!-- jules-pr-reviewer -->
## Summary
Revisão do PR.

## Findings
- **[BLOCKING]** Falha de isolamento multi-tenant em \`src/db/queries.ts:42\`.
- **[WARN]** Uso inadequado de UTC em \`src/app/logic.ts:15\`.
- **[NIT]** Ajustar tipagem do helper.

## Verdict
VERDICT: block
`;
    const result = parseReviewFindings(comment);
    expect(result.hasFindings).toBe(true);
    expect(result.blockingCount).toBe(1);
    expect(result.warnCount).toBe(1);
    expect(result.nitCount).toBe(1);
    expect(result.totalFindings).toBe(3);
    expect(result.findingsText).toContain('[BLOCKING]');
  });

  it('retorna hasFindings: false quando não há achados ou PR aprovado', () => {
    const comment = `
<!-- jules-pr-reviewer -->
## Summary
Código excelente, sem problemas.

## Findings
Nenhum achado identificado.

## Verdict
VERDICT: approve
`;
    const result = parseReviewFindings(comment);
    expect(result.hasFindings).toBe(false);
    expect(result.totalFindings).toBe(0);
  });

  it('calcula o número de tentativas e aplica teto máximo de 3', () => {
    const comments = [
      { body: '<!-- jules-auto-fix-attempt: 1 -->' },
      { body: '<!-- jules-auto-fix-attempt: 2 -->' },
    ];
    const attempt = calculateNextAttempt(comments);
    expect(attempt.currentAttempt).toBe(3);
    expect(attempt.canExecute).toBe(true);

    const maxComments = [
      { body: '<!-- jules-auto-fix-attempt: 1 -->' },
      { body: '<!-- jules-auto-fix-attempt: 2 -->' },
      { body: '<!-- jules-auto-fix-attempt: 3 -->' },
    ];
    const maxAttempt = calculateNextAttempt(maxComments);
    expect(maxAttempt.currentAttempt).toBe(4);
    expect(maxAttempt.canExecute).toBe(false);
  });

  it('constrói prompt estruturado com guardrails do Iris em PT-BR', () => {
    const prompt = buildJulesFixPrompt({
      branch: 'feature/auth-guard',
      findingsText: '- [BLOCKING] Corrigir RLS',
    });
    expect(prompt).toContain('app_clinic_id_exigido()');
    expect(prompt).toContain('Espectro Brutal');
    expect(prompt).toContain('pnpm typecheck');
    expect(prompt).toContain('feature/auth-guard');
  });
});
```

- [ ] **Step 2: Executar testes para verificar falha inicial**

Run: `pnpm test src/lib/ci/jules-parser.test.ts`
Expected: FAIL (módulo ainda não existe).

- [ ] **Step 3: Implementar `src/lib/ci/jules-parser.ts`**

```typescript
export interface ParseFindingsResult {
  hasFindings: boolean;
  blockingCount: number;
  warnCount: number;
  nitCount: number;
  totalFindings: number;
  findingsText: string;
}

export interface AttemptResult {
  currentAttempt: number;
  canExecute: boolean;
  maxAttempts: number;
}

export function parseReviewFindings(commentBody: string): ParseFindingsResult {
  if (!commentBody) {
    return {
      hasFindings: false,
      blockingCount: 0,
      warnCount: 0,
      nitCount: 0,
      totalFindings: 0,
      findingsText: '',
    };
  }

  const findingsSectionMatch = commentBody.match(/##\s+Findings([\s\S]*?)(?:##\s+Verdict|$)/i);
  const targetText = findingsSectionMatch ? findingsSectionMatch[1] : commentBody;

  const blockingMatches = targetText.match(/\[BLOCKING\]/gi) || [];
  const warnMatches = targetText.match(/\[WARN\]/gi) || [];
  const nitMatches = targetText.match(/\[(?:NIT|init)\]/gi) || [];

  const totalFindings = blockingMatches.length + warnMatches.length + nitMatches.length;

  return {
    hasFindings: totalFindings > 0,
    blockingCount: blockingMatches.length,
    warnCount: warnMatches.length,
    nitCount: nitMatches.length,
    totalFindings,
    findingsText: targetText.trim(),
  };
}

export function calculateNextAttempt(
  comments: Array<{ body?: string }>,
  maxAttempts = 3
): AttemptResult {
  let highestAttempt = 0;

  for (const comment of comments) {
    const match = (comment.body || '').match(/<!--\s*jules-auto-fix-attempt:\s*(\d+)\s*-->/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > highestAttempt) {
        highestAttempt = num;
      }
    }
  }

  const nextAttempt = highestAttempt + 1;
  return {
    currentAttempt: nextAttempt,
    canExecute: nextAttempt <= maxAttempts,
    maxAttempts,
  };
}

export function buildJulesFixPrompt(options: {
  branch: string;
  findingsText: string;
}): string {
  return `Você é o Jules, atuando como executor autônomo no repositório Iris para auto-correção de findings de code review.

TAREFA:
Corrija diretamente na branch os seguintes achados identificados na revisão do PR:

<FINDINGS>
${options.findingsText}
</FINDINGS>

DIRETRIZES E GUARDRAILS OBRIGATÓRIOS (conforme AGENTS.md e CLAUDE.md):
1. Idioma: Todas as mensagens de commit, comentários e artefatos devem ser estritamente em Português (PT-BR).
2. Validação: Execute e garanta que \`pnpm typecheck\`, \`pnpm lint\` e \`pnpm test\` passem com 100% de sucesso.
3. RLS e Isolamento Multi-tenant: Toda query/policy de isolamento deve utilizar \`app_clinic_id_exigido()\`. Nunca faça cast direto de current_setting em predicados.
4. Design System (Espectro Brutal): Nunca estilize elementos ad-hoc. Consuma apenas tokens e componentes oficiais.
5. Commits: Realize commits convencionais atômicos em PT-BR (ex: \`fix(auth): ajustar predicado de rls\`).
6. Branch de Trabalho: Submeta todas as alterações e commits diretamente na branch \`${options.branch}\`.`;
}
```

- [ ] **Step 4: Executar testes para verificar aprovação**

Run: `pnpm test src/lib/ci/jules-parser.test.ts`
Expected: PASS (4 tests passing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ci/jules-parser.ts src/lib/ci/jules-parser.test.ts
git commit -m "feat(ci): adicionar parser de findings e gerador de prompt do jules"
```

---

### Task 2: Criar Workflow `.github/workflows/jules-auto-fix.yml`

**Files:**
- Create: `.github/workflows/jules-auto-fix.yml`

- [ ] **Step 1: Criar o arquivo `.github/workflows/jules-auto-fix.yml` com integração completa**

```yaml
name: Jules Auto Fix
on:
  workflow_run:
    workflows: ["Jules PR Review"]
    types:
      - completed

concurrency:
  group: jules-auto-fix-${{ github.event.workflow_run.pull_requests[0].number || github.event.workflow_run.head_branch }}
  cancel-in-progress: true

jobs:
  auto-fix:
    runs-on: ubuntu-latest
    if: github.event.workflow_run.conclusion == 'success'
    permissions:
      pull-requests: write
      contents: write
      issues: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js & pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - name: Execute Jules Auto-Fix Evaluator
        uses: actions/github-script@v7
        env:
          JULES_API_KEY: ${{ secrets.JULES_API_KEY }}
          HEAD_BRANCH: ${{ github.event.workflow_run.head_branch }}
          HEAD_SHA: ${{ github.event.workflow_run.head_sha }}
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const { parseReviewFindings, calculateNextAttempt, buildJulesFixPrompt } = await import('${{ github.workspace }}/src/lib/ci/jules-parser.ts');

            const owner = context.repo.owner;
            const repo = context.repo.repo;
            const headBranch = process.env.HEAD_BRANCH;
            const headSha = process.env.HEAD_SHA;
            const julesApiKey = process.env.JULES_API_KEY;

            if (!julesApiKey) {
              console.log('JULES_API_KEY não configurada. Encerrando auto-fix.');
              return;
            }

            // 1. Resolução do PR
            let pr = context.payload.workflow_run.pull_requests && context.payload.workflow_run.pull_requests[0];
            if (!pr) {
              const { data: pulls } = await github.rest.pulls.list({
                owner,
                repo,
                state: 'open',
                head: `${owner}:${headBranch}`,
              });
              pr = pulls.find(p => p.head.sha === headSha) || pulls[0];
            }

            if (!pr) {
              console.log(`Nenhum PR aberto associado à branch ${headBranch}.`);
              return;
            }

            if (pr.draft) {
              console.log(`PR #${pr.number} está em estado Draft. Ignorando auto-fix.`);
              return;
            }

            // 2. Leitura dos comentários do PR
            const { data: comments } = await github.rest.issues.listComments({
              owner,
              repo,
              issue_number: pr.number,
            });

            const reviewComment = [...comments].reverse().find(c =>
              (c.body && (c.body.includes('<!-- jules-pr-reviewer -->') || c.body.includes('## Findings') || c.body.includes('Jules PR Reviewer')))
            );

            if (!reviewComment || !reviewComment.body) {
              console.log(`Nenhum comentário de revisão encontrado no PR #${pr.number}.`);
              return;
            }

            // 3. Parsing dos Findings
            const findings = parseReviewFindings(reviewComment.body);
            if (!findings.hasFindings) {
              console.log(`PR #${pr.number} não possui findings pendentes. Auto-fix não é necessário.`);
              return;
            }

            console.log(`Findings detectados: ${findings.blockingCount} BLOCKING, ${findings.warnCount} WARN, ${findings.nitCount} NIT.`);

            // 4. Verificação de Limite Anti-Loop
            const attempt = calculateNextAttempt(comments, 3);
            if (!attempt.canExecute) {
              const alertBody = `⚠️ **Jules Self-Healing Loop:** Limite de 3 tentativas de auto-cura atingido no PR #${pr.number}.\n\nIntervenção humana necessária para revisar e ajustar os achados pendentes.`;
              await github.rest.issues.createComment({
                owner,
                repo,
                issue_number: pr.number,
                body: alertBody,
              });
              console.log('Limite de tentativas atingido. Comentário de escalonamento publicado.');
              return;
            }

            // 5. Publicação do Comentário de Notificação no PR
            const notifyBody = `<!-- jules-auto-fix-attempt: ${attempt.currentAttempt} -->\n🔄 **Jules Self-Healing Loop (Tentativa ${attempt.currentAttempt}/3)**: Detectados ${findings.totalFindings} achados na revisão (${findings.blockingCount} blocking, ${findings.warnCount} warn, ${findings.nitCount} nit). Disparando sessão do Jules para auto-correção na branch \`${headBranch}\`...`;
            await github.rest.issues.createComment({
              owner,
              repo,
              issue_number: pr.number,
              body: notifyBody,
            });

            // 6. Resolução dinâmica do source na API do Jules
            let sourceName = `sources/github/${owner}/${repo}`;
            try {
              const sourcesRes = await fetch('https://jules.googleapis.com/v1alpha/sources', {
                headers: {
                  'x-goog-api-key': julesApiKey,
                },
              });
              if (sourcesRes.ok) {
                const sourcesData = await sourcesRes.json();
                if (sourcesData.sources && sourcesData.sources.length > 0) {
                  const match = sourcesData.sources.find(s =>
                    s.name?.includes(`${owner}/${repo}`) ||
                    (s.githubRepo && s.githubRepo.owner === owner && s.githubRepo.repo === repo)
                  );
                  if (match && match.name) {
                    sourceName = match.name;
                  }
                }
              }
            } catch (err) {
              console.warn('Erro ao consultar /sources do Jules, usando fallback padrão:', err);
            }

            // 7. Disparo da Sessão de Auto-Fix na API do Jules
            const prompt = buildJulesFixPrompt({
              branch: headBranch,
              findingsText: findings.findingsText,
            });

            const sessionPayload = {
              prompt,
              title: `Auto-fix PR #${pr.number} (Tentativa ${attempt.currentAttempt})`,
              sourceContext: {
                source: sourceName,
                githubRepoContext: {
                  startingBranch: headBranch,
                },
              },
            };

            const sessionRes = await fetch('https://jules.googleapis.com/v1alpha/sessions', {
              method: 'POST',
              headers: {
                'x-goog-api-key': julesApiKey,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(sessionPayload),
            });

            if (!sessionRes.ok) {
              const errText = await sessionRes.text();
              console.error('Falha ao criar sessão no Jules:', sessionRes.status, errText);
              await github.rest.issues.createComment({
                owner,
                repo,
                issue_number: pr.number,
                body: `❌ **Falha no Jules Self-Healing Loop:** Não foi possível disparar a sessão do Jules (HTTP ${sessionRes.status}).\n\`\`\`\n${errText}\n\`\`\``,
              });
              return;
            }

            const sessionData = await sessionRes.json();
            console.log('Sessão do Jules criada com sucesso:', sessionData.name || sessionData.id);
```

- [ ] **Step 2: Validar compilação e tipagem do TypeScript**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/jules-auto-fix.yml
git commit -m "feat(ci): criar workflow jules-auto-fix para self-healing loop"
```

---

### Task 3: Validação Completa e Testes do Repositório

**Files:**
- Test: `src/lib/ci/jules-parser.test.ts`

- [ ] **Step 1: Rodar suíte de testes unitários**

Run: `pnpm test`
Expected: 100% dos testes passando.

- [ ] **Step 2: Rodar lint e typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: 0 erros e 0 avisos bloqueantes.
