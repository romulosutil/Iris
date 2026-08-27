"use client";

import * as React from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Cluster, Stack } from "@/components/ui/layout";
import { EstadoBadge } from "./estado-badge";
import { CheckInButton } from "./checkin-button";
import { GerirSessao } from "./gerir-sessao";
import type { SessaoDoDia } from "./actions";

export interface AppointmentModalProps {
  sessao: SessaoDoDia | null;
  aberto: boolean;
  aoFechar: () => void;
  terapeutas: { id: string; nome: string }[];
  podeGerir: boolean;
  userId: string;
  role: string;
  fuso: string;
}

function horaDaSessao(quando: Date, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(quando));
}

function LinhaDetalhe({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border-brutal)]/20 py-2">
      <dt className="font-display text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase">
        {rotulo}
      </dt>
      <dd className="text-right text-sm font-medium text-[var(--text-primary)]">
        {valor}
      </dd>
    </div>
  );
}

/**
 * Modal de detalhe de um agendamento (visão matriz da agenda). Mostra os dados
 * da sessão e as ações condicionais ao papel: check-in, gerir, abrir diário e
 * repor falta. Foco, Esc e overlay ficam por conta do Dialog do design system.
 */
export function AppointmentModal({
  sessao,
  aberto,
  aoFechar,
  terapeutas,
  podeGerir,
  userId,
  role,
  fuso,
}: AppointmentModalProps) {
  if (!sessao) return null;

  const ehCoordenador = role === "coordenador" || role === "admin_recepcao";
  const ehPropria = sessao.terapeutaId === userId;
  const ehFalta =
    sessao.estado === "falta_paciente" || sessao.estado === "falta_terapeuta";

  return (
    <Dialog
      open={aberto}
      onOpenChange={(open) => (!open ? aoFechar() : undefined)}
    >
      <DialogContent>
        <DialogTitle>
          <span className="flex items-center gap-2">
            <span className="font-display text-2xl font-extrabold">
              {horaDaSessao(sessao.agendadaPara, fuso)}
            </span>
            <EstadoBadge estado={sessao.estado} />
          </span>
        </DialogTitle>
        <DialogDescription>
          {sessao.pacienteNome ?? "Paciente (acesso restrito)"}
        </DialogDescription>

        <Stack gap="md" className="mt-4">
          <dl className="rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-elevated)] px-4 py-1">
            <LinhaDetalhe
              rotulo="Paciente"
              valor={sessao.pacienteNome ?? "Acesso restrito"}
            />
            <LinhaDetalhe
              rotulo="Terapeuta"
              valor={sessao.terapeutaNome ?? "Não atribuído"}
            />
            <LinhaDetalhe rotulo="Disciplina" valor={sessao.disciplina} />
            {sessao.modalidade ? (
              <LinhaDetalhe rotulo="Modalidade" valor={sessao.modalidade} />
            ) : null}
          </dl>

          <Cluster
            gap="sm"
            className="flex-wrap [&_a]:min-h-11 [&_button]:min-h-11 [&_button]:min-w-11"
          >
            {sessao.estado === "agendada" && (podeGerir || ehPropria) ? (
              <CheckInButton
                sessionId={sessao.id}
                checkInEm={sessao.checkInEm}
                fuso={fuso}
              />
            ) : null}
            {sessao.estado === "agendada" && (podeGerir || ehPropria) ? (
              <GerirSessao sessionId={sessao.id} terapeutas={terapeutas} />
            ) : null}
            {ehCoordenador || ehPropria ? (
              <Button asChild variante="secundaria">
                <Link href={`/diario/${sessao.id}`}>Abrir diário</Link>
              </Button>
            ) : null}
            {ehFalta && podeGerir ? (
              <Button asChild variante="secundaria">
                <Link
                  href={`/agenda/semana?repor=${sessao.id}&patientId=${sessao.patientId}&terapeutaId=${sessao.terapeutaId}&disciplina=${encodeURIComponent(sessao.disciplina)}`}
                >
                  Repor
                </Link>
              </Button>
            ) : null}
          </Cluster>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
