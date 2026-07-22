"use client";

import * as React from "react";
import Link from "next/link";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { DataRow } from "@/components/ui/data-row";
import { Cluster, Stack } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { EstadoBadge } from "./estado-badge";
import { CheckInButton } from "./checkin-button";
import { GerirSessao } from "./gerir-sessao";
import { FUSO_CLINICA } from "./fuso";
import type { SessaoDoDia } from "./actions";

export interface AgendaViewClienteProps {
  sessoes: SessaoDoDia[];
  terapeutas: { id: string; nome: string }[];
  role: string;
  userId: string;
  podeGerir: boolean;
}

function horaDaSessao(quando: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_CLINICA,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(quando));
}

export function AgendaViewCliente({
  sessoes,
  terapeutas,
  role,
  userId,
  podeGerir,
}: AgendaViewClienteProps) {
  const isCoordenador = role === "coordenador" || role === "admin_recepcao";
  const [modoVisao, setModoVisao] = React.useState<string>(
    isCoordenador ? "terapeuta" : "horario"
  );

  // Agrupamento por Terapeuta
  const sessoesPorTerapeuta = React.useMemo(() => {
    const mapa = new Map<
      string,
      { terapeutaNome: string; sessoes: SessaoDoDia[] }
    >();

    // Inicializa todos os terapeutas conhecidos da clínica
    for (const t of terapeutas) {
      mapa.set(t.id, { terapeutaNome: t.nome, sessoes: [] });
    }


    // Adiciona as sessões ao mapa
    for (const s of sessoes) {
      const key = s.terapeutaId ?? "sem-terapeuta";
      const actualNome = s.terapeutaNome ?? "Profissional não atribuído";
      if (!mapa.has(key)) {
        mapa.set(key, { terapeutaNome: actualNome, sessoes: [] });
      }
      mapa.get(key)!.sessoes.push(s);
    }

    return Array.from(mapa.entries()).filter(
      ([, val]) => val.sessoes.length > 0 || isCoordenador
    );
  }, [sessoes, terapeutas, isCoordenador]);

  if (sessoes.length === 0) {
    return (
      <Stack className="animate-fade-in-up animate-delay-75 py-4 md:py-8">
        <Alert severidade="info" destacado>
          Nenhuma sessão agendada para o dia de hoje.
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {/* Seletor de Visão para Coordenador/Admin */}
      {isCoordenador ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--border-brutal)]/30">
          <span className="font-display font-semibold text-sm text-[var(--text-secondary)]">
            Modo de Exibição:
          </span>
          <SegmentedControl
            value={modoVisao}
            onValueChange={setModoVisao}
            opcoes={[
              { value: "terapeuta", label: "👥 Por Terapeuta" },
              { value: "horario", label: "🕒 Por Horário" },
            ]}
          />
        </div>
      ) : null}

      {/* Visão Clusterizada por Terapeuta */}
      {modoVisao === "terapeuta" ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

          {sessoesPorTerapeuta.map(([terapeutaId, grupo]) => {
            const concluidas = grupo.sessoes.filter(
              (s) => s.estado === "realizada"
            ).length;

            return (
              <Card
                key={terapeutaId}
                titulo={
                  <div className="flex items-center justify-between w-full">
                    <span className="font-display font-bold text-base text-[var(--text-primary)]">
                      {grupo.terapeutaNome}
                    </span>
                    <span className="font-mono text-xs px-2 py-0.5 rounded-[var(--radius-pill)] border border-[var(--border-brutal)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] font-semibold">
                      {grupo.sessoes.length} {grupo.sessoes.length === 1 ? "sessão" : "sessões"} ({concluidas} ok)
                    </span>
                  </div>
                }
              >
                {grupo.sessoes.length === 0 ? (
                  <p className="text-xs text-[var(--text-secondary)] italic py-2">
                    Sem sessões agendadas para hoje.
                  </p>
                ) : (
                  <Stack gap="sm" como="ul" className="mt-2">
                    {grupo.sessoes.map((s) => (
                      <DataRow
                        key={s.id}
                        como="li"
                        title={
                          <Cluster gap="xs" className="items-center">
                            <span className="font-display font-bold text-sm text-[var(--text-primary)]">
                              {horaDaSessao(s.agendadaPara)}
                            </span>
                            <EstadoBadge estado={s.estado} />
                          </Cluster>
                        }
                        subtitle={
                          <span className="text-sm font-medium text-[var(--text-primary)]">
                            {s.pacienteNome ?? "Paciente (acesso restrito)"}
                          </span>
                        }
                        trailing={
                          <Cluster gap="xs">
                            {role === "coordenador" || s.terapeutaId === userId ? (
                              <Link href={`/diario/${s.id}`}>
                                <Button variante="secundaria" tamanho="sm">
                                  Abrir
                                </Button>
                              </Link>
                            ) : null}
                            {s.estado === "agendada" ? (
                              <CheckInButton sessionId={s.id} />
                            ) : null}
                            {s.estado === "agendada" &&
                            (podeGerir || s.terapeutaId === userId) ? (
                              <GerirSessao sessionId={s.id} terapeutas={terapeutas} />
                            ) : null}
                            {(s.estado === "falta_paciente" || s.estado === "falta_terapeuta") &&
                            podeGerir ? (
                              <Link
                                href={`/agenda/semana?repor=${s.id}&patientId=${s.patientId}&terapeutaId=${s.terapeutaId}&disciplina=${encodeURIComponent(s.disciplina)}`}
                              >
                                <Button variante="secundaria" tamanho="sm">
                                  Repor
                                </Button>
                              </Link>
                            ) : null}
                          </Cluster>
                        }
                      />
                    ))}
                  </Stack>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        /* Visão Cronológica (Por Horário) */
        <Stack gap="md" como="ul">
          {sessoes.map((s, index) => (
            <DataRow
              key={s.id}
              como="li"
              className={cn(
                "animate-fade-in-up",
                index === 0 && "animate-delay-75",
                index === 1 && "animate-delay-150",
                index >= 2 && "animate-delay-225"
              )}
              title={
                <Cluster gap="sm" className="items-center">
                  <span className="font-display font-bold text-lg text-[var(--text-primary)]">
                    {horaDaSessao(s.agendadaPara)}
                  </span>
                  <EstadoBadge estado={s.estado} />
                </Cluster>
              }
              subtitle={
                <span>
                  {s.pacienteNome ?? "Paciente (acesso restrito)"}
                  {s.terapeutaNome ? (
                    <span className="text-[var(--text-secondary)]"> · {s.terapeutaNome}</span>
                  ) : null}
                </span>
              }
              trailing={
                <Cluster gap="sm">
                  {role === "coordenador" || s.terapeutaId === userId ? (
                    <Link href={`/diario/${s.id}`}>
                      <Button variante="secundaria" tamanho="sm">
                        Abrir sessão
                      </Button>
                    </Link>
                  ) : null}
                  {s.estado === "agendada" ? (
                    <CheckInButton sessionId={s.id} />
                  ) : null}
                  {s.estado === "agendada" &&
                  (podeGerir || s.terapeutaId === userId) ? (
                    <GerirSessao sessionId={s.id} terapeutas={terapeutas} />
                  ) : null}
                  {(s.estado === "falta_paciente" || s.estado === "falta_terapeuta") &&
                  podeGerir ? (
                    <Link
                      href={`/agenda/semana?repor=${s.id}&patientId=${s.patientId}&terapeutaId=${s.terapeutaId}&disciplina=${encodeURIComponent(s.disciplina)}`}
                    >
                      <Button variante="secundaria" tamanho="sm">
                        Repor
                      </Button>
                    </Link>
                  ) : null}
                </Cluster>
              }
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
