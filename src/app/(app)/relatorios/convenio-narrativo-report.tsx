"use client";

import { useState, useTransition } from "react";
import { Stack, Cluster } from "@/components/ui/layout";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  gerarRascunhoConvenioNarrativoAction,
  curarConvenioNarrativoAction,
  exportarConvenioNarrativoAction,
} from "./actions";
import type {
  CabecalhoConvenio,
  ConvenioNarrativoDraft,
} from "@/lib/report/convenio-narrativo/types";

type Paciente = { id: string; nome: string };

function linhasParaArray(v: string): string[] {
  return v
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function evolucaoParaTexto(
  evolucao: ConvenioNarrativoDraft["evolucaoPorDominio"],
): string {
  return evolucao.map((e) => `${e.dominio}: ${e.narrativa}`).join("\n");
}

function textoParaEvolucao(
  v: string,
): ConvenioNarrativoDraft["evolucaoPorDominio"] {
  return linhasParaArray(v).map((linha) => {
    const idx = linha.indexOf(":");
    if (idx === -1) return { dominio: linha, narrativa: "" };
    return {
      dominio: linha.slice(0, idx).trim(),
      narrativa: linha.slice(idx + 1).trim(),
    };
  });
}

/**
 * Relatório Narrativo de Convênio (Fase 5 · Fatia 5). Fluxo em 3 passos,
 * espelhando `FamiliaReport`: gerar rascunho IA (dossiê factual + cabeçalho
 * do convênio) → coordenador cura/edita (draft E cabeçalho, D8) → exporta
 * PDF. Diferente da família: TODAS as ações (gerar, curar, exportar) são
 * coordenador-only (D6) — terapeuta nem gera.
 */
export function ConvenioNarrativoReport({
  pacientes,
  podeCurar,
}: {
  pacientes: Paciente[];
  podeCurar: boolean;
}) {
  const [patientId, setPatientId] = useState<string | undefined>(undefined);
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");
  const [operadora, setOperadora] = useState("");
  const [cid, setCid] = useState("");
  const [finalidade, setFinalidade] = useState("");

  const [reportId, setReportId] = useState<string | null>(null);
  const [versao, setVersao] = useState(1);
  const [draft, setDraft] = useState<ConvenioNarrativoDraft | null>(null);
  const [geradoEm, setGeradoEm] = useState<string | null>(null);
  const [revisado, setRevisado] = useState(false);
  const [resultado, setResultado] = useState<{ reportId: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  // campos editáveis (strings de UI ⇄ draft)
  const [resumoClinico, setResumoClinico] = useState("");
  const [evolucao, setEvolucao] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [objetivos, setObjetivos] = useState("");
  const [semAvanco, setSemAvanco] = useState(false);
  const [nota, setNota] = useState("");

  const selecaoCompleta = Boolean(
    patientId &&
    periodoInicio &&
    periodoFim &&
    operadora.trim() &&
    finalidade.trim(),
  );

  function preencherFormulario(
    d: ConvenioNarrativoDraft,
    c: CabecalhoConvenio,
  ) {
    setResumoClinico(d.resumoClinico);
    setEvolucao(evolucaoParaTexto(d.evolucaoPorDominio));
    setJustificativa(d.justificativaContinuidade);
    setObjetivos(d.objetivosProximoPeriodo.join("\n"));
    setSemAvanco(d.periodoSemAvancoVisivel);
    setNota(d.notaHonestidade ?? "");
    setOperadora(c.operadora);
    setCid(c.cid ?? "");
    setFinalidade(c.finalidade);
  }

  function gerar() {
    if (!patientId) return;
    setErro(null);
    setResultado(null);
    setRevisado(false);
    const cabecalho: CabecalhoConvenio = {
      operadora: operadora.trim(),
      cid: cid.trim() || null,
      finalidade: finalidade.trim(),
    };
    iniciar(async () => {
      const r = await gerarRascunhoConvenioNarrativoAction({
        patientId,
        periodoInicio,
        periodoFim,
        cabecalho,
      });
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      setReportId(r.reportId);
      setVersao(r.versao);
      setDraft(r.draft);
      setGeradoEm(new Date().toISOString());
      preencherFormulario(r.draft, cabecalho);
    });
  }

  function salvarRevisao() {
    if (!reportId || !draft) return;
    setErro(null);
    const draftEditado: ConvenioNarrativoDraft = {
      ...draft,
      resumoClinico: resumoClinico.trim(),
      evolucaoPorDominio: textoParaEvolucao(evolucao),
      justificativaContinuidade: justificativa.trim(),
      objetivosProximoPeriodo: linhasParaArray(objetivos).slice(0, 5),
      periodoSemAvancoVisivel: semAvanco,
      notaHonestidade: semAvanco ? nota.trim() || null : null,
      status: "rascunho_para_revisao",
    };
    const cabecalhoEditado: CabecalhoConvenio = {
      operadora: operadora.trim(),
      cid: cid.trim() || null,
      finalidade: finalidade.trim(),
    };
    iniciar(async () => {
      const r = await curarConvenioNarrativoAction({
        reportId,
        versaoEsperada: versao,
        cabecalhoEditado,
        draftEditado,
      });
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      setRevisado(true);
      setVersao((v) => v + 1);
    });
  }

  function exportar() {
    if (!reportId) return;
    setErro(null);
    iniciar(async () => {
      const r = await exportarConvenioNarrativoAction({ reportId });
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      setResultado({ reportId: r.reportId });
    });
  }

  return (
    <Card titulo="Relatório narrativo de convênio">
      <Stack gap="md">
        <p className="text-base text-[var(--text-primary)]">
          Rascunho narrativo gerado pela IA a partir do dossiê factual do
          período, para o coordenador revisar e aprovar antes de exportar para o
          convênio.
        </p>

        <Field label="Paciente" htmlFor="convenio-narrativo-paciente">
          <Select
            value={patientId}
            onValueChange={(v) => {
              setPatientId(v);
              setDraft(null);
              setResultado(null);
              setRevisado(false);
            }}
            name="patientId"
          >
            <SelectTrigger id="convenio-narrativo-paciente">
              <SelectValue placeholder="Selecione um paciente" />
            </SelectTrigger>
            <SelectContent>
              {pacientes.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Cluster gap="md">
          <Field
            label="Início do período"
            htmlFor="convenio-narrativo-periodo-inicio"
          >
            <Input
              id="convenio-narrativo-periodo-inicio"
              name="periodoInicio"
              type="date"
              value={periodoInicio}
              onChange={(e) => setPeriodoInicio(e.target.value)}
              required
            />
          </Field>
          <Field
            label="Fim do período"
            htmlFor="convenio-narrativo-periodo-fim"
          >
            <Input
              id="convenio-narrativo-periodo-fim"
              name="periodoFim"
              type="date"
              value={periodoFim}
              onChange={(e) => setPeriodoFim(e.target.value)}
              required
            />
          </Field>
        </Cluster>

        <Cluster gap="md">
          <Field label="Operadora" htmlFor="convenio-narrativo-operadora">
            <Input
              id="convenio-narrativo-operadora"
              name="operadora"
              value={operadora}
              onChange={(e) => setOperadora(e.target.value)}
              required
            />
          </Field>
          <Field
            label="CID (conforme prescrição médica assistente)"
            htmlFor="convenio-narrativo-cid"
          >
            <Input
              id="convenio-narrativo-cid"
              name="cid"
              value={cid}
              onChange={(e) => setCid(e.target.value)}
            />
          </Field>
          <Field label="Finalidade" htmlFor="convenio-narrativo-finalidade">
            <Input
              id="convenio-narrativo-finalidade"
              name="finalidade"
              value={finalidade}
              onChange={(e) => setFinalidade(e.target.value)}
              required
            />
          </Field>
        </Cluster>

        <Cluster gap="sm">
          <Button
            type="button"
            variante="secundaria"
            disabled={!selecaoCompleta || pendente}
            onClick={gerar}
          >
            {pendente && !draft
              ? "Gerando rascunho…"
              : draft
                ? "Regenerar rascunho com IA"
                : "Gerar rascunho com IA"}
          </Button>
        </Cluster>

        {draft ? (
          <Stack gap="md">
            <p className="text-lg font-semibold text-[var(--text-primary)]">
              Revisão do coordenador
            </p>

            {geradoEm ? (
              <p className="text-sm text-[var(--text-secondary)]">
                Dados extraídos em {new Date(geradoEm).toLocaleString("pt-BR")}.
              </p>
            ) : null}

            <Field label="Resumo clínico" htmlFor="convenio-narrativo-resumo">
              <Input
                id="convenio-narrativo-resumo"
                multiline
                rows={4}
                maxLength={800}
                value={resumoClinico}
                onChange={(e) => setResumoClinico(e.target.value)}
                disabled={!podeCurar}
              />
            </Field>

            <Field
              label="Evolução por domínio (uma por linha, formato: domínio: narrativa)"
              htmlFor="convenio-narrativo-evolucao"
            >
              <Input
                id="convenio-narrativo-evolucao"
                multiline
                rows={5}
                maxLength={1200}
                value={evolucao}
                onChange={(e) => setEvolucao(e.target.value)}
                disabled={!podeCurar}
              />
            </Field>

            <Field
              label="Justificativa de continuidade"
              htmlFor="convenio-narrativo-justificativa"
            >
              <Input
                id="convenio-narrativo-justificativa"
                multiline
                rows={4}
                maxLength={800}
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                disabled={!podeCurar}
              />
            </Field>

            <Field
              label="Objetivos do próximo período (uma por linha, até 5)"
              htmlFor="convenio-narrativo-objetivos"
            >
              <Input
                id="convenio-narrativo-objetivos"
                multiline
                rows={4}
                maxLength={500}
                value={objetivos}
                onChange={(e) => setObjetivos(e.target.value)}
                disabled={!podeCurar}
              />
            </Field>

            <Checkbox
              checked={semAvanco}
              onCheckedChange={(v) => setSemAvanco(v === true)}
              disabled={!podeCurar}
              label="Período sem avanço visível (mostra nota de honestidade)"
            />

            {semAvanco ? (
              <Field
                label="Nota de honestidade"
                htmlFor="convenio-narrativo-nota"
              >
                <Input
                  id="convenio-narrativo-nota"
                  multiline
                  rows={4}
                  maxLength={600}
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  disabled={!podeCurar}
                />
              </Field>
            ) : null}

            {podeCurar ? (
              <Cluster gap="sm">
                <Button
                  type="button"
                  variante="secundaria"
                  disabled={pendente}
                  onClick={salvarRevisao}
                >
                  {pendente ? "Salvando…" : "Salvar revisão"}
                </Button>
                <Button
                  type="button"
                  variante="primaria"
                  disabled={pendente || !revisado}
                  onClick={exportar}
                >
                  {pendente ? "Exportando…" : "Exportar PDF"}
                </Button>
              </Cluster>
            ) : (
              <Alert severidade="info">
                Só o coordenador pode revisar e exportar o relatório narrativo
                de convênio.
              </Alert>
            )}
          </Stack>
        ) : null}

        {erro ? <Alert severidade="erro">{erro}</Alert> : null}

        {resultado ? (
          <Alert severidade="sucesso" titulo="Relatório exportado">
            <Stack gap="sm">
              <span>O PDF revisado está pronto para download.</span>
              <form action={`/relatorios/${resultado.reportId}/download`}>
                <Button type="submit" variante="secundaria">
                  Baixar PDF
                </Button>
              </form>
            </Stack>
          </Alert>
        ) : null}
      </Stack>
    </Card>
  );
}
