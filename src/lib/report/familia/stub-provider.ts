// StubFamilyReportProvider — gerador determinístico do rascunho de família,
// SEM LLM (demo/testes; nenhum dado sai da máquina). Honra as regras do Agente 2
// (docs/agente/agente-2-relatorio-familia.md): F1 (linguagem leiga), F2 (nunca
// inventa fato/número — tudo deriva da entrada), F3 (uma conquista), F6 (platô
// honesto), F8 (anexo de números separado). É trilho: a qualidade narrativa
// real vem do ClaudeProvider quando habilitado pós-DPA.
import type { FamilyReportDraft, FamilyReportInput } from "./types";
import type { FamilyReportProvider } from "./provider";

// Ordena níveis de ajuda do mais dependente (0) ao independente (maior).
// Chave por substring — o texto do agente varia ("dica física total",
// "independente", etc.). Desconhecido cai no meio (peso neutro).
function pesoIndependencia(nivel: string | null): number {
  if (!nivel) return 2;
  const n = nivel.toLowerCase();
  if (n.includes("independ")) return 5;
  if (n.includes("verbal") || n.includes("gestual")) return 3;
  if (n.includes("model")) return 2;
  if (n.includes("físic") || n.includes("fisic") || n.includes("total"))
    return 1;
  return 2;
}

export class StubFamilyReportProvider implements FamilyReportProvider {
  async gerar(input: FamilyReportInput): Promise<FamilyReportDraft> {
    const positivas = input.evidenciasAprovadas.filter(
      (e) => e.polaridade !== "negativa",
    );

    // F8 — contagem bruta por meta (deriva da entrada, sem interpretação).
    const contagem = new Map<string, number>();
    for (const e of input.evidenciasAprovadas) {
      contagem.set(e.metaOuDominio, (contagem.get(e.metaOuDominio) ?? 0) + 1);
    }
    const evidenciasPorMeta = [...contagem.entries()].map(([meta, c]) => ({
      meta,
      contagemPeriodo: c,
    }));

    // F6 — platô: sem evidência positiva nova → não força narrativa de progresso.
    const semAvanco = positivas.length === 0;

    // F3 — conquista-destaque: maior salto de independência entre as positivas
    // (desempate: comunicação > motor, aproximado por 'comunic'/'pedir'/'fala').
    const destaque = [...positivas].sort((a, b) => {
      const d =
        pesoIndependencia(b.nivelAjuda) - pesoIndependencia(a.nivelAjuda);
      if (d !== 0) return d;
      const comm = (m: string) => /comunic|pedir|fala|nome/i.test(m);
      return Number(comm(b.metaOuDominio)) - Number(comm(a.metaOuDominio));
    })[0];

    // destaque existe sse e só se há evidência positiva (⇔ !semAvanco).
    const conquistaDestaque = destaque
      ? `${input.crianca.nome} avançou em "${destaque.metaOuDominio}", precisando de menos ajuda do que antes.`
      : `Neste período o foco foi consolidar o que ${input.crianca.nome} já sabe fazer.`;

    // F5 — apoio em casa a partir dos reforçadores atuais (nunca genérico).
    const comoApoiarEmCasa: string[] = [];
    if (input.reforcadoresAtuais[0]) {
      comoApoiarEmCasa.push(
        `Aproveite o interesse de ${input.crianca.nome} por ${input.reforcadoresAtuais[0]}: espere alguns segundos antes de oferecer, dando espaço para ele(a) pedir do próprio jeito.`,
      );
    }
    if (destaque) {
      comoApoiarEmCasa.push(
        `Pratique "${destaque.metaOuDominio}" em momentos curtos da rotina de casa, do jeito que fazemos nos atendimentos.`,
      );
    }
    if (comoApoiarEmCasa.length === 0) {
      comoApoiarEmCasa.push(
        `Mantenha as rotinas de casa previsíveis e celebre as pequenas iniciativas de ${input.crianca.nome}.`,
      );
    }

    return {
      conquistaDestaque,
      trabalhandoAgora: input.metasAtivas.slice(0, 4),
      comoApoiarEmCasa: comoApoiarEmCasa.slice(0, 3),
      periodoSemAvancoVisivel: semAvanco,
      notaHonestidade: semAvanco
        ? `Este foi um período de consolidação: não vimos uma habilidade nova aparecer, e ${input.crianca.nome} seguiu no mesmo nível de ajuda de antes. Isso é normal dentro do processo e não significa retrocesso — vamos seguir de perto e avisar assim que houver uma mudança.`
        : null,
      anexoDados: {
        evidenciasPorMeta,
        avaliacoesFormaisPeriodo: input.avaliacoesFormais,
      },
      status: "rascunho_para_revisao",
    };
  }
}
