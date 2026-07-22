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
  gerarRascunhoFamiliaAction,
  curarFamiliaAction,
  exportarFamiliaAction,
} from "./actions";
import type { FamilyReportDraft } from "@/lib/report/familia/types";

type Paciente = { id: string; nome: string };

// Textarea nativo estilizado — o design system ainda não tem um Textarea
// (dívida registrada no BACKLOG). Classes espelham a superfície de campo do DS.
const textareaClass =
  "w-full rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] px-3 py-2 text-[var(--text-primary)] text-base " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-color)]";

function linhasParaArray(v: string): string[] {
  return v
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Relatório da Família (Fase 5 · Fatia 4). Fluxo F9 em 3 passos:
 * gerar rascunho IA → coordenador cura/edita → exporta PDF. O rascunho é
 * SEMPRE revisado por humano antes de sair (nenhum texto de IA chega à família
 * sem curadoria). Gerar: coordenador ou terapeuta; curar/exportar: coordenador.
 */
export function FamiliaReport({
  pacientes,
  podeCurar,
}: {
  pacientes: Paciente[];
  podeCurar: boolean;
}) {
  const [patientId, setPatientId] = useState<string | undefined>(undefined);
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");

  const [reportId, setReportId] = useState<string | null>(null);
  const [versao, setVersao] = useState(1);
  const [draft, setDraft] = useState<FamilyReportDraft | null>(null);
  const [revisado, setRevisado] = useState(false);
  const [resultado, setResultado] = useState<{ reportId: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  // campos editáveis (strings de UI ⇄ draft)
  const [conquista, setConquista] = useState("");
  const [trabalhando, setTrabalhando] = useState("");
  const [apoiar, setApoiar] = useState("");
  const [semAvanco, setSemAvanco] = useState(false);
  const [nota, setNota] = useState("");

  const selecaoCompleta = Boolean(patientId && periodoInicio && periodoFim);

  function preencherFormulario(d: FamilyReportDraft) {
    setConquista(d.conquistaDestaque);
    setTrabalhando(d.trabalhandoAgora.join("\n"));
    setApoiar(d.comoApoiarEmCasa.join("\n"));
    setSemAvanco(d.periodoSemAvancoVisivel);
    setNota(d.notaHonestidade ?? "");
  }

  function gerar() {
    if (!patientId) return;
    setErro(null);
    setResultado(null);
    setRevisado(false);
    iniciar(async () => {
      const r = await gerarRascunhoFamiliaAction({ patientId, periodoInicio, periodoFim });
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      setReportId(r.reportId);
      setVersao(r.versao);
      setDraft(r.draft);
      preencherFormulario(r.draft);
    });
  }

  function salvarRevisao() {
    if (!reportId || !draft) return;
    setErro(null);
    const draftEditado: FamilyReportDraft = {
      ...draft,
      conquistaDestaque: conquista.trim(),
      trabalhandoAgora: linhasParaArray(trabalhando).slice(0, 4),
      comoApoiarEmCasa: linhasParaArray(apoiar).slice(0, 3),
      periodoSemAvancoVisivel: semAvanco,
      notaHonestidade: semAvanco ? nota.trim() || null : null,
      status: "rascunho_para_revisao",
    };
    iniciar(async () => {
      const r = await curarFamiliaAction({ reportId, versaoEsperada: versao, draftEditado });
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
      const r = await exportarFamiliaAction({ reportId });
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      setResultado({ reportId: r.reportId });
    });
  }

  return (
    <Card titulo="Relatório da família">
      <Stack gap="md">
        <p className="text-[var(--text-primary)] text-base">
          Rascunho gerado pela IA a partir das evidências aprovadas do período,
          para o coordenador revisar e aprovar antes de enviar à família.
        </p>

        <Field label="Paciente" htmlFor="familia-paciente">
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
            <SelectTrigger id="familia-paciente">
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
          <Field label="Início do período" htmlFor="familia-periodo-inicio">
            <Input
              id="familia-periodo-inicio"
              name="periodoInicio"
              type="date"
              value={periodoInicio}
              onChange={(e) => setPeriodoInicio(e.target.value)}
              required
            />
          </Field>
          <Field label="Fim do período" htmlFor="familia-periodo-fim">
            <Input
              id="familia-periodo-fim"
              name="periodoFim"
              type="date"
              value={periodoFim}
              onChange={(e) => setPeriodoFim(e.target.value)}
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
            {pendente && !draft ? "Gerando rascunho…" : "Gerar rascunho com IA"}
          </Button>
        </Cluster>

        {draft ? (
          <Stack gap="md">
            <p className="text-[var(--text-primary)] text-lg font-semibold">
              Revisão do coordenador
            </p>

            <Field label="A conquista deste período" htmlFor="familia-conquista">
              <textarea
                id="familia-conquista"
                className={textareaClass}
                rows={3}
                maxLength={600}
                value={conquista}
                onChange={(e) => setConquista(e.target.value)}
                disabled={!podeCurar}
              />
            </Field>

            <Field
              label="O que estamos trabalhando agora (uma por linha, até 4)"
              htmlFor="familia-trabalhando"
            >
              <textarea
                id="familia-trabalhando"
                className={textareaClass}
                rows={4}
                maxLength={400}
                value={trabalhando}
                onChange={(e) => setTrabalhando(e.target.value)}
                disabled={!podeCurar}
              />
            </Field>

            <Field
              label="Como apoiar em casa (uma por linha, até 3)"
              htmlFor="familia-apoiar"
            >
              <textarea
                id="familia-apoiar"
                className={textareaClass}
                rows={3}
                maxLength={300}
                value={apoiar}
                onChange={(e) => setApoiar(e.target.value)}
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
              <Field label="Nota de honestidade" htmlFor="familia-nota">
                <textarea
                  id="familia-nota"
                  className={textareaClass}
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
                Só o coordenador pode revisar e exportar o relatório da família.
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
