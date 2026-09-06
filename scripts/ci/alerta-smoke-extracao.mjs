/**
 * Composição do alerta do smoke agendado do provider de extração (#510).
 *
 * POR QUE ISTO SAIU DE DENTRO DO `github-script` (#524): o corpo da issue era
 * único e afirmava, em toda falha, que "o caminho de produção da extração não
 * conseguiu completar uma chamada real ao Gemini". Só que o passo que falhou
 * seis dias seguidos (01→06/09/2026) foi a CHECAGEM DO SEGREDO — o smoke nunca
 * chegou a perguntar nada ao Google. A issue #524 nasceu, portanto, afirmando
 * uma causa que ninguém mediu, exatamente o modo de falha que os comentários
 * do próprio workflow dizem evitar ao escopar o `if:`.
 *
 * As duas falhas são DIAGNÓSTICOS DIFERENTES e por isso ganham TÍTULOS
 * diferentes — o dedup do workflow casa por título, então títulos distintos
 * mantêm duas linhas separadas: uma sobre o smoke estar inerte, outra sobre o
 * provider estar quebrado. Se uma quebra real do Gemini chegasse como
 * comentário numa issue cujo corpo é a afirmação errada, ela seria lida como
 * "mais um dia do mesmo" e enterrada.
 *
 * Função pura de propósito: recebe o resultado do passo e devolve texto. Quem
 * fala com a API do GitHub é o workflow.
 */

/** Smoke não rodou: não sabemos NADA sobre a saúde do provider. */
export const TITULO_SEGREDO_AUSENTE =
  "Smoke do provider de extração não roda — GOOGLE_API_KEY ausente no repositório";

/** Smoke rodou e a chamada real ao Gemini falhou. */
export const TITULO_PROVIDER_QUEBRADO =
  "Smoke do provider de extração falhou — extração de produção pode estar quebrada";

function corpoSegredoAusente(url, agora) {
  return [
    `O smoke agendado do provider real de extração NÃO RODOU em ${agora}.`,
    "",
    "**Passo que falhou:** a checagem do segredo `GOOGLE_API_KEY`, antes da chamada ao Gemini.",
    "",
    `**Run:** ${url}`,
    "",
    "## O que isso significa — e o que NÃO significa",
    "",
    "O smoke parou antes de perguntar qualquer coisa ao Google. Este alerta, portanto, **não diz que a extração de produção está quebrada** e também **não diz que está sã**: nada foi medido.",
    "",
    "O que ele diz é que a proteção da #510 está **inerte**. Enquanto o segredo não existir, uma aposentadoria de id de modelo pelo Google (foi o que aconteceu em 31/08/2026, PR #508) passa sem ser detectada, e o primeiro sinal seria a extração de produção caindo em `pendente_reprocessamento` sem erro visível para a terapeuta.",
    "",
    "## Correção",
    "",
    "Configurar o segredo em **Settings → Secrets and variables → Actions → New repository secret**, com o nome `GOOGLE_API_KEY` e a chave da Google AI Studio. Nenhum deploy de código é necessário.",
    "",
    "Para conferir que resolveu sem esperar o cron das 09:00 UTC: **Actions → Smoke do provider de extração → Run workflow**. O run seguinte tem que chegar no passo `Smoke do provider de extração`.",
    "",
    "_Issue aberta automaticamente por `.github/workflows/smoke-provider-extracao.yml` (#510)._",
  ].join("\n");
}

function corpoProviderQuebrado(url, agora) {
  return [
    `O smoke agendado do provider real de extração falhou em ${agora}.`,
    "",
    "**Passo que falhou:** a chamada real ao Gemini — o segredo estava configurado e o smoke chegou a rodar.",
    "",
    `**Run:** ${url}`,
    "",
    "## O que isso provavelmente significa",
    "",
    "O caminho de produção da extração (`resolveProvider` → `LlmExtractionProvider` → `createGeminiInvoker`) não conseguiu completar uma chamada real ao Gemini. As causas mais prováveis, em ordem:",
    "",
    "1. **Id de modelo aposentado pelo Google** (foi o que aconteceu em 31/08/2026, PR #508). O log do run mostra `404 NOT_FOUND ... is no longer available`. Correção: setar `GOOGLE_EXTRACTION_MODEL` no Easypanel com o id novo (sem deploy de código) e atualizar `MODELO_EXTRACAO_PADRAO` em `src/lib/extraction/provider.ts`.",
    "2. **Chave sem cota ou revogada** — `429` ou erro de autenticação no log.",
    "3. **Contrato da ferramenta recusado** — o schema derivado de `agentOutputObjectSchema` deixou de ser aceito pela API.",
    "",
    "## Urgência",
    "",
    "Se for (1) ou (2), **toda extração de produção está caindo em `pendente_reprocessamento` agora** — a nota do diário é salva, mas nenhuma extração é gerada. Não é visível para a terapeuta como erro.",
    "",
    "_Issue aberta automaticamente por `.github/workflows/smoke-provider-extracao.yml` (#510)._",
  ].join("\n");
}

/**
 * @param {object} entrada
 * @param {string} entrada.passoSegredo `outcome` do passo `segredo` — `failure`
 *   quando o segredo está ausente e o smoke não chegou a rodar.
 * @param {string} entrada.url URL do run que falhou.
 * @param {string} entrada.agora Timestamp ISO do momento da falha.
 * @returns {{ titulo: string, corpo: string, comentario: string }}
 */
export function montarAlerta({ passoSegredo, url, agora }) {
  if (passoSegredo === "failure") {
    return {
      titulo: TITULO_SEGREDO_AUSENTE,
      corpo: corpoSegredoAusente(url, agora),
      comentario: `Segredo continua ausente — o smoke não rodou de novo, nada foi medido sobre o provider. Run: ${url}`,
    };
  }

  return {
    titulo: TITULO_PROVIDER_QUEBRADO,
    corpo: corpoProviderQuebrado(url, agora),
    comentario: `A chamada real ao Gemini falhou de novo. Run: ${url}`,
  };
}
