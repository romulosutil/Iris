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
  const targetText = (findingsSectionMatch && findingsSectionMatch[1] ? findingsSectionMatch[1] : commentBody) || '';

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
    const body = comment.body || '';
    const match = body.match(/<!--\s*jules-auto-fix-attempt:\s*(\d+)\s*-->/);
    if (match && match[1]) {
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
