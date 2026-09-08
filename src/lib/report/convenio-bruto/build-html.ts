import { escapeHtml } from "../sanitize";
import {
  cabecalhoMarcaHtml,
  marcaCssHtml,
  rodapeIrisHtml,
} from "../marca-html";
import type { MarcaClinica } from "../../branding/marca";
import { renderDossieTablesHtml } from "./render-dossie";
import type { PayloadConvenioBruto } from "./types";

// #258 (D9) — `marca` é PARÂMETRO, não campo do payload: o payload é jsonb
// congelado no momento da geração e uma clínica que trocasse de logotipo
// depois veria o dossiê antigo sair com a marca velha. A marca é lida no
// export, do estado atual do tenant.
export function buildConvenioBrutoHtml(
  p: PayloadConvenioBruto,
  marca?: MarcaClinica | null,
): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
  html{font-family:system-ui,sans-serif;color:#111;font-size:12px}
  h1{font-size:18px} table{width:100%;border-collapse:collapse;margin:8px 0}
  th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}
  .rodape{margin-top:16px;font-size:10px;color:#555}
${marcaCssHtml(marca)}</style></head><body>
${cabecalhoMarcaHtml(marca)}
<h1>Dossiê para convênio — ${escapeHtml(p.paciente.nome)}</h1>
<p>Período: ${escapeHtml(p.periodo.inicio)} a ${escapeHtml(p.periodo.fim)} · Gerado em ${escapeHtml(p.geradoEm)}</p>
${renderDossieTablesHtml(p)}
<p class="rodape">Documento factual, sem interpretação — cada linha remete à sessão/evidência de origem, auditável ponto a ponto.</p>
${rodapeIrisHtml()}
</body></html>`;
}
