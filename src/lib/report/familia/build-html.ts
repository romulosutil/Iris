// Template HTML do Relatório de Família (Fase 5 · Fatia 4). Função PURA — não
// toca DB. Tom leigo e caloroso (F1/F7). Todo texto livre passa por escapeHtml;
// sem <script>, sem asset remoto (o sandbox SSRF da Fatia 3 já bloqueia rede, o
// HTML não deve nem tentar). Renderiza o draft curado; cai no rascunho da IA se
// ainda não houver curadoria.
import { escapeHtml } from "../sanitize";
import type { FamilyReportDraft, PayloadFamilia } from "./types";

function li(texto: string): string {
  return `<li>${escapeHtml(texto)}</li>`;
}

function anexo(draft: FamilyReportDraft): string {
  const { evidenciasPorMeta, avaliacoesFormaisPeriodo } = draft.anexoDados;
  if (evidenciasPorMeta.length === 0 && avaliacoesFormaisPeriodo.length === 0) {
    return "";
  }
  const linhas = evidenciasPorMeta
    .map(
      (e) =>
        `<tr><td>${escapeHtml(e.meta)}</td><td>${e.contagemPeriodo}</td></tr>`,
    )
    .join("");
  const tabela =
    evidenciasPorMeta.length > 0
      ? `<table><thead><tr><th>Meta</th><th>Registros no período</th></tr></thead><tbody>${linhas}</tbody></table>`
      : "";
  const avaliacoes =
    avaliacoesFormaisPeriodo.length > 0
      ? `<p>Avaliações formais concluídas no período:</p><ul>${avaliacoesFormaisPeriodo
          .map(li)
          .join("")}</ul>`
      : "";
  return `<section class="anexo"><h2>Para quem gosta de acompanhar os números</h2>${tabela}${avaliacoes}</section>`;
}

export function buildFamiliaHtml(payload: PayloadFamilia): string {
  const draft = payload.curado ?? payload.iaOriginal;
  const nome = escapeHtml(payload.crianca.nome);

  const nota =
    draft.periodoSemAvancoVisivel && draft.notaHonestidade
      ? `<p class="nota">${escapeHtml(draft.notaHonestidade)}</p>`
      : "";

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
  html{font-family:system-ui,sans-serif;color:#1a1a1a;font-size:14px;line-height:1.5}
  h1{font-size:22px;margin-bottom:2px} h2{font-size:16px;margin-top:20px}
  .periodo{color:#555;margin-top:0}
  .nota{background:#f4efe6;padding:10px 14px;border-radius:6px}
  ul{margin:6px 0;padding-left:20px}
  table{width:100%;border-collapse:collapse;margin:8px 0}
  th,td{border:1px solid #ccc;padding:4px 8px;text-align:left}
  .anexo{margin-top:24px;border-top:1px solid #ddd;padding-top:8px}
  .rodape{margin-top:24px;font-size:11px;color:#666}
</style></head><body>
<h1>Relatório de acompanhamento — ${nome}</h1>
<p class="periodo">Período: ${escapeHtml(payload.periodo.inicio)} a ${escapeHtml(payload.periodo.fim)}</p>
<h2>A conquista deste período</h2>
<p>${escapeHtml(draft.conquistaDestaque)}</p>
${nota}
<h2>O que estamos trabalhando agora</h2>
<ul>${draft.trabalhandoAgora.map(li).join("")}</ul>
<h2>Como apoiar em casa</h2>
<ul>${draft.comoApoiarEmCasa.map(li).join("")}</ul>
${anexo(draft)}
<p class="rodape">Documento de comunicação com a família — não substitui orientação clínica presencial.</p>
</body></html>`;
}
