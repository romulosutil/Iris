"use client";

import { useState, useTransition } from "react";
import { Stack, Cluster } from "@/components/ui/layout";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Stat } from "@/components/ui/stat";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { previewConvenioBrutoAction, exportarConvenioBrutoAction } from "./actions";

type Preview = {
  sessoesRealizadas: number;
  faltasJustificadas: number;
  evidenciasAprovadas: number;
};

type Paciente = { id: string; nome: string };

/**
 * Único tile hoje: "Dossiê para convênio" (Fase 5 · Fatia 3). "Relatório da
 * família" é Fatia 4 — não existe ainda, não inventar aqui.
 *
 * Fluxo (wireframe §4.6): seleção paciente + período → "Ver prévia" calcula
 * as contagens factuais (`previewConvenioBrutoAction`, read-only) → "Gerar
 * dossiê em PDF" grava o report (`exportarConvenioBrutoAction`) → sucesso
 * exibe um form GET para a rota de download, que só lê os bytes já
 * renderizados (nunca re-renderiza).
 */
export function RelatoriosExport({ pacientes }: { pacientes: Paciente[] }) {
  const [patientId, setPatientId] = useState<string | undefined>(undefined);
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");

  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewErro, setPreviewErro] = useState<string | null>(null);
  const [buscandoPreview, iniciarBuscaPreview] = useTransition();

  const [resultado, setResultado] = useState<
    { reportId: string; hash: string } | null
  >(null);
  const [exportErro, setExportErro] = useState<string | null>(null);
  const [exportando, iniciarExportacao] = useTransition();

  const nomePaciente = pacientes.find((p) => p.id === patientId)?.nome ?? "";
  const selecaoCompleta = Boolean(patientId && periodoInicio && periodoFim);

  function verPreview() {
    if (!patientId) return;
    setPreviewErro(null);
    setResultado(null);
    setExportErro(null);
    iniciarBuscaPreview(async () => {
      const r = await previewConvenioBrutoAction({
        patientId,
        nomePaciente,
        periodoInicio,
        periodoFim,
      });
      if ("error" in r) {
        setPreview(null);
        setPreviewErro(r.error);
      } else {
        setPreview(r);
      }
    });
  }

  function gerarDossie() {
    if (!patientId) return;
    setExportErro(null);
    iniciarExportacao(async () => {
      const r = await exportarConvenioBrutoAction({
        patientId,
        nomePaciente,
        periodoInicio,
        periodoFim,
      });
      if ("error" in r) {
        setExportErro(r.error);
      } else {
        setResultado(r);
      }
    });
  }

  return (
    <Card titulo="Dossiê para convênio">
      <Stack gap="md">
        <p className="text-[var(--text-primary)] text-base">
          Sessões realizadas, faltas justificadas e evidências aprovadas do
          período — sem texto gerado por IA.
        </p>

        <Field label="Paciente" htmlFor="relatorio-paciente">
          <Select
            value={patientId}
            onValueChange={(v) => {
              setPatientId(v);
              setPreview(null);
              setResultado(null);
            }}
            name="patientId"
          >
            <SelectTrigger id="relatorio-paciente">
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
          <Field label="Início do período" htmlFor="relatorio-periodo-inicio">
            <Input
              id="relatorio-periodo-inicio"
              name="periodoInicio"
              type="date"
              value={periodoInicio}
              onChange={(e) => {
                setPeriodoInicio(e.target.value);
                setPreview(null);
                setResultado(null);
              }}
              required
            />
          </Field>
          <Field label="Fim do período" htmlFor="relatorio-periodo-fim">
            <Input
              id="relatorio-periodo-fim"
              name="periodoFim"
              type="date"
              value={periodoFim}
              onChange={(e) => {
                setPeriodoFim(e.target.value);
                setPreview(null);
                setResultado(null);
              }}
              required
            />
          </Field>
        </Cluster>

        <Cluster gap="sm">
          <Button
            type="button"
            variante="secundaria"
            disabled={!selecaoCompleta || buscandoPreview}
            onClick={verPreview}
          >
            {buscandoPreview ? "Calculando prévia…" : "Ver prévia"}
          </Button>
        </Cluster>

        {previewErro ? <Alert severidade="erro">{previewErro}</Alert> : null}

        {preview ? (
          <Stack gap="md">
            <Cluster gap="md">
              <Stat rotulo="Sessões realizadas" valor={preview.sessoesRealizadas} />
              <Stat rotulo="Faltas justificadas" valor={preview.faltasJustificadas} />
              <Stat rotulo="Evidências aprovadas" valor={preview.evidenciasAprovadas} />
            </Cluster>

            <Cluster gap="sm">
              <Button
                type="button"
                variante="primaria"
                disabled={exportando}
                onClick={gerarDossie}
              >
                {exportando ? "Gerando dossiê…" : "Gerar dossiê em PDF"}
              </Button>
            </Cluster>
          </Stack>
        ) : null}

        {exportErro ? <Alert severidade="erro">{exportErro}</Alert> : null}

        {resultado ? (
          <Alert severidade="sucesso" titulo="Dossiê gerado">
            <Stack gap="sm">
              <span>O PDF factual do período está pronto para download.</span>
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
