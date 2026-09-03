"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Banner } from "@/components/ui/banner";
import type { ItemHistoricoExportacao } from "@/lib/export/acervo/motor";
import { solicitarExportacaoAction, gerarLinkDownloadAction } from "./actions";
import { logarErroSemPII } from "@/lib/observabilidade/logar-erro";
import { textoErroInterno } from "@/lib/copy/erros";

export interface ExportacaoViewProps {
  initialAtivo: ItemHistoricoExportacao | null;
  initialHistorico: ItemHistoricoExportacao[];
  clinicNome: string;
}

export function ExportacaoView({
  initialAtivo,
  initialHistorico,
  clinicNome,
}: ExportacaoViewProps) {
  const [ativo, setAtivo] = React.useState<ItemHistoricoExportacao | null>(
    initialAtivo,
  );
  const [historico, setHistorico] =
    React.useState<ItemHistoricoExportacao[]>(initialHistorico);
  const [isSolicitando, setIsSolicitando] = React.useState(false);
  const [erroSolicitacao, setErroSolicitacao] = React.useState<string | null>(
    null,
  );
  const [pollingEsgotado, setPollingEsgotado] = React.useState(false);
  const [copiadoSha, setCopiadoSha] = React.useState<string | null>(null);
  const [isGerandoLink, setIsGerandoLink] = React.useState(false);
  const [erroDownload, setErroDownload] = React.useState<string | null>(null);

  const [agora, setAgora] = React.useState<number>(() => Date.now());

  React.useEffect(() => {
    const timer = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const tentativaRef = React.useRef(0);
  const estaAtivo =
    ativo?.status === "pendente" || ativo?.status === "processando";

  // Polling com intervalo de 10s e teto de 60 tentativas (10 min) — Design §5
  React.useEffect(() => {
    if (!estaAtivo) {
      tentativaRef.current = 0;
      return;
    }

    const interval = setInterval(async () => {
      tentativaRef.current += 1;
      if (tentativaRef.current > 60) {
        setPollingEsgotado(true);
        clearInterval(interval);
        return;
      }

      try {
        const res = await fetch("/api/exportacao/estado");
        if (res.ok) {
          const data = (await res.json()) as {
            ativo: ItemHistoricoExportacao | null;
            historico: ItemHistoricoExportacao[];
          };
          setAtivo(data.ativo);
          setHistorico(data.historico);
          if (
            data.ativo?.status !== "pendente" &&
            data.ativo?.status !== "processando"
          ) {
            setPollingEsgotado(false);
          }
        }
      } catch (err) {
        logarErroSemPII("Erro ao verificar estado da exportação", err);
      }
    }, 10_000);

    return () => clearInterval(interval);
  }, [estaAtivo]);

  const handleAtualizarManual = async () => {
    try {
      const res = await fetch("/api/exportacao/estado");
      if (res.ok) {
        const data = (await res.json()) as {
          ativo: ItemHistoricoExportacao | null;
          historico: ItemHistoricoExportacao[];
        };
        setAtivo(data.ativo);
        setHistorico(data.historico);
        if (
          data.ativo?.status === "pendente" ||
          data.ativo?.status === "processando"
        ) {
          tentativaRef.current = 0;
          setPollingEsgotado(false);
        }
      }
    } catch (err) {
      logarErroSemPII("Erro ao atualizar estado", err);
    }
  };

  const handleSolicitar = async () => {
    setIsSolicitando(true);
    setErroSolicitacao(null);
    setPollingEsgotado(false);
    try {
      const res = await solicitarExportacaoAction();
      if (res.ok) {
        const novoAtivo: ItemHistoricoExportacao = {
          id: res.bundleId,
          status: "pendente",
          solicitadoEm: new Date(),
          iniciadoEm: null,
          concluidoEm: null,
          expiraEm: null,
          bytesTamanho: null,
          sha256: null,
          erro: null,
          podeBaixar: false,
        };
        setAtivo(novoAtivo);
        setHistorico((prev) => [novoAtivo, ...prev]);
      } else {
        setErroSolicitacao(res.error);
      }
    } catch (err: unknown) {
      // S-10 (#531): a exceção aqui é de rede/serialização da action — o
      // texto dela não é copy. Dicionário + código de correlação do log.
      setErroSolicitacao(
        textoErroInterno(
          logarErroSemPII("solicitarExportacao (cliente):", err),
        ),
      );
    } finally {
      setIsSolicitando(false);
    }
  };

  // O token de download não existe no estado do cliente: o job grava só o
  // SHA-256 dele. O link é cunhado sob demanda pela Server Action, usado uma
  // vez e revogado na próxima geração.
  async function handleBaixar(bundleId: string) {
    setErroDownload(null);
    setIsGerandoLink(true);
    try {
      const res = await gerarLinkDownloadAction(bundleId);
      if (!res.ok) {
        setErroDownload(res.error);
        return;
      }
      window.location.href = res.url;
    } catch {
      setErroDownload(
        "Não foi possível preparar o download agora. Tente novamente.",
      );
    } finally {
      setIsGerandoLink(false);
    }
  }

  const handleCopiarSha = (sha: string) => {
    navigator.clipboard.writeText(sha);
    setCopiadoSha(sha);
    setTimeout(() => setCopiadoSha(null), 3000);
  };

  const formatarTamanho = (bytesStr: string | null): string => {
    if (!bytesStr) return "--";
    const bytes = Number(bytesStr);
    if (isNaN(bytes)) return bytesStr;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatarData = (d: Date | string | null): string => {
    if (!d) return "--";
    const date = new Date(d);
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const calcularHorasRestantes = (expiraEm: Date | string | null): number => {
    if (!expiraEm) return 0;
    const diff = new Date(expiraEm).getTime() - agora;
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60)));
  };

  const bundleProntoMaisRecente = historico.find((h) => h.podeBaixar);

  return (
    <div className="flex flex-col gap-6">
      {erroSolicitacao && (
        <Banner variant="alerta" titulo="Aviso">
          {erroSolicitacao}
        </Banner>
      )}

      {/* Card de Solicitação / Ação Principal */}
      <Card
        titulo="Solicitação do Acervo"
        destacado={!estaAtivo}
        className="p-6"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[var(--text-secondary)]">
            A exportação integral gera um pacote compactado (.ZIP) contendo
            todas as 37 tabelas do prontuário eletrônico da clínica no formato
            NDJSON, além dos relatórios clínicos congelados em PDF e o manifesto
            com checksum SHA-256 para auditoria de integridade (LGPD Art. 18).
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Button
              variante="primaria"
              onClick={handleSolicitar}
              disabled={estaAtivo || isSolicitando}
              isLoading={isSolicitando}
            >
              {estaAtivo
                ? "Exportação em andamento..."
                : "Solicitar Exportação Integral"}
            </Button>

            {estaAtivo && (
              <Chip variante="ai">
                {ativo?.status === "pendente"
                  ? "Na fila de processamento"
                  : "Gerando dados e relatórios..."}
              </Chip>
            )}
          </div>

          {pollingEsgotado && estaAtivo && (
            <div className="flex items-center gap-3 pt-2 text-sm text-[var(--text-secondary)]">
              <span>
                O processamento está levando mais tempo que o habitual.
              </span>
              <Button
                variante="secundaria"
                tamanho="sm"
                onClick={handleAtualizarManual}
              >
                Atualizar status
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Card do Bundle Pronto para Download (se houver) */}
      {bundleProntoMaisRecente && (
        <Card
          titulo="Download Disponível"
          epistemicState="fact"
          destacado
          className="bg-[var(--surface-elevated)] p-6"
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Chip variante="success">Pronto para download</Chip>
                <span className="font-mono text-xs text-[var(--text-secondary)]">
                  Expira em{" "}
                  {calcularHorasRestantes(bundleProntoMaisRecente.expiraEm)}h
                </span>
              </div>
              <span className="text-sm font-semibold">
                Tamanho: {formatarTamanho(bundleProntoMaisRecente.bytesTamanho)}
              </span>
            </div>

            <div className="flex flex-col gap-1 rounded bg-[var(--surface-sunken)] p-3 font-mono text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--text-secondary)]">
                  SHA-256 (ZIP):
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handleCopiarSha(bundleProntoMaisRecente.sha256 || "")
                  }
                  className="font-sans text-xs underline hover:text-[var(--action-primary)]"
                >
                  {copiadoSha === bundleProntoMaisRecente.sha256
                    ? "✓ Copiado!"
                    : "Copiar checksum"}
                </button>
              </div>
              <span className="break-all text-[var(--text-primary)]">
                {bundleProntoMaisRecente.sha256 || "--"}
              </span>
            </div>

            <div className="pt-2">
              <p className="mb-3 text-xs text-[var(--text-secondary)]">
                Para baixar com segurança, utilize o botão abaixo. Ele cunha um
                link novo, válido para a sua sessão de responsável pela clínica{" "}
                {clinicNome}, e revoga qualquer link gerado antes.
              </p>
              <Button
                type="button"
                variante="primaria"
                className="w-full sm:w-auto"
                disabled={isGerandoLink}
                aria-busy={isGerandoLink}
                onClick={() => handleBaixar(bundleProntoMaisRecente.id)}
              >
                {isGerandoLink ? "Preparando link…" : "Baixar Acervo (.zip)"}
              </Button>
              <p aria-live="polite" className="sr-only">
                {isGerandoLink ? "Preparando o link de download." : ""}
              </p>
              {erroDownload && (
                <div className="mt-3">
                  <Banner variant="alerta" titulo="Download indisponível">
                    {erroDownload}
                  </Banner>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Histórico de Exportações */}
      <Card titulo="Histórico de Exportações" className="p-6">
        {historico.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--text-secondary)]">
            Nenhuma exportação solicitada anteriormente.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] uppercase">
                <tr>
                  <th className="pb-3 font-medium">Solicitado em</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Tamanho</th>
                  <th className="pb-3 font-medium">SHA-256</th>
                  <th className="pb-3 font-medium">Expiração</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] font-mono text-xs">
                {historico.map((item) => (
                  <tr key={item.id} className="hover:bg-[var(--surface-hover)]">
                    <td className="py-3 font-sans">
                      {formatarData(item.solicitadoEm)}
                    </td>
                    <td className="py-3">
                      {item.status === "pronto" && item.podeBaixar && (
                        <Chip variante="success">Pronto</Chip>
                      )}
                      {item.status === "pronto" && !item.podeBaixar && (
                        <Chip variante="neutral">Expirado</Chip>
                      )}
                      {item.status === "pendente" && (
                        <Chip variante="ai">Pendente</Chip>
                      )}
                      {item.status === "processando" && (
                        <Chip variante="ai">Processando</Chip>
                      )}
                      {item.status === "falhou" && (
                        <Chip variante="warning">
                          Falhou: {item.erro ?? "--"}
                        </Chip>
                      )}
                      {item.status === "expirado" && (
                        <Chip variante="neutral">Expirado</Chip>
                      )}
                    </td>
                    <td className="py-3">
                      {formatarTamanho(item.bytesTamanho)}
                    </td>
                    <td
                      className="max-w-[150px] truncate py-3"
                      title={item.sha256 || ""}
                    >
                      {item.sha256 ? item.sha256.slice(0, 16) + "..." : "--"}
                    </td>
                    <td className="py-3 font-sans">
                      {item.expiraEm ? formatarData(item.expiraEm) : "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
