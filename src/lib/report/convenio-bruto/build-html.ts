import { escapeHtml } from "../sanitize";
import { renderDossieTablesHtml } from "./render-dossie";
import type { PayloadConvenioBruto } from "./types";

export function buildConvenioBrutoHtml(p: PayloadConvenioBruto): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
  html{font-family:system-ui,sans-serif;color:#111;font-size:12px}
  h1{font-size:18px} table{width:100%;border-collapse:collapse;margin:8px 0}
  th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}
  .rodape{margin-top:16px;font-size:10px;color:#555}
</style></head><body>
<h1>Dossiê para convênio — ${escapeHtml(p.paciente.nome)}</h1>
<p>Período: ${escapeHtml(p.periodo.inicio)} a ${escapeHtml(p.periodo.fim)} · Gerado em ${escapeHtml(p.geradoEm)}</p>
${renderDossieTablesHtml(p)}
<p class="rodape">Documento factual, sem interpretação — cada linha remete à sessão/evidência de origem, auditável ponto a ponto.</p>
</body></html>`;
}
