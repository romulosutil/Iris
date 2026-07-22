// Template HTML do relatório narrativo de convênio (Fase 5 · Fatia 5). Função
// PURA — não toca DB. Une o dossiê factual (verbatim, auditável) com a
// narrativa curada pelo coordenador (ou o rascunho da IA, se ainda não
// houver curadoria). Todo texto livre passa por escapeHtml; sem <script>,
// sem asset remoto.
import { renderDossieTablesHtml } from "../convenio-bruto/render-dossie";
import { escapeHtml } from "../sanitize";
import type { ConvenioNarrativoDraft, PayloadConvenioNarrativo } from "./types";

function li(texto: string): string {
  return `<li>${escapeHtml(texto)}</li>`;
}

function evolucao(item: ConvenioNarrativoDraft["evolucaoPorDominio"][number]): string {
  return `<section class="dominio"><h3>${escapeHtml(item.dominio)}</h3><p>${escapeHtml(item.narrativa)}</p></section>`;
}

function nota(draft: ConvenioNarrativoDraft): string {
  return draft.periodoSemAvancoVisivel && draft.notaHonestidade
    ? `<p class="nota">${escapeHtml(draft.notaHonestidade)}</p>`
    : "";
}

export function buildConvenioNarrativoHtml(payload: PayloadConvenioNarrativo): string {
  const d = payload.curado ?? payload.iaOriginal;
  const { cabecalho } = payload;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
  html{font-family:system-ui,sans-serif;color:#111;font-size:12px;line-height:1.5}
  h1{font-size:18px} h2{font-size:15px;margin-top:20px} h3{font-size:13px;margin-bottom:2px}
  table{width:100%;border-collapse:collapse;margin:8px 0}
  th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}
  .nota{background:#f4efe6;padding:8px 12px;border-radius:4px}
  .dominio{margin:8px 0}
  .rodape{margin-top:16px;font-size:10px;color:#555}
</style></head><body>
<h1>Relatório de convênio — ${escapeHtml(payload.paciente.nome)}</h1>
<p>Período: ${escapeHtml(payload.periodo.inicio)} a ${escapeHtml(payload.periodo.fim)} · Operadora: ${escapeHtml(cabecalho.operadora)}</p>
<p>CID (conforme prescrição médica assistente): ${cabecalho.cid ? escapeHtml(cabecalho.cid) : "—"}</p>
<p>Finalidade: ${escapeHtml(cabecalho.finalidade)}</p>
<p>Dados extraídos em ${escapeHtml(payload.geradoEm)}</p>
<h2>Dossiê factual</h2>
${renderDossieTablesHtml(payload.dossie)}
<h2>Relatório narrativo</h2>
<p>${escapeHtml(d.resumoClinico)}</p>
${d.evolucaoPorDominio.map(evolucao).join("")}
<h2>Justificativa de continuidade</h2>
<p>${escapeHtml(d.justificativaContinuidade)}</p>
<h2>Objetivos para o próximo período</h2>
<ul>${d.objetivosProximoPeriodo.map(li).join("")}</ul>
${nota(d)}
<p class="rodape">Documento de suporte à solicitação de cobertura, revisado por [coordenador]. Diagnóstico e prescrição são do médico assistente externo; a clínica não diagnostica.</p>
</body></html>`;
}
