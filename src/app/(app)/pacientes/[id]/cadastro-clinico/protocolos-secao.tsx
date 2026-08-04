"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { RadioCards } from "@/components/ui/radio-cards";
import { Chip } from "@/components/ui/chip";
import {
  ativarProtocoloAction,
  desativarProtocoloAction,
  inicializarProtocolosAction,
} from "./protocolo-actions";

type Protocolo = { id: string; nome: string; disciplina: string };
type Vinculo = { id: string; protocolId: string; desativadoEm: string | null };

export function ProtocolosSecao({
  patientId,
  catalogo,
  vinculos,
}: {
  patientId: string;
  catalogo: Protocolo[];
  vinculos: Vinculo[];
}) {
  const vinculosAtivos = vinculos.filter((v) => !v.desativadoEm);
  const idsAtivos = new Set(vinculosAtivos.map((v) => v.protocolId));
  const temAtivos = idsAtivos.size > 0;

  // Se tem algum protocolo ativo, inicia no modo "estruturado", senão "generalista"
  const [modo, setModo] = useState<"generalista" | "estruturado">(
    temAtivos ? "estruturado" : "generalista"
  );

  const disponiveis = catalogo.filter((p) => !idsAtivos.has(p.id));
  const ativosList = catalogo.filter((p) => idsAtivos.has(p.id));

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
          Abordagem & Protocolos Clínicos
        </h2>
        <p className="text-xs text-[var(--text-secondary)] font-body">
          Defina o modo de atendimento do paciente para orientar o acompanhamento clínico e os relatórios da IA.
        </p>
      </div>

      {/* Seletor do Modo da Abordagem (Terapia Convencional vs Marcos Estruturados) */}
      <RadioCards
        value={modo}
        onValueChange={(v) => setModo(v as "generalista" | "estruturado")}
        opcoes={[
          {
            value: "generalista",
            label: "Terapia Convencional (Escuta Livre)",
            description: "Psicologia generalista, psicanálise ou TCC sem tabelas de marcos rígidas. A IA gera resumos qualitativos, temas e alertas de crise.",
          },
          {
            value: "estruturado",
            label: "Protocolos de Marcos de Desenvolvimento",
            description: "Acompanhamento estruturado por domínios e metas (ABA, Denver, ABLLS-R, PROC, etc.).",
          },
        ]}
      />

      {/* Ramo 1: Terapia Convencional (Sem Protocolo Rígido) */}
      {modo === "generalista" && (
        <div className="flex flex-col gap-4">
          <Alert severidade="sucesso" titulo="Modo Terapia Convencional Ativo">
            <div className="flex flex-col gap-2 text-sm leading-relaxed">
              <p>
                Este paciente está configurado para acompanhamento em <strong>Escuta Livre (Psicologia Generalista / Sem Protocolo Rígido)</strong>.
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                Os diários de sessão serão analisados em formato narrativo contínuo, monitorando sintomatologia, temas recorrentes e alertas de risco sem exigir pontuação em escalas de desenvolvimento.
              </p>
            </div>
          </Alert>

          {temAtivos && (
            <Alert severidade="warning" titulo="Atenção aos protocolos ativos">
              <p className="text-xs">
                Este paciente possui {idsAtivos.size} protocolo(s) de marcos ativo(s). Caso prefira usar o modo generalista puro, você pode desativá-los na opção "Protocolos de Marcos de Desenvolvimento".
              </p>
            </Alert>
          )}
        </div>
      )}

      {/* Ramo 2: Protocolos Estruturados de Marcos */}
      {modo === "estruturado" && (
        <div className="flex flex-col gap-6">
          {catalogo.length === 0 ? (
            <Alert severidade="info" titulo="Nenhum protocolo cadastrado no catálogo da clínica">
              <div className="flex flex-col gap-3">
                <p className="text-sm">
                  Sua clínica ainda não possui protocolos cadastrados no catálogo.
                  Clique abaixo para carregar o catálogo de protocolos padrão (VB-MAPP, Denver, ABLLS-R, PROC).
                </p>
                <form action={inicializarProtocolosAction.bind(null, patientId)}>
                  <Button type="submit" variante="secundaria">
                    Carregar catálogo de protocolos padrão
                  </Button>
                </form>
              </div>
            </Alert>
          ) : (
            <>
              {/* Bloco 1: Protocolos Ativos do Paciente */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                    Protocolos Ativos do Paciente ({ativosList.length})
                  </h3>
                </div>

                {ativosList.length === 0 ? (
                  <div className="p-4 rounded-[var(--radius-control)] border-2 border-dashed border-[var(--border-brutal)]/40 bg-[var(--surface-card)] text-center text-xs text-[var(--text-secondary)]">
                    Nenhum protocolo ativo no momento. Escolha um protocolo no catálogo abaixo para vincular a este paciente.
                  </div>
                ) : (
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {ativosList.map((p) => {
                      const vinculo = vinculos.find(
                        (v) => v.protocolId === p.id && !v.desativadoEm
                      );
                      return (
                        <li key={p.id}>
                          <Card titulo={p.nome} estado="conquistado" className="h-full">
                            <div className="flex items-center justify-between gap-2 mt-1">
                              <Chip variante="info">{p.disciplina}</Chip>
                              {vinculo && (
                                <form action={desativarProtocoloAction.bind(null, vinculo.id)}>
                                  <Button type="submit" risco="alto" tamanho="sm">
                                    Desativar
                                  </Button>
                                </form>
                              )}
                            </div>
                          </Card>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Bloco 2: Catálogo de Protocolos Disponíveis para Ativação (VISÍVEL E DIRETO) */}
              <div className="flex flex-col gap-3 pt-2 border-t border-[var(--border-brutal)]/20">
                <div className="flex flex-col gap-0.5">
                  <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                    Catálogo de Protocolos Disponíveis na Clínica ({disponiveis.length})
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Clique em "Ativar Protocolo" para adicionar o acompanhamento de marcos a este paciente.
                  </p>
                </div>

                {disponiveis.length === 0 ? (
                  <p className="text-xs text-[var(--text-secondary)] italic">
                    Todos os protocolos disponíveis no catálogo da clínica já estão ativos para este paciente.
                  </p>
                ) : (
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {disponiveis.map((p) => (
                      <li key={p.id}>
                        <div className="flex flex-col justify-between gap-3 p-4 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)]/30 bg-[var(--surface-card)] hover:border-[var(--border-brutal)] transition-all">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="font-display text-sm font-bold text-[var(--text-primary)]">
                                {p.nome}
                              </h4>
                              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                Disciplina: {p.disciplina}
                              </p>
                            </div>
                            <Chip variante="neutral">{p.disciplina}</Chip>
                          </div>
                          <form
                            action={ativarProtocoloAction.bind(null, patientId, p.id)}
                            className="w-full mt-1"
                          >
                            <Button type="submit" tamanho="sm" className="w-full">
                              + Ativar Protocolo
                            </Button>
                          </form>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
