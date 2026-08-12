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

  it('detecta variações de grafia como [init] ou minúsculas', () => {
    const comment = `
## Findings
- [init] Renomear variável interna.
- [blocking] Corrigir SQL injection.
- [warn] Validar payload nulo.
`;
    const result = parseReviewFindings(comment);
    expect(result.hasFindings).toBe(true);
    expect(result.blockingCount).toBe(1);
    expect(result.warnCount).toBe(1);
    expect(result.nitCount).toBe(1);
    expect(result.totalFindings).toBe(3);
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
