"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Pill } from "@/components/ui/primitives/pill";
import {
  MenuAcoes,
  type MenuAcaoItem,
} from "@/components/ui/primitives/menu-acoes";
import { DetalhesExpansiveis } from "@/components/ui/detalhes-expansivel";

export interface SupervisaoCardDetalhe {
  metrica?: string | null;
  tipoEstrutura?: string | null;
  sessionNumero?: number | null;
  faltas?: number | null;
  janelaSemanas?: number | null;
  limiar?: number | null;
}

export interface SupervisaoCardProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "children"
> {
  como?: "article" | "li" | "div";
  indice?: number;
  total?: number;
  patientId?: string;
  patientNome: string;
  patientHref?: string;
  tipo: "estagnacao" | "regressao" | "faltas_excessivas" | string;
  tipoRotulo?: string;
  goalNome?: string | null;
  protocolNome?: string | null;
  detalhe?: SupervisaoCardDetalhe | null;
  sinalPresente?: boolean;
  estado?: "novo" | "reconhecido" | string;
  /** CTA único e visível do card (ex: Reconhecer). */
  acaoPrimaria?: React.ReactNode;
  /** Ações de baixa ênfase, recolhidas no menu de reticências. */
  acoesSecundarias?: MenuAcaoItem[];
  erro?: React.ReactNode;
}

const rotulosPadraoTipo: Record<string, string> = {
  estagnacao: "Estagnação",
  regressao: "Regressão",
  faltas_excessivas: "Faltas",
};

/**
 * Formata os metadados clínicos de forma segura, omitindo valores indefinidos/nulos
 * e evitando strings poluídas como "(métrica undefined, sessão undefined)".
 */
function formatarMetadadosClinicos(
  tipo: string,
  detalhe?: SupervisaoCardDetalhe | null,
): string | null {
  if (!detalhe) return null;

  if (tipo === "faltas_excessivas") {
    const { faltas, janelaSemanas, limiar } = detalhe;
    const partes: string[] = [];
    if (typeof faltas === "number") {
      partes.push(`${faltas} faltas`);
    }
    if (typeof janelaSemanas === "number") {
      partes.push(`últimas ${janelaSemanas} semanas`);
    }
    if (typeof limiar === "number") {
      partes.push(`limiar: ${limiar}`);
    }
    return partes.length > 0 ? partes.join(" • ") : null;
  }

  const { sessionNumero, metrica, tipoEstrutura } = detalhe;
  const partes: string[] = [];

  if (
    typeof sessionNumero === "number" &&
    !isNaN(sessionNumero) &&
    sessionNumero > 0
  ) {
    partes.push(`Sessão ${sessionNumero}`);
  }

  if (
    metrica &&
    typeof metrica === "string" &&
    metrica.trim() !== "" &&
    metrica !== "undefined" &&
    metrica !== "null"
  ) {
    partes.push(`Métrica: ${metrica}`);
  }

  if (
    tipoEstrutura &&
    typeof tipoEstrutura === "string" &&
    tipoEstrutura.trim() !== "" &&
    tipoEstrutura !== "undefined" &&
    tipoEstrutura !== "null"
  ) {
    partes.push(`Área: ${tipoEstrutura}`);
  }

  return partes.length > 0 ? partes.join(" • ") : null;
}

/**
 * SupervisaoCard — Item da fila de supervisão clínica com revelação progressiva.
 *
 * A superfície mostra só o que decide a triagem: quem é o paciente, o que está
 * acontecendo com ele em uma frase, o estado essencial e um único CTA. Protocolo,
 * métrica, sessão e limiar são metadados de auditoria — vivem em "Ver detalhes
 * técnicos", e as ações de baixa ênfase, no menu de reticências.
 */
export const SupervisaoCard = React.forwardRef<
  HTMLElement,
  SupervisaoCardProps
>(function SupervisaoCard(
  {
    como = "li",
    indice,
    total,
    patientId,
    patientNome,
    patientHref,
    tipo,
    tipoRotulo,
    goalNome,
    protocolNome,
    detalhe,
    sinalPresente = true,
    estado = "novo",
    acaoPrimaria,
    acoesSecundarias,
    erro,
    className,
    ...props
  },
  ref,
) {
  const Component = como as React.ElementType;
  const href =
    patientHref ?? (patientId ? `/pacientes/${patientId}` : undefined);
  const metadadosTexto = formatarMetadadosClinicos(tipo, detalhe);
  const rotuloTipo = tipoRotulo ?? rotulosPadraoTipo[tipo] ?? tipo;

  // Configuração de Pill semântica para o tipo de alerta
  const alertaColorScheme =
    tipo === "regressao"
      ? "coral"
      : tipo === "estagnacao" || tipo === "faltas_excessivas"
        ? "ouro"
        : "neutral";

  const temDetalhes = Boolean(protocolNome || metadadosTexto);

  return (
    <Component
      ref={ref}
      aria-posinset={indice}
      aria-setsize={total}
      className={cn(
        "flex flex-col gap-3 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4 shadow-[var(--ds-shadow)] transition-all",
        className,
      )}
      {...props}
    >
      {/* Identificação do paciente + estado essencial + menu de reticências. */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
            {href ? (
              <Link
                href={href}
                className="focus-visible:outline-focus hover:underline"
              >
                {patientNome}
              </Link>
            ) : (
              patientNome
            )}
          </h3>

          <div
            role="group"
            aria-label="Status e criticidade do alerta"
            className="inline-flex flex-wrap items-center gap-1.5"
          >
            <Pill variant="solid" colorScheme={alertaColorScheme} size="sm">
              {rotuloTipo}
            </Pill>

            {!sinalPresente ? (
              <Pill variant="outline" colorScheme="coral" size="sm">
                Sinal cessou
              </Pill>
            ) : null}

            {estado === "reconhecido" ? (
              <Pill variant="inset" colorScheme="azul" size="sm">
                Reconhecido
              </Pill>
            ) : null}
          </div>
        </div>

        {acoesSecundarias && acoesSecundarias.length > 0 ? (
          <MenuAcoes
            itens={acoesSecundarias}
            rotulo={`Mais ações do alerta de ${patientNome}`}
            className="-mt-1 -mr-1 shrink-0"
          />
        ) : null}
      </div>

      {/* O que está acontecendo, em uma frase — sem caixa em volta. */}
      <p className="text-sm font-semibold text-[var(--text-primary)]">
        {goalNome
          ? goalNome
          : tipo === "faltas_excessivas"
            ? detalhe?.faltas
              ? `${detalhe.faltas} faltas consecutivas do paciente`
              : "Faltas consecutivas registradas"
            : "Alerta clínico registrado"}
      </p>

      {/* Metadados de auditoria sob demanda. */}
      {temDetalhes ? (
        <DetalhesExpansiveis rotulo="Ver detalhes técnicos">
          {protocolNome ? (
            <p>
              Protocolo:{" "}
              <span className="font-mono text-xs text-[var(--text-primary)]">
                {protocolNome}
              </span>
            </p>
          ) : null}
          {metadadosTexto ? (
            <p className="font-mono text-xs">{metadadosTexto}</p>
          ) : null}
        </DetalhesExpansiveis>
      ) : null}

      {/* CTA único. */}
      {acaoPrimaria ? (
        <div className="mt-auto flex justify-end">{acaoPrimaria}</div>
      ) : null}

      {erro ? <div>{erro}</div> : null}
    </Component>
  );
});
