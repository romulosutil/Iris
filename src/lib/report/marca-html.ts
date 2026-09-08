// #258 (D9) — cabeçalho institucional e selo Iris nos relatórios HTML→PDF.
//
// Função PURA — mesmo contrato dos `build-html.ts` que a consomem: não toca DB,
// não faz rede. A marca chega já lida (`lerMarcaClinica`) pelo caminho de
// export, nunca é buscada daqui.
//
// ORDEM DE PRECEDÊNCIA, que é o ponto inteiro desta feature: a marca da clínica
// entra POR CIMA (cabeçalho) e o selo do Iris entra POR BAIXO (rodapé), e o
// rodapé é emitido incondicionalmente. Não existe parâmetro, flag ou valor de
// marca que o suprima — `rodapeIrisHtml()` sequer recebe a marca.
import { escapeHtml } from "./sanitize";
import {
  logoComoDataUri,
  SELO_IRIS,
  type MarcaClinica,
} from "../branding/marca";

/** Cor do cabeçalho quando a clínica não configurou a sua. Grafite do DS. */
const COR_NEUTRA = "#1a1a1a";

/**
 * CSS do cabeçalho/rodapé institucional. Fica separado do `<style>` de cada
 * template porque os três (família, convênio bruto, convênio narrativo) têm
 * escalas tipográficas diferentes e só compartilham esta faixa.
 */
export function marcaCssHtml(marca: MarcaClinica | null | undefined): string {
  const cor = marca?.corPrimaria ?? COR_NEUTRA;
  return `
  .marca-clinica{display:flex;align-items:center;gap:12px;border-bottom:3px solid ${cor};padding-bottom:8px;margin-bottom:16px}
  .marca-clinica img{max-height:56px;max-width:180px;object-fit:contain}
  .marca-clinica .nome{font-weight:700;font-size:15px;color:${cor}}
  .selo-iris{margin-top:20px;border-top:1px solid #999;padding-top:6px;font-size:9px;color:#333;letter-spacing:.02em}
`;
}

/**
 * Cabeçalho da clínica. Some por completo quando não há marca configurada —
 * uma faixa vazia com o nome do Iris seria pior que nenhuma faixa.
 *
 * O logotipo vira `data:` URI porque o sandbox de render (`playwright-renderer.ts`)
 * publica `img-src 'self' data:`: uma URL remota é bloqueada pelo Blink antes
 * de virar requisição e o PDF sai sem logotipo, sem erro.
 */
export function cabecalhoMarcaHtml(
  marca: MarcaClinica | null | undefined,
): string {
  if (!marca) return "";
  const dataUri = logoComoDataUri(marca);
  const temNome = marca.nomeClinica.trim() !== "";
  if (!dataUri && !temNome && !marca.corPrimaria) return "";

  // `alt` descreve a função da imagem, não repete o nome que já está ao lado
  // como texto — leitor de tela leria duas vezes.
  const img = dataUri
    ? `<img src="${dataUri}" alt="Logotipo da clínica ${escapeHtml(marca.nomeClinica)}">`
    : "";
  const nome = temNome
    ? `<span class="nome">${escapeHtml(marca.nomeClinica)}</span>`
    : "";
  return `<header class="marca-clinica">${img}${nome}</header>`;
}

/**
 * Selo de integridade da plataforma. INVIOLÁVEL (guardrail 3 da #258):
 * não recebe `marca` como parâmetro justamente para que nenhuma configuração
 * de clínica consiga alterá-lo, desligá-lo ou reescrevê-lo.
 */
export function rodapeIrisHtml(): string {
  return `<p class="selo-iris">${escapeHtml(SELO_IRIS)}</p>`;
}
