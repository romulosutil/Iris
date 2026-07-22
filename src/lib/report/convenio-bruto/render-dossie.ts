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

/**
 * Renderiza as tabelas factuais do dossiê (presença, sessões, evidências),
 * sem o shell de documento (head/fontes/estilos). Compartilhado entre
 * convenio-bruto e convenio-narrativo — mesma fonte de verdade tabular.
 */
export function renderDossieTablesHtml(p: PayloadConvenioBruto): string {
  return `<p>${p.presenca.sessoesRealizadas} sessões realizadas, ${p.presenca.faltasJustificadas} falta(s) justificada(s), ${p.presenca.faltasNaoJustificadas} não justificada(s).</p>
<h2>Sessões</h2>
<table><thead><tr><th>#</th><th>Data</th><th>Disciplina</th><th>Modalidade</th><th>Estado</th><th>Terapeuta</th></tr></thead>
<tbody>${p.sessoes.map(linhaSessao).join("")}</tbody></table>
<h2>Evidências aprovadas</h2>
<table><thead><tr><th>Data</th><th>Meta/Domínio</th><th>Classificação</th><th>Autor</th></tr></thead>
<tbody>${p.evidencias.map(linhaEvidencia).join("")}</tbody></table>`;
}
