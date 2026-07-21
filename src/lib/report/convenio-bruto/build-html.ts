import { escapeHtml } from "../sanitize";
import type { PayloadConvenioBruto } from "./types";

const ESTADO_LABEL: Record<string, string> = {
  realizada: "Realizada",
  falta_paciente: "Falta (paciente)",
  falta_terapeuta: "Falta (terapeuta)",
  cancelada: "Cancelada",
  agendada: "Agendada",
};

function linhaSessao(s: PayloadConvenioBruto["sessoes"][number]): string {
  const just = s.justificada === true ? " · justificada" : "";
  return `<tr>
    <td>${s.numeroSequencial ?? "—"}</td>
    <td>${escapeHtml(s.data)}</td>
    <td>${escapeHtml(s.disciplina)}</td>
    <td>${escapeHtml(s.modalidade)}</td>
    <td>${escapeHtml(ESTADO_LABEL[s.estado] ?? s.estado)}${just}</td>
    <td>${escapeHtml(s.terapeuta)}</td>
  </tr>`;
}

function linhaEvidencia(e: PayloadConvenioBruto["evidencias"][number]): string {
  return `<tr>
    <td>${escapeHtml(e.data)}</td>
    <td>${escapeHtml(e.metaOuDominio)}</td>
    <td>${escapeHtml(e.classificacao)}</td>
    <td>${escapeHtml(e.autor)}</td>
  </tr>`;
}

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
<p>${p.presenca.sessoesRealizadas} sessões realizadas, ${p.presenca.faltasJustificadas} falta(s) justificada(s), ${p.presenca.faltasNaoJustificadas} não justificada(s).</p>
<h2>Sessões</h2>
<table><thead><tr><th>#</th><th>Data</th><th>Disciplina</th><th>Modalidade</th><th>Estado</th><th>Terapeuta</th></tr></thead>
<tbody>${p.sessoes.map(linhaSessao).join("")}</tbody></table>
<h2>Evidências aprovadas</h2>
<table><thead><tr><th>Data</th><th>Meta/Domínio</th><th>Classificação</th><th>Autor</th></tr></thead>
<tbody>${p.evidencias.map(linhaEvidencia).join("")}</tbody></table>
<p class="rodape">Documento factual, sem interpretação — cada linha remete à sessão/evidência de origem, auditável ponto a ponto.</p>
</body></html>`;
}
